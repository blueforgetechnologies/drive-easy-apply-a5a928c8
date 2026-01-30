/**
 * Gmail History Queue Processor (Phase 7B)
 * 
 * Processes stubs from gmail_history_queue created by ENQUEUE_ONLY mode.
 * For each stub: refreshes tokens, fetches messages via Gmail API,
 * stores payloads to Supabase Storage, and inserts into email_queue.
 */

import { supabase } from './supabase.js';
import { HistoryQueueItem, completeHistoryItem, failHistoryItem } from './claim.js';

// ═══════════════════════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════════════════════

interface GmailToken {
  id: string;
  user_email: string;
  tenant_id: string;
  access_token: string;
  refresh_token: string;
  token_expiry: string | null;
}

interface GmailHistoryMessage {
  id: string;
  threadId?: string;
}

interface GmailHistoryEntry {
  id: string;
  messagesAdded?: Array<{ message: GmailHistoryMessage }>;
}

interface GmailHistoryResponse {
  history?: GmailHistoryEntry[];
  historyId?: string;
  nextPageToken?: string;
}

interface GmailMessageHeader {
  name: string;
  value: string;
}

interface GmailMessagePayload {
  headers: GmailMessageHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
  mimeType?: string;
}

interface GmailMessagePart {
  mimeType?: string;
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  historyId?: string;
  internalDate?: string;
  payload: GmailMessagePayload;
  raw?: string;
}

// Routing headers to extract alias from
const ROUTING_HEADERS = [
  'Delivered-To',
  'X-Original-To',
  'X-Gm-Original-To',
  'X-Forwarded-To',
  'Envelope-To',
  'To',
  'Cc',
];

// ═══════════════════════════════════════════════════════════════════════════
// LOGGING
// ═══════════════════════════════════════════════════════════════════════════

function log(level: 'debug' | 'info' | 'warn' | 'error', message: string, meta?: Record<string, any>): void {
  const entry = {
    ts: new Date().toISOString(),
    level,
    msg: `[historyQueue] ${message}`,
    ...meta,
  };

  if (process.env.NODE_ENV === 'production') {
    console.log(JSON.stringify(entry));
  } else {
    const prefix = `[${entry.ts}] [${level.toUpperCase()}]`;
    const metaStr = meta ? ` ${JSON.stringify(meta)}` : '';
    console.log(`${prefix} [historyQueue] ${message}${metaStr}`);
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TOKEN MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Load Gmail token for an email address.
 */
async function loadGmailToken(emailAddress: string): Promise<GmailToken | null> {
  const { data, error } = await supabase
    .from('gmail_tokens')
    .select('id, user_email, tenant_id, access_token, refresh_token, token_expiry')
    .eq('user_email', emailAddress)
    .maybeSingle();

  if (error) {
    log('error', 'Failed to load gmail token', { email: emailAddress, error: error.message });
    return null;
  }

  return data as GmailToken | null;
}

/**
 * Check if token is expired (with 5 minute buffer).
 */
function isTokenExpired(token: GmailToken): boolean {
  if (!token.token_expiry) return true;
  
  const expiryTime = new Date(token.token_expiry).getTime();
  const bufferMs = 5 * 60 * 1000; // 5 minutes
  return Date.now() > (expiryTime - bufferMs);
}

/**
 * Refresh Gmail access token using refresh_token.
 */
async function refreshGmailToken(token: GmailToken): Promise<string | null> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    log('error', 'GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET not configured');
    return null;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: token.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      log('error', 'Token refresh failed', { 
        email: token.user_email, 
        status: response.status, 
        error: errorText 
      });
      
      // Mark token as needing reauth
      await supabase
        .from('gmail_tokens')
        .update({ 
          needs_reauth: true, 
          reauth_reason: `Refresh failed: ${response.status}` 
        })
        .eq('id', token.id);
      
      return null;
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    const newAccessToken = data.access_token;
    const expiresIn = data.expires_in || 3600;
    const newExpiry = new Date(Date.now() + expiresIn * 1000).toISOString();

    // Update token in database
    const { error: updateError } = await supabase
      .from('gmail_tokens')
      .update({
        access_token: newAccessToken,
        token_expiry: newExpiry,
        updated_at: new Date().toISOString(),
        needs_reauth: false,
        reauth_reason: null,
      })
      .eq('id', token.id);

    if (updateError) {
      log('warn', 'Failed to persist refreshed token', { email: token.user_email, error: updateError.message });
    } else {
      log('info', 'Token refreshed successfully', { email: token.user_email });
    }

    return newAccessToken;
  } catch (error) {
    log('error', 'Token refresh exception', { 
      email: token.user_email, 
      error: error instanceof Error ? error.message : String(error) 
    });
    return null;
  }
}

/**
 * Get a valid access token (refresh if needed).
 */
async function getValidAccessToken(token: GmailToken): Promise<string | null> {
  if (!isTokenExpired(token)) {
    return token.access_token;
  }

  log('info', 'Token expired, refreshing...', { email: token.user_email });
  return refreshGmailToken(token);
}

// ═══════════════════════════════════════════════════════════════════════════
// GMAIL API CALLS
// ═══════════════════════════════════════════════════════════════════════════

// Gmail API fetch timeout (15 seconds) to prevent hangs blocking the worker loop
const GMAIL_FETCH_TIMEOUT_MS = 15000;

/**
 * Helper to fetch with AbortController timeout.
 */
async function fetchWithTimeout(
  url: string, 
  options: RequestInit, 
  timeoutMs: number = GMAIL_FETCH_TIMEOUT_MS
): Promise<Response> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  
  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeoutId);
  }
}

/**
 * Fetch history entries starting from a given historyId.
 */
async function fetchGmailHistory(
  accessToken: string, 
  emailAddress: string, 
  startHistoryId: string
): Promise<string[]> {
  const messageIds: string[] = [];
  let pageToken: string | undefined;

  try {
    do {
      const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/${emailAddress}/history`);
      url.searchParams.set('startHistoryId', startHistoryId);
      url.searchParams.set('historyTypes', 'messageAdded');
      if (pageToken) {
        url.searchParams.set('pageToken', pageToken);
      }

      const response = await fetchWithTimeout(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });

      if (!response.ok) {
        const errorText = await response.text();
        log('error', 'History.list failed', { 
          email: emailAddress, 
          status: response.status, 
          error: errorText 
        });
        break;
      }

      const data = await response.json() as GmailHistoryResponse;
      
      // Extract messageIds from history entries
      if (data.history) {
        for (const entry of data.history) {
          if (entry.messagesAdded) {
            for (const added of entry.messagesAdded) {
              if (added.message?.id && !messageIds.includes(added.message.id)) {
                messageIds.push(added.message.id);
              }
            }
          }
        }
      }

      pageToken = data.nextPageToken;
    } while (pageToken);

    log('info', 'History fetched', { email: emailAddress, messageCount: messageIds.length });
    return messageIds;
  } catch (error) {
    // Handle AbortError specifically for timeout
    if (error instanceof Error && error.name === 'AbortError') {
      log('error', 'History fetch TIMEOUT (15s)', { email: emailAddress });
      return [];
    }
    log('error', 'History fetch exception', { 
      email: emailAddress, 
      error: error instanceof Error ? error.message : String(error) 
    });
    return [];
  }
}

/**
 * Fetch message with metadata headers for routing.
 */
async function fetchMessageMetadata(
  accessToken: string, 
  emailAddress: string, 
  messageId: string
): Promise<GmailMessageHeader[] | null> {
  try {
    // Build URL with repeated metadataHeaders parameters
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/${emailAddress}/messages/${messageId}`);
    url.searchParams.set('format', 'metadata');
    for (const header of ROUTING_HEADERS) {
      url.searchParams.append('metadataHeaders', header);
    }
    url.searchParams.append('metadataHeaders', 'From');
    url.searchParams.append('metadataHeaders', 'Subject');
    url.searchParams.append('metadataHeaders', 'Return-Path');

    const response = await fetchWithTimeout(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log('error', 'Message metadata fetch failed', { 
        messageId, 
        status: response.status, 
        error: errorText 
      });
      return null;
    }

    const data = await response.json() as GmailMessage;
    return data.payload?.headers || [];
  } catch (error) {
    // Handle AbortError specifically for timeout
    if (error instanceof Error && error.name === 'AbortError') {
      log('error', 'Message metadata fetch TIMEOUT (15s)', { messageId });
      return null;
    }
    log('error', 'Message metadata fetch exception', { 
      messageId, 
      error: error instanceof Error ? error.message : String(error) 
    });
    return null;
  }
}

/**
 * Fetch full message body.
 */
async function fetchMessageFull(
  accessToken: string, 
  emailAddress: string, 
  messageId: string
): Promise<GmailMessage | null> {
  try {
    const url = `https://gmail.googleapis.com/gmail/v1/users/${emailAddress}/messages/${messageId}?format=full`;
    
    const response = await fetchWithTimeout(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      log('error', 'Message full fetch failed', { 
        messageId, 
        status: response.status, 
        error: errorText 
      });
      return null;
    }

    return await response.json() as GmailMessage;
  } catch (error) {
    // Handle AbortError specifically for timeout
    if (error instanceof Error && error.name === 'AbortError') {
      log('error', 'Message full fetch TIMEOUT (15s)', { messageId });
      return null;
    }
    log('error', 'Message full fetch exception', { 
      messageId, 
      error: error instanceof Error ? error.message : String(error) 
    });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// ALIAS EXTRACTION & TENANT RESOLUTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract plus-alias from header value.
 * e.g., "p.d+talbi@example.com" → "talbi"
 */
function extractAliasFromValue(value: string): string | null {
  // Match email with plus alias: local+alias@domain
  const match = value.match(/[a-zA-Z0-9._%+-]+\+([a-zA-Z0-9._-]+)@[a-zA-Z0-9.-]+/);
  return match ? match[1].toLowerCase() : null;
}

/**
 * Extract alias from message headers.
 * Checks headers in priority order.
 */
function extractAliasFromHeaders(headers: GmailMessageHeader[]): { alias: string | null; source: string | null } {
  for (const headerName of ROUTING_HEADERS) {
    const header = headers.find(h => h.name.toLowerCase() === headerName.toLowerCase());
    if (header?.value) {
      const alias = extractAliasFromValue(header.value);
      if (alias) {
        return { alias, source: headerName };
      }
    }
  }
  return { alias: null, source: null };
}

/**
 * Resolve tenant from alias using tenant_inbound_addresses table.
 * The table stores full plus-addresses in `email_address` column (e.g., p.d+talbi@talbilogistics.com).
 * We match by looking for addresses containing the +alias pattern.
 */
async function resolveTenantFromAlias(alias: string): Promise<string | null> {
  log('debug', 'Resolving tenant from alias', { alias });

  const { data, error } = await supabase
    .from('tenant_inbound_addresses')
    .select('tenant_id, email_address')
    .eq('is_active', true)
    .ilike('email_address', `%+${alias}@%`)
    .maybeSingle();

  if (error) {
    log('error', 'Tenant lookup error', { alias, error: error.message });
    return null;
  }

  if (data?.tenant_id) {
    log('info', 'Tenant resolved via inbound address', {
      alias,
      email_address: data.email_address,
      tenant_id: data.tenant_id,
    });
    return data.tenant_id;
  }

  // Fallback: check if alias matches a tenant slug/name
  // Minimal sanitization to avoid breaking the `.or()` filter string
  const safeAlias = alias.replace(/[,]/g, '').trim();

  const { data: tenantData } = await supabase
    .from('tenants')
    .select('id')
    .or(`slug.eq.${safeAlias},name.ilike.%${safeAlias}%`)
    .maybeSingle();

  if (tenantData?.id) {
    log('info', 'Tenant resolved via slug/name fallback', { alias: safeAlias, tenant_id: tenantData.id });
    return tenantData.id;
  }

  log('warn', 'No tenant found for alias', { alias: safeAlias });
  return null;
}

// ═══════════════════════════════════════════════════════════════════════════
// PAYLOAD STORAGE
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Generate content hash for deduplication.
 */
function generateContentHash(message: GmailMessage): string {
  // Simple hash based on message structure
  const content = JSON.stringify({
    id: message.id,
    threadId: message.threadId,
    headers: message.payload?.headers?.filter(h => 
      ['from', 'subject', 'date'].includes(h.name.toLowerCase())
    ),
  });
  
  // Use a simple hash (in production, use crypto)
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16).padStart(8, '0');
}

/**
 * Store message payload to Supabase Storage.
 * Returns the storage path (NOT a URL) so inbound.ts can use download() directly.
 */
async function storePayload(message: GmailMessage, tenantId: string): Promise<string | null> {
  const bucket = 'email-content';
  const hash = generateContentHash(message);
  const path = `gmail/${hash.substring(0, 2)}/${hash}.json`;

  try {
    const payload = JSON.stringify(message, null, 2);
    // Use Uint8Array instead of Blob for Node.js compatibility
    const payloadBytes = new TextEncoder().encode(payload);

    const { error } = await supabase.storage
      .from(bucket)
      .upload(path, payloadBytes, {
        contentType: 'application/json',
        upsert: false, // Don't overwrite existing
      });

    if (error && !error.message.includes('already exists')) {
      log('error', 'Payload storage failed', { bucket, path, error: error.message });
      return null;
    }

    log('info', 'Payload stored successfully', { bucket, path, messageId: message.id });
    
    // Return ONLY the path (not a URL) - inbound.ts will use download(path)
    return path;
  } catch (error) {
    log('error', 'Payload storage exception', { 
      bucket,
      path, 
      error: error instanceof Error ? error.message : String(error) 
    });
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EMAIL QUEUE INSERTION
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Extract email body from message.
 */
function extractBody(message: GmailMessage): { html: string | null; text: string | null } {
  let html: string | null = null;
  let text: string | null = null;

  function processPayload(payload: GmailMessagePayload | GmailMessagePart): void {
    if (payload.body?.data) {
      const decoded = Buffer.from(payload.body.data, 'base64').toString('utf-8');
      if (payload.mimeType === 'text/html') {
        html = decoded;
      } else if (payload.mimeType === 'text/plain') {
        text = decoded;
      }
    }
    if (payload.parts) {
      for (const part of payload.parts) {
        processPayload(part);
      }
    }
  }

  if (message.payload) {
    processPayload(message.payload);
  }

  return { html, text };
}

/**
 * Get header value from message.
 */
function getHeader(headers: GmailMessageHeader[], name: string): string | null {
  const header = headers.find(h => h.name.toLowerCase() === name.toLowerCase());
  return header?.value || null;
}

/**
 * Insert message into email_queue for processing by existing inbound pipeline.
 * 
 * CRITICAL: The inbound claim contract requires:
 * - subject IS NULL (so the inbound processor can claim and parse it)
 * - payload_url IS NOT NULL (so the inbound processor can fetch content)
 * 
 * Do NOT populate subject here - the inbound processor will extract it during parsing.
 * payload_url stores the STORAGE PATH (e.g., "gmail/ab/hash.json") - NOT a URL.
 */
async function insertToEmailQueue(
  message: GmailMessage,
  headers: GmailMessageHeader[],
  tenantId: string,
  storagePath: string,
  alias: string,
  routingSource: string
): Promise<boolean> {
  // Note: We intentionally do NOT extract subject/body here.
  // The inbound processor (claim_inbound_email_queue_batch) requires subject IS NULL
  // to identify emails that need parsing. The inbound.ts will extract subject/body from storage.
  const deliveredTo = getHeader(headers, 'Delivered-To');
  const fromEmail = getHeader(headers, 'From');

  try {
    // IDEMPOTENCY CHECK: Skip if this gmail_message_id already exists for this tenant
    const { data: existing } = await supabase
      .from('email_queue')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('gmail_message_id', message.id)
      .limit(1);
    
    if (existing && existing.length > 0) {
      log('debug', 'Duplicate email skipped (pre-check)', { messageId: message.id, tenantId });
      return true; // Not an error, just a duplicate
    }

    const { error } = await supabase.from('email_queue').insert({
      gmail_message_id: message.id,
      gmail_history_id: message.historyId || null,
      tenant_id: tenantId,
      // Store the path ONLY (NOT a URL) - inbound.ts will download from 'email-content' bucket
      payload_url: storagePath,
      status: 'pending',
      attempts: 0,
      queued_at: new Date().toISOString(),
      // IMPORTANT: subject must be NULL for claim_inbound_email_queue_batch to pick it up
      subject: null,
      from_email: fromEmail,
      // Body will be extracted by inbound processor from storage
      body_html: null,
      body_text: null,
      delivered_to_header: deliveredTo,
      extracted_alias: alias,
      routing_method: `worker_history_${routingSource}`,
    });

    if (error) {
      // Check for duplicate (race condition with constraint)
      if (error.message.includes('duplicate') || error.code === '23505') {
        log('debug', 'Duplicate email skipped (constraint)', { messageId: message.id });
        return true; // Not an error, just a duplicate
      }
      log('error', 'Email queue insert failed', { messageId: message.id, error: error.message });
      return false;
    }

    log('info', 'Email queued for inbound processing', { 
      messageId: message.id, 
      tenantId, 
      alias,
      payload_url: storagePath,
    });
    return true;
  } catch (error) {
    log('error', 'Email queue insert exception', { 
      messageId: message.id, 
      error: error instanceof Error ? error.message : String(error) 
    });
    return false;
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// UNROUTABLE HANDLING
// ═══════════════════════════════════════════════════════════════════════════

/**
 * Insert unroutable email for manual inspection.
 */
async function insertUnroutableEmail(
  message: GmailMessage,
  headers: GmailMessageHeader[],
  emailAddress: string,
  reason: string
): Promise<void> {
  try {
    const subject = getHeader(headers, 'Subject');
    const fromEmail = getHeader(headers, 'From');
    const deliveredTo = getHeader(headers, 'Delivered-To');
    const { html, text } = extractBody(message);

    await supabase.from('unroutable_emails').insert({
      gmail_message_id: message.id,
      gmail_history_id: message.historyId || null,
      received_at: message.internalDate 
        ? new Date(parseInt(message.internalDate)).toISOString() 
        : new Date().toISOString(),
      from_email: fromEmail,
      subject,
      body_preview: (text || html || '').substring(0, 500),
      reason,
      delivered_to_header: deliveredTo,
      extraction_metadata: {
        source: 'worker_history_queue',
        headers: headers.map(h => ({ name: h.name, value: h.value?.substring(0, 200) })),
        oauth_owner: emailAddress,
      },
    });

    log('warn', 'Email quarantined as unroutable', { messageId: message.id, reason });
  } catch (error) {
    log('error', 'Failed to insert unroutable email', { 
      messageId: message.id, 
      error: error instanceof Error ? error.message : String(error) 
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// MAIN PROCESSOR
// ═══════════════════════════════════════════════════════════════════════════

export interface HistoryProcessResult {
  success: boolean;
  messagesProcessed: number;
  error?: string;
}

/**
 * Process a single gmail_history_queue item.
 */
export async function processHistoryItem(item: HistoryQueueItem): Promise<HistoryProcessResult> {
  const { id, email_address, history_id } = item;
  
  log('info', 'Processing history stub', { id: id.substring(0, 8), email: email_address, historyId: history_id });

  try {
    // 1. Load Gmail token
    const token = await loadGmailToken(email_address);
    if (!token) {
      await failHistoryItem(id, `No gmail token found for ${email_address}`);
      return { success: false, messagesProcessed: 0, error: 'Token not found' };
    }

    // 2. Get valid access token (refresh if needed)
    const accessToken = await getValidAccessToken(token);
    if (!accessToken) {
      await failHistoryItem(id, 'Failed to get valid access token');
      return { success: false, messagesProcessed: 0, error: 'Token refresh failed' };
    }

    // 3. Fetch history entries
    const messageIds = await fetchGmailHistory(accessToken, email_address, history_id);
    
    if (messageIds.length === 0) {
      // No new messages - still success, just nothing to process
      await completeHistoryItem(id);
      log('info', 'History stub complete (no new messages)', { id: id.substring(0, 8) });
      return { success: true, messagesProcessed: 0 };
    }

    // 4. Process each message
    let processed = 0;
    let errors = 0;

    for (const messageId of messageIds) {
      try {
        // 4a. Fetch metadata headers
        const metadataHeaders = await fetchMessageMetadata(accessToken, email_address, messageId);
        if (!metadataHeaders) {
          errors++;
          continue;
        }

        // 4b. Extract alias and resolve tenant
        const { alias, source } = extractAliasFromHeaders(metadataHeaders);
        
        let tenantId: string | null = null;
        
        if (alias) {
          tenantId = await resolveTenantFromAlias(alias);
        }
        
        // If no alias found, try using token's tenant_id as fallback
        if (!tenantId && token.tenant_id) {
          tenantId = token.tenant_id;
          log('debug', 'Using token tenant_id as fallback', { messageId, tenantId });
        }

        // 4c. Fetch full message
        const fullMessage = await fetchMessageFull(accessToken, email_address, messageId);
        if (!fullMessage) {
          errors++;
          continue;
        }

        // Merge metadata headers with full message headers
        const mergedHeaders = [...metadataHeaders];
        if (fullMessage.payload?.headers) {
          for (const header of fullMessage.payload.headers) {
            if (!mergedHeaders.find(h => h.name.toLowerCase() === header.name.toLowerCase())) {
              mergedHeaders.push(header);
            }
          }
        }

        // 4d. If still no tenant, quarantine
        if (!tenantId) {
          await insertUnroutableEmail(fullMessage, mergedHeaders, email_address, 'No alias found, no tenant mapping');
          errors++;
          continue;
        }

        // 4e. Store payload to Supabase Storage
        const storagePath = await storePayload(fullMessage, tenantId);
        if (!storagePath) {
          errors++;
          continue;
        }

        // 4f. Insert into email_queue with path (not URL)
        const inserted = await insertToEmailQueue(
          fullMessage,
          mergedHeaders,
          tenantId,
          storagePath,
          alias || 'fallback',
          source || 'token_tenant'
        );

        if (inserted) {
          processed++;
        } else {
          errors++;
        }
      } catch (msgError) {
        log('error', 'Message processing error', { 
          messageId, 
          error: msgError instanceof Error ? msgError.message : String(msgError) 
        });
        errors++;
      }
    }

    // 5. Complete or fail based on results
    if (processed > 0 || errors === 0) {
      await completeHistoryItem(id);
      log('info', 'History stub complete', { 
        id: id.substring(0, 8), 
        processed, 
        errors,
        total: messageIds.length 
      });
      return { success: true, messagesProcessed: processed };
    } else {
      await failHistoryItem(id, `All ${errors} messages failed processing`);
      return { success: false, messagesProcessed: 0, error: `${errors} message errors` };
    }
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : String(error);
    log('error', 'History item processing failed', { id: id.substring(0, 8), error: errorMsg });
    await failHistoryItem(id, errorMsg);
    return { success: false, messagesProcessed: 0, error: errorMsg };
  }
}
