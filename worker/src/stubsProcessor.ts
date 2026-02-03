/**
 * Gmail Stubs Processor (Phase 2 - Stub-Only Mode Consumer)
 * 
 * Processes stubs from gmail_stubs table created by stub-only webhook mode.
 * For each stub:
 * - Fetches Gmail messages via history.list API
 * - Parses email content directly (no storage dependency)
 * - Creates load_emails records
 * - Triggers hunt matching
 * 
 * This module is the VPS-side consumer for the cost-elimination architecture.
 * It is the SOLE owner of Gmail API calls and load processing.
 */

import { supabase } from './supabase.js';
import { 
  loadGmailToken, 
  getValidAccessToken, 
  fetchGmailHistoryWithMeta,
  fetchRecentMessages,
  fetchMessageFull,
  type GmailToken,
  type GmailMessage,
  type GmailMessageHeader,
  type HistoryFetchResult,
} from './historyQueue.js';
import { geocodeLocation, lookupCityFromZip, type Coordinates } from './geocode.js';
import { parseSylectusEmail, parseSubjectLine, type ParsedEmailData } from './parsers/sylectus.js';
import { parseFullCircleTMSEmail } from './parsers/fullcircle.js';
import {
  computeParsedLoadFingerprint,
  generateContentHash,
  FINGERPRINT_VERSION,
} from './fingerprint.js';
import { triggerBrokerCheck } from './brokerCheck.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

export interface GmailStub {
  id: string;
  tenant_id: string;
  email_address: string;
  history_id: string;
  status: string;
  attempts: number;
  queued_at: string;
  error: string | null;
}

export interface StubProcessResult {
  success: boolean;
  messagesProcessed: number;
  loadsCreated: number;
  error?: string;
}

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════

function log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, any>): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: `[stubsProcessor] ${message}`,
    ...meta,
  };

  if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify(entry));
  } else {
    const prefix = `[${entry.ts}] [${level.toUpperCase()}]`;
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    console.log(`${prefix} [stubsProcessor] ${message}${metaStr}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// CLAIM FUNCTIONS
// ═══════════════════════════════════════════════════════════════════════════

const CLAIM_TIMEOUT_MS = 30_000;

// Stub processor timeouts (hard caps to prevent hung awaits)
const STUB_MAX_RUNTIME_MS = parseInt(process.env.STUB_MAX_RUNTIME_MS || '120000', 10); // 120s
const FETCH_HISTORY_TIMEOUT_MS = parseInt(process.env.STUB_FETCH_HISTORY_TIMEOUT_MS || '30000', 10); // 30s
const FETCH_MESSAGE_FULL_TIMEOUT_MS = parseInt(process.env.STUB_FETCH_MESSAGE_FULL_TIMEOUT_MS || '45000', 10); // 45s
const FETCH_RECENT_MESSAGES_TIMEOUT_MS = parseInt(process.env.STUB_FETCH_RECENT_TIMEOUT_MS || '30000', 10); // 30s (FIX #3)
const CREATE_LOAD_TIMEOUT_MS = parseInt(process.env.STUB_CREATE_LOAD_TIMEOUT_MS || '60000', 10); // 60s (FIX #3)
const DB_READ_TIMEOUT_MS = parseInt(process.env.STUB_DB_READ_TIMEOUT_MS || '20000', 10); // 20s
const DB_WRITE_TIMEOUT_MS = parseInt(process.env.STUB_DB_WRITE_TIMEOUT_MS || '25000', 10); // 25s
const TOKEN_TIMEOUT_MS = parseInt(process.env.STUB_TOKEN_TIMEOUT_MS || '20000', 10); // 20s


async function withTimeout<T>(

  promiseLike: any,

  ms: number,

  label: string

): Promise<T> {

  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {

    timeoutId = setTimeout(() => {

      reject(new Error(`TIMEOUT: ${label} exceeded ${ms}ms`));

    }, ms);

  });

  try {

    const result = await Promise.race([

      Promise.resolve(promiseLike) as Promise<T>,

      timeoutPromise,

    ]);

    if (timeoutId) clearTimeout(timeoutId);

    return result as T;

  } catch (e) {

    if (timeoutId) clearTimeout(timeoutId);

    throw e;

  }

}

function stubStepStart(stub: GmailStub, step: string, extra?: Record<string, any>): void {
  log('info', 'STUB_STEP_START', {
    stub_id: stub.id,
    step,
    historyId: stub.history_id,
    ...extra,
  });
}

function stubStepEnd(stub: GmailStub, step: string, elapsedMs: number, extra?: Record<string, any>): void {
  log('info', 'STUB_STEP_END', {
    stub_id: stub.id,
    step,
    elapsed_ms: elapsedMs,
    ...extra,
  });
}

function stubStepError(stub: GmailStub, step: string, elapsedMs: number, error: unknown, extra?: Record<string, any>): void {
  log('error', 'STUB_STEP_ERROR', {
    stub_id: stub.id,
    step,
    elapsed_ms: elapsedMs,
    error: error instanceof Error ? error.message : String(error),
    ...extra,
  });
}

function stubDone(
  stub: GmailStub,
  summary: {
    messages_seen: number;
    deduped: number;
    loads_created: number;
    messages_failed: number;
    elapsed_ms: number;
    error?: string;
  }
): void {
  log('info', 'STUB_DONE', {
    stub_id: stub.id,
    historyId: stub.history_id,
    tenant: stub.tenant_id.substring(0, 8),
    email: stub.email_address,
    ...summary,
  });
}

/**
 * Claim a batch of gmail_stubs for processing.
 * Uses FOR UPDATE SKIP LOCKED for multi-worker safety.
 */
export async function claimStubsBatch(batchSize: number = 25): Promise<GmailStub[]> {
  try {
    const result = await withTimeout<{ data: any; error: any }>(
      supabase.rpc('claim_gmail_stubs_batch', { p_batch_size: batchSize }),
      CLAIM_TIMEOUT_MS,
      'claim_gmail_stubs_batch'
    );

    if (result.error) {
      log('error', 'Error claiming stubs batch', { error: result.error.message });
      return [];
    }

    const claimed = (result.data || []) as GmailStub[];
    if (claimed.length > 0) {
      log('info', `Claimed ${claimed.length} stubs for processing`);
    }
    return claimed;
  } catch (err: any) {
    const isTimeout = err?.message?.includes('TIMEOUT');
    log('error', 'claimStubsBatch error', { isTimeout, message: err?.message });
    return [];
  }
}

/**
 * Mark a stub as completed.
 * FIX #1: Timeout is INSIDE this function. Callers should NOT wrap with withTimeout.
 */
export async function completeStub(id: string): Promise<void> {
  // BLOCKER #1 FIX: Treat RPC result as any and check res?.error safely
  // Supabase returns { data, error } - avoid generic type mismatch
  const res: any = await withTimeout(
    supabase.rpc('complete_gmail_stub', { p_id: id }),
    DB_WRITE_TIMEOUT_MS,
    'complete_gmail_stub'
  );
  if (res?.error) throw new Error(`complete_gmail_stub: ${res.error.message || res.error}`);
}

/**
 * Mark a stub as failed with error message.
 * FIX #1: Timeout is INSIDE this function. Callers should NOT wrap with withTimeout.
 */
export async function failStub(id: string, errorMessage: string): Promise<void> {
  // BLOCKER #1 FIX: Treat RPC result as any and check res?.error safely
  // Supabase returns { data, error } - avoid generic type mismatch
  const res: any = await withTimeout(
    supabase.rpc('fail_gmail_stub', {
      p_id: id,
      p_error: errorMessage,
    }),
    DB_WRITE_TIMEOUT_MS,
    'fail_gmail_stub'
  );
  if (res?.error) throw new Error(`fail_gmail_stub: ${res.error.message || res.error}`);
}

// ═══════════════════════════════════════════════════════════════════════════
// MESSAGE PARSING (adapted from inbound.ts for direct Gmail message processing)
// ═══════════════════════════════════════════════════════════════════════════

function extractEmailFromHeader(value: string): string | null {
  const angleMatch = value.match(/<([^>]+@[^>]+)>/);
  if (angleMatch) return angleMatch[1].toLowerCase();
  if (value.includes('@')) return value.split(',')[0].trim().toLowerCase();
  return null;
}

function getHeaderValue(headers: GmailMessageHeader[], name: string): string | null {
  const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || null;
}

function decodeBase64Url(encoded: string): string {
  // Replace URL-safe characters
  const base64 = encoded.replace(/-/g, '+').replace(/_/g, '/');
  // Pad if necessary
  const padded = base64.padEnd(base64.length + (4 - base64.length % 4) % 4, '=');
  return Buffer.from(padded, 'base64').toString('utf-8');
}

function extractBodyFromMessage(message: GmailMessage): { text: string | null; html: string | null } {
  let text: string | null = null;
  let html: string | null = null;

  const extractFromParts = (parts: any[]): void => {
    for (const part of parts) {
      if (part.mimeType === 'text/plain' && part.body?.data && !text) {
        text = decodeBase64Url(part.body.data);
      } else if (part.mimeType === 'text/html' && part.body?.data && !html) {
        html = decodeBase64Url(part.body.data);
      } else if (part.parts) {
        extractFromParts(part.parts);
      }
    }
  };

  // Check top-level body
  if (message.payload.body?.data) {
    const mimeType = message.payload.mimeType || '';
    const decoded = decodeBase64Url(message.payload.body.data);
    if (mimeType.includes('text/plain')) {
      text = decoded;
    } else if (mimeType.includes('text/html')) {
      html = decoded;
    } else {
      // Assume text if not specified
      text = decoded;
    }
  }

  // Check parts
  if (message.payload.parts) {
    extractFromParts(message.payload.parts);
  }

  return { text, html };
}

/**
 * Strip HTML tags to synthesize plain text from HTML content.
 * Used when email only has body_html and no body_text.
 */
function stripHtmlToText(html: string): string {
  if (!html) return '';
  return html
    .replace(/<br\s*\/?>/gi, '\n')          // Convert <br> to newlines
    .replace(/<\/p>/gi, '\n')               // Convert </p> to newlines
    .replace(/<\/div>/gi, '\n')             // Convert </div> to newlines
    .replace(/<\/tr>/gi, '\n')              // Convert </tr> to newlines
    .replace(/<\/td>/gi, ' ')               // Convert </td> to spaces
    .replace(/<[^>]*>/g, '')                // Remove all remaining HTML tags
    .replace(/&nbsp;/gi, ' ')               // Convert &nbsp; to spaces
    .replace(/&amp;/gi, '&')                // Convert &amp; to &
    .replace(/&lt;/gi, '<')                 // Convert &lt; to <
    .replace(/&gt;/gi, '>')                 // Convert &gt; to >
    .replace(/&quot;/gi, '"')               // Convert &quot; to "
    .replace(/&#39;/gi, "'")                // Convert &#39; to '
    .replace(/\s+/g, ' ')                   // Collapse multiple whitespace
    .trim();
}

// ═══════════════════════════════════════════════════════════════════════════
// LOAD CREATION (adapted from inbound.ts)
// ═══════════════════════════════════════════════════════════════════════════

async function createLoadFromMessage(
  message: GmailMessage,
  tenantId: string,
  emailAddress: string
): Promise<{ success: boolean; loadId?: string; error?: string }> {
  const headers = message.payload.headers;
  const subject = getHeaderValue(headers, 'Subject') || '';
  const fromEmail = extractEmailFromHeader(getHeaderValue(headers, 'From') || '');
  const { text: rawBodyText, html: bodyHtml } = extractBodyFromMessage(message);
  
  // Synthesize body_text from HTML if plain text is missing
  const bodyText = rawBodyText || (bodyHtml ? stripHtmlToText(bodyHtml) : '');
  
  const messageId = message.id;
  const internalDate = message.internalDate 
    ? new Date(parseInt(message.internalDate)).toISOString()
    : new Date().toISOString();

  // Check if already exists FOR THIS TENANT (multi-tenant correctness)
  // Gmail message IDs are globally unique, but we scope by tenant to prevent
  // one tenant's ingestion from blocking another (defense-in-depth)
  // BLOCKER #2 FIX: Defensive dedupe with explicit typeof check
  const dedupeQuery = supabase
    .from('load_emails')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('email_id', messageId);
  
  const res: any = await withTimeout(dedupeQuery, DB_READ_TIMEOUT_MS, 'dedupe_check_load_emails');
  if (res?.error) throw new Error(`dedupe_check_load_emails: ${res.error.message || res.error}`);
  
  // Defensive: ensure count is a number, log if missing for debugging
  const existingCount = (typeof res?.count === 'number') ? res.count : 0;
  if (res?.count === null || res?.count === undefined) {
    log('debug', 'dedupe count returned null/undefined, treating as 0', { messageId, tenant: tenantId.substring(0, 8) });
  }

  if (existingCount > 0) {
    log('debug', 'Message already processed for this tenant', { messageId, tenant: tenantId.substring(0, 8) });
    return { success: true, loadId: undefined };
  }

  // Step 1: Always parse subject line first for route/load data
  const subjectData = parseSubjectLine(subject);
  
  // Step 2: Determine email source and parse body with correct arguments
  // NOTE: parseSylectusEmail internally strips HTML, so passing bodyHtml as fallback works
  let bodyData: ParsedEmailData | null = null;
  let emailSource = 'unknown';

  if (subject?.toLowerCase().includes('sylectus') || 
      bodyText?.toLowerCase().includes('sylectus') ||
      bodyHtml?.toLowerCase().includes('sylectus')) {
    // Pass bodyHtml as fallback when bodyText is empty - parser handles HTML stripping
    bodyData = parseSylectusEmail(subject, bodyText || bodyHtml || '');
    emailSource = 'sylectus';
  } else if (subject?.toLowerCase().includes('fullcircle') ||
             subject?.toLowerCase().includes('full circle') ||
             fromEmail?.toLowerCase().includes('fullcircle') ||
             bodyText?.toLowerCase().includes('fullcircletms') ||
             bodyHtml?.toLowerCase().includes('fullcircletms')) {
    // FIXED: parseFullCircleTMSEmail expects (subject, bodyText, bodyHtml?) - was reversed!
    bodyData = parseFullCircleTMSEmail(subject, bodyText || '', bodyHtml || undefined);
    emailSource = 'fullcircle';
  } else {
    emailSource = 'generic';
  }

  // Step 3: DEFENSIVE MERGE - Filter out undefined/null values to prevent overwrites
  // Subject data provides base, body data supplements/overrides with real values only
  const filterDefined = (obj: Record<string, any> | null): Record<string, any> => {
    if (!obj) return {};
    return Object.fromEntries(
      Object.entries(obj).filter(([_, v]) => v !== undefined && v !== null && v !== '')
    );
  };
  
  const cleanSubject = filterDefined(subjectData);
  const cleanBody = filterDefined(bodyData);
  const parsedData: ParsedEmailData = { ...cleanSubject, ...cleanBody } as ParsedEmailData;

  // VALIDATION LOGGING: Warn if critical fields are missing after merge
  const criticalFields = ['pickup_time', 'pickup_date', 'delivery_time', 'delivery_date', 'pieces', 'dimensions', 'weight'];
  const missingFields = criticalFields.filter(f => !(parsedData as any)[f]);
  if (missingFields.length > 0) {
    log('warn', `Missing critical fields after merge: ${missingFields.join(', ')}`, { subject: subject?.substring(0, 60) });
  }

  // Check if we got any meaningful data
  if (!parsedData.origin_city && !parsedData.destination_city && !parsedData.pickup_date) {
    log('warn', 'Could not parse email - no route data found', { messageId, subject: subject?.substring(0, 50) });
    return { success: false, error: 'parse_failed' };
  }

  // Geocode origin
  let pickupCoords: Coordinates | null = null;
  if (parsedData.origin_city && parsedData.origin_state) {
    try {
      pickupCoords = await geocodeLocation(parsedData.origin_city, parsedData.origin_state);
    } catch (e) {
      log('warn', 'Geocoding failed', { error: String(e) });
    }
  } else if (parsedData.origin_zip) {
    try {
      const cityState = await lookupCityFromZip(parsedData.origin_zip);
      if (cityState) {
        parsedData.origin_city = cityState.city;
        parsedData.origin_state = cityState.state;
        pickupCoords = await geocodeLocation(cityState.city, cityState.state);
      }
    } catch (e) {
      log('warn', 'Zip lookup failed', { error: String(e) });
    }
  }

  // Compute fingerprint
  const fingerprintBasis: Record<string, any> = {
    origin_city: parsedData.origin_city,
    origin_state: parsedData.origin_state,
    destination_city: parsedData.destination_city,
    destination_state: parsedData.destination_state,
    pickup_date: parsedData.pickup_date,
    vehicle_type: parsedData.vehicle_type,
  };

  const contentHash = generateContentHash(fingerprintBasis);
  const fingerprintResult = computeParsedLoadFingerprint(fingerprintBasis);
  const fingerprint = fingerprintResult.fingerprint;

  // Insert load_email record with ON CONFLICT handling for concurrency safety
  const insertResult = await withTimeout<{ data: any; error: any }>(
    supabase
      .from('load_emails')
      .upsert(
        {
          tenant_id: tenantId,
          email_id: messageId,
          thread_id: message.threadId,
          from_email: fromEmail,
          subject,
          body_text: bodyText?.substring(0, 50000),
          body_html: bodyHtml?.substring(0, 100000),
          received_at: internalDate,
          email_source: emailSource,
          status: 'active',
          parsed_data: parsedData,
          pickup_coordinates: pickupCoords ? { lat: pickupCoords.lat, lng: pickupCoords.lng } : null,
          content_hash: contentHash,
          parsed_load_fingerprint: fingerprint,
          fingerprint_version: FINGERPRINT_VERSION,
          dedup_eligible: !!fingerprint,
          dedup_eligible_reason: fingerprint ? 'has_fingerprint' : 'missing_fingerprint',
        },
        {
          onConflict: 'email_id',
          ignoreDuplicates: true,
        }
      )
      .select('id, load_id')
      .maybeSingle(),
    DB_WRITE_TIMEOUT_MS,
    'upsert_load_emails'
  );

  const inserted = insertResult.data;
  const insertError = insertResult.error;

  // Handle conflict as success (another worker already processed this)
  if (insertError) {
    // Check if it's a duplicate key error - treat as success
    if (insertError.code === '23505' || insertError.message?.includes('duplicate key')) {
      log('debug', 'Duplicate email_id, already processed by another worker', { messageId });
      return { success: true, loadId: undefined };
    }
    log('error', 'Failed to insert load_email', { error: insertError.message, messageId });
    return { success: false, error: insertError.message };
  }

  // If no row returned (conflict with ignoreDuplicates), treat as success
  if (!inserted) {
    log('debug', 'Email already exists (upsert returned null)', { messageId });
    return { success: true, loadId: undefined };
  }

  log('info', 'Created load_email', { 
    loadId: inserted.load_id, 
    messageId,
    source: emailSource,
    tenant: tenantId.substring(0, 8)
  });

  // Trigger matching (async, don't wait)
  triggerMatching(inserted.id, inserted.load_id, pickupCoords, tenantId, fingerprint, new Date(internalDate), parsedData)
    .catch(err => log('warn', 'Matching failed', { error: String(err) }));

  return { success: true, loadId: inserted.load_id };
}

async function triggerMatching(
  loadEmailId: string,
  loadId: string,
  pickupCoords: Coordinates | null,
  tenantId: string,
  fingerprint: string | null,
  receivedAt: Date,
  parsedData: ParsedEmailData
): Promise<void> {
  // Simplified matching - get enabled hunt plans for tenant
  const huntsResult = await withTimeout<{ data: any; error: any }>(
    supabase
      .from('hunt_plans')
      .select('id, vehicle_id, hunt_coordinates, pickup_radius, tenant_id')
      .eq('enabled', true)
      .eq('tenant_id', tenantId),
    DB_READ_TIMEOUT_MS,
    'match_fetch_hunt_plans'
  );
  const hunts = huntsResult.data as any[] | null;

  if (!hunts?.length || !pickupCoords) return;

  const loadCoords = pickupCoords;

  for (const hunt of hunts) {
    const huntCoords = hunt.hunt_coordinates as { lat: number; lng: number } | null;
    if (!huntCoords?.lat || !huntCoords?.lng) continue;

    // Haversine distance
    const R = 3959;
    const dLat = (huntCoords.lat - loadCoords.lat) * Math.PI / 180;
    const dLon = (huntCoords.lng - loadCoords.lng) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(loadCoords.lat * Math.PI / 180) * Math.cos(huntCoords.lat * Math.PI / 180) *
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const distance = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));

    if (distance > parseFloat(hunt.pickup_radius || '200')) continue;

    // Check cooldown
    if (fingerprint) {
      const shouldTriggerResult = await withTimeout<{ data: any; error: any }>(
        supabase.rpc('should_trigger_hunt_for_fingerprint', {
          p_tenant_id: tenantId,
          p_hunt_plan_id: hunt.id,
          p_fingerprint: fingerprint,
          p_received_at: receivedAt.toISOString(),
          p_cooldown_seconds: 60,
          p_last_load_email_id: loadEmailId,
        }),
        DB_READ_TIMEOUT_MS,
        'should_trigger_hunt_for_fingerprint'
      );
      const shouldTrigger = shouldTriggerResult.data as boolean;
      if (!shouldTrigger) continue;
    }

    // Insert match and get the ID
    const insertedMatchResult = await withTimeout<{ data: any; error: any }>(
      supabase
        .from('load_hunt_matches')
        .insert({
          load_email_id: loadEmailId,
          hunt_plan_id: hunt.id,
          vehicle_id: hunt.vehicle_id,
          distance_miles: Math.round(distance),
          is_active: true,
          match_status: 'active',
          matched_at: new Date().toISOString(),
          tenant_id: tenantId,
        })
        .select('id')
        .single(),
      DB_WRITE_TIMEOUT_MS,
      'insert_load_hunt_matches'
    );
    const insertedMatch = insertedMatchResult.data;

    // Trigger broker credit check (fire-and-forget)
    if (insertedMatch) {
      triggerBrokerCheck(tenantId, loadEmailId, parsedData, insertedMatch.id);
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN STUB PROCESSOR
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Process a single gmail_stub.
 * 1. Load Gmail token for the email address
 * 2. Fetch history.list since the history_id
 * 3. For each new message, fetch full content and create load_email
 * 4. Mark stub as completed
 */
export async function processStub(stub: GmailStub): Promise<StubProcessResult> {
  const startTime = Date.now();

  // Counters for STUB_DONE (tracked across both success + failure paths)
  let messagesProcessed = 0;
  let loadsCreated = 0;
  let deduped = 0;
  let messagesFailed = 0;
  let messagesSeen = 0;
  log('info', 'Processing stub', { 
    id: stub.id.substring(0, 8), 
    email: stub.email_address,
    historyId: stub.history_id,
    tenant: stub.tenant_id.substring(0, 8)
  });

  try {
    const ensureWithinBudget = (): void => {
      if (Date.now() - startTime > STUB_MAX_RUNTIME_MS) {
        throw new Error('stub_processing_timeout');
      }
    };

    // Step 0: Load Gmail token
    ensureWithinBudget();
    const token = await withTimeout<GmailToken | null>(
      loadGmailToken(stub.email_address),
      TOKEN_TIMEOUT_MS,
      'loadGmailToken'
    );
    if (!token) throw new Error('no_gmail_token');

    // Step 0b: Get valid access token (refresh if needed)
    ensureWithinBudget();
    const accessToken = await withTimeout<string | null>(
      getValidAccessToken(token),
      TOKEN_TIMEOUT_MS,
      'getValidAccessToken'
    );
    if (!accessToken) throw new Error('access_token_unavailable');

    // Step: fetchHistory
    ensureWithinBudget();
    const fetchHistoryStepStart = Date.now();
    stubStepStart(stub, 'fetchHistory');
    let historyResult: HistoryFetchResult;
    try {
      historyResult = await withTimeout<HistoryFetchResult>(
        fetchGmailHistoryWithMeta(accessToken, stub.email_address, stub.history_id),
        FETCH_HISTORY_TIMEOUT_MS,
        'fetchHistory'
      );
      stubStepEnd(stub, 'fetchHistory', Date.now() - fetchHistoryStepStart, {
        message_count: historyResult.messageIds?.length ?? 0,
        historyEmpty: historyResult.historyEmpty,
      });
    } catch (e) {
      stubStepError(stub, 'fetchHistory', Date.now() - fetchHistoryStepStart, e);
      throw e;
    }
    
    let messageIds = historyResult.messageIds;
    
    // CRITICAL FIX: If history returned 0 messages, verify via messages.list
    // This prevents advancing the cursor when Gmail has history gaps
    if (messageIds.length === 0 && historyResult.historyEmpty) {
      log('warn', 'History returned 0, verifying via messages.list', { 
        stubId: stub.id.substring(0, 8),
        historyId: stub.history_id 
      });
      
      // Check for recent messages in the last 30 minutes
      // FIX #3: Use correct timeout constant for fetchRecentMessages
      const recentCheck = await withTimeout<{ messageIds: string[]; hasNewer: boolean }>(
        fetchRecentMessages(accessToken, stub.email_address, 50, 30),
        FETCH_RECENT_MESSAGES_TIMEOUT_MS,
        'fetchRecentMessages'
      );
      
      if (recentCheck.hasNewer && recentCheck.messageIds.length > 0) {
        // HISTORY GAP DETECTED! Gmail has messages that history.list didn't return
        log('warn', 'HISTORY GAP DETECTED! Found messages via messages.list that history missed', {
          stubId: stub.id.substring(0, 8),
          historyId: stub.history_id,
          recentMessageCount: recentCheck.messageIds.length,
        });
        
        // Filter to only messages we haven't already processed
        const existingIds = await withTimeout<string[]>(
          getExistingEmailIds(stub.tenant_id, recentCheck.messageIds),
          DB_READ_TIMEOUT_MS,
          'getExistingEmailIds'
        );
        messageIds = recentCheck.messageIds.filter(id => !existingIds.includes(id));
        
        log('info', 'Backfilling missing messages', {
          stubId: stub.id.substring(0, 8),
          totalRecent: recentCheck.messageIds.length,
          alreadyExists: existingIds.length,
          toBackfill: messageIds.length,
        });
        
        // Log gap event for monitoring
        await withTimeout<void>(
          logHistoryGapEvent(stub.tenant_id, stub.email_address, stub.history_id, messageIds.length),
          DB_WRITE_TIMEOUT_MS,
          'logHistoryGapEvent'
        );
      } else {
      // Truly no new messages - safe to complete
        const completeStepStart = Date.now();
        stubStepStart(stub, 'completeStub', { reason: 'no_new_messages_via_recent' });
        // FIX #1: completeStub has internal timeout, no double-wrap
        await completeStub(stub.id);
        stubStepEnd(stub, 'completeStub', Date.now() - completeStepStart, { reason: 'no_new_messages_via_recent' });

        stubDone(stub, {
          messages_seen: 0,
          deduped: 0,
          loads_created: 0,
          messages_failed: 0,
          elapsed_ms: Date.now() - startTime,
        });
        log('debug', 'No new messages confirmed via messages.list', { stubId: stub.id.substring(0, 8) });
        return { success: true, messagesProcessed: 0, loadsCreated: 0 };
      }
    }
    
    if (messageIds.length === 0) {
      // No messages to process after all checks
      const completeStepStart = Date.now();
      stubStepStart(stub, 'completeStub', { reason: 'no_message_ids' });
      // FIX #1: completeStub has internal timeout, no double-wrap
      await completeStub(stub.id);
      stubStepEnd(stub, 'completeStub', Date.now() - completeStepStart, { reason: 'no_message_ids' });

      stubDone(stub, {
        messages_seen: 0,
        deduped: 0,
        loads_created: 0,
        messages_failed: 0,
        elapsed_ms: Date.now() - startTime,
      });
      return { success: true, messagesProcessed: 0, loadsCreated: 0 };
    }

    log('info', `Found ${messageIds.length} messages to process`, { stubId: stub.id.substring(0, 8) });

    // Step 4: Process each message

    for (const messageId of messageIds) {
      ensureWithinBudget();
      try {
        // perMessage: fetchMessageFull
        const fetchMessageStepStart = Date.now();
        stubStepStart(stub, 'fetchMessageFull', { messageId });
        let message: GmailMessage | null;
        try {
          message = await withTimeout<GmailMessage | null>(
            fetchMessageFull(accessToken, stub.email_address, messageId),
            FETCH_MESSAGE_FULL_TIMEOUT_MS,
            'fetchMessageFull'
          );
          stubStepEnd(stub, 'fetchMessageFull', Date.now() - fetchMessageStepStart, { messageId });
        } catch (e) {
          stubStepError(stub, 'fetchMessageFull', Date.now() - fetchMessageStepStart, e, { messageId });
          throw e;
        }

        if (!message) {
          log('warn', 'Failed to fetch message', { messageId });
          messagesFailed++;
          continue;
        }
        messagesSeen++;

        // createLoadFromMessage
        // FIX #3: Use CREATE_LOAD_TIMEOUT_MS (60s) instead of FETCH_MESSAGE_FULL_TIMEOUT_MS
        const createLoadStepStart = Date.now();
        stubStepStart(stub, 'createLoadFromMessage', { messageId });
        let result: { success: boolean; loadId?: string; error?: string };
        try {
          result = await withTimeout<{ success: boolean; loadId?: string; error?: string }>(
            createLoadFromMessage(message, stub.tenant_id, stub.email_address),
            CREATE_LOAD_TIMEOUT_MS,
            'createLoadFromMessage'
          );
          stubStepEnd(stub, 'createLoadFromMessage', Date.now() - createLoadStepStart, {
            messageId,
            success: result.success,
            has_load_id: !!result.loadId,
            error: result.error,
          });
        } catch (e) {
          stubStepError(stub, 'createLoadFromMessage', Date.now() - createLoadStepStart, e, { messageId });
          throw e;
        }

        messagesProcessed++;
        if (result.success && result.loadId) {
          loadsCreated++;
        } else if (result.success && !result.loadId) {
          deduped++;
        }
      } catch (msgErr) {
        messagesFailed++;
        log('error', 'Error processing message', { 
          messageId, 
          error: msgErr instanceof Error ? msgErr.message : String(msgErr) 
        });
      }
    }

    // Step 5: Mark stub as completed
    // FIX #1: completeStub has internal timeout, no double-wrap
    ensureWithinBudget();
    const completeStepStart = Date.now();
    stubStepStart(stub, 'completeStub');
    try {
      await completeStub(stub.id);
      stubStepEnd(stub, 'completeStub', Date.now() - completeStepStart);
    } catch (e) {
      stubStepError(stub, 'completeStub', Date.now() - completeStepStart, e);
      throw e;
    }

    const elapsed = Date.now() - startTime;
    log('info', 'Stub processed', {
      id: stub.id.substring(0, 8),
      messagesProcessed,
      loadsCreated,
      elapsed_ms: elapsed,
    });

    stubDone(stub, {
      messages_seen: messagesSeen,
      deduped,
      loads_created: loadsCreated,
      messages_failed: messagesFailed,
      elapsed_ms: elapsed,
    });

    return { success: true, messagesProcessed, loadsCreated };

  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    log('error', 'Stub processing failed', { 
      id: stub.id.substring(0, 8), 
      error: errorMessage 
    });

    // Ensure stub ends in failed state (never leave "processing" indefinitely)
    // FIX #1: failStub has internal timeout, no double-wrap
    // FIX #5: Always finalize - this catch block guarantees stub ends completed OR failed
    const failStepStart = Date.now();
    stubStepStart(stub, 'failStub', { reason: errorMessage });
    try {
      await failStub(stub.id, errorMessage);
      stubStepEnd(stub, 'failStub', Date.now() - failStepStart, { reason: errorMessage });
    } catch (e) {
      stubStepError(stub, 'failStub', Date.now() - failStepStart, e, { reason: errorMessage });
    }

    stubDone(stub, {
      messages_seen: messagesSeen,
      deduped,
      loads_created: loadsCreated,
      messages_failed: messagesFailed,
      elapsed_ms: Date.now() - startTime,
      error: errorMessage,
    });
    return { success: false, messagesProcessed: 0, loadsCreated: 0, error: errorMessage };
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// HELPER FUNCTIONS FOR HISTORY GAP DETECTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Check which email_ids already exist in load_emails table.
 * Used to filter out already-processed messages during backfill.
 */
async function getExistingEmailIds(tenantId: string, emailIds: string[]): Promise<string[]> {
  if (emailIds.length === 0) return [];
  
  try {
    const result = await withTimeout<{ data: any; error: any }>(
      supabase
        .from('load_emails')
        .select('email_id')
        .eq('tenant_id', tenantId)
        .in('email_id', emailIds),
      DB_READ_TIMEOUT_MS,
      'getExistingEmailIds'
    );
    const data = result.data;
    const error = result.error;
    
    if (error) {
      log('error', 'Failed to check existing email_ids', { error: error.message });
      return [];
    }
    
    return (data || []).map(row => row.email_id);
  } catch (err) {
    log('error', 'Exception checking existing email_ids', { 
      error: err instanceof Error ? err.message : String(err) 
    });
    return [];
  }
}

/**
 * Log a history gap event for monitoring and debugging.
 */
async function logHistoryGapEvent(
  tenantId: string, 
  emailAddress: string, 
  historyId: string, 
  backfilledCount: number
): Promise<void> {
  try {
    await withTimeout(
      supabase.from('circuit_breaker_events').insert({
        tenant_id: tenantId,
        email_address: emailAddress,
        history_id: historyId,
        breaker_type: 'history_gap_detected',
        reason: `Backfilled ${backfilledCount} messages missed by history.list`,
      }),
      DB_WRITE_TIMEOUT_MS,
      'logHistoryGapEvent_insert'
    );
  } catch (err) {
    log('warn', 'Failed to log history gap event', { 
      error: err instanceof Error ? err.message : String(err) 
    });
  }
}
