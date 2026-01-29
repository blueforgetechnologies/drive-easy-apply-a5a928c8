/**
 * Inbound Email Processor
 * 
 * Processes inbound load emails from the queue:
 * - Parses Sylectus / Full Circle TMS emails
 * - Geocodes origin locations
 * - Computes fingerprints for deduplication
 * - Creates load_emails records
 * - Triggers hunt matching
 */

import { supabase } from './supabase.js';
import { parseSylectusEmail, parseSubjectLine, type ParsedEmailData } from './parsers/sylectus.js';
import { parseFullCircleTMSEmail } from './parsers/fullcircle.js';
import { geocodeLocation, lookupCityFromZip, type Coordinates } from './geocode.js';
import {
  computeParsedLoadFingerprint,
  generateContentHash,
  FINGERPRINT_VERSION,
} from './fingerprint.js';
// Types are handled via casting at call sites to avoid Supabase builder type conflicts

export interface InboundQueueItem {
  id: string;
  tenant_id: string | null;
  gmail_message_id: string;
  gmail_history_id: string | null;
  payload_url: string | null; // Storage path (e.g., "gmail/ab/hash.json") - NOT a URL
  attempts: number;
  queued_at: string;
  subject: string | null;
  from_email: string | null;
  body_html: string | null;
  body_text: string | null;
}

export interface InboundProcessResult {
  success: boolean;
  loadId?: string;
  error?: string;
  isUpdate?: boolean;
  isDuplicate?: boolean;
}

// Check for existing load with same fingerprint in same tenant
async function findExistingByFingerprint(
  fingerprint: string,
  tenantId: string | null,
  hoursWindow: number = 168
): Promise<{ id: string; load_id: string; received_at: string } | null> {
  if (!fingerprint || !tenantId) return null;
  
  const windowStart = new Date(Date.now() - hoursWindow * 60 * 60 * 1000).toISOString();
  
  const { data: existingLoad } = await supabase
    .from('load_emails')
    .select('id, load_id, received_at')
    .eq('parsed_load_fingerprint', fingerprint)
    .eq('tenant_id', tenantId)
    .eq('is_duplicate', false)
    .gte('received_at', windowStart)
    .order('received_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  
  return existingLoad;
}

// Check for existing similar load (legacy content hash)
async function findExistingSimilarLoad(
  contentHash: string,
  tenantId: string | null,
  hoursWindow: number = 48
): Promise<{ id: string; load_id: string; received_at: string } | null> {
  if (!contentHash || !tenantId) return null;
  
  const windowStart = new Date(Date.now() - hoursWindow * 60 * 60 * 1000).toISOString();
  
  const { data: existingLoad } = await supabase
    .from('load_emails')
    .select('id, load_id, received_at')
    .eq('content_hash', contentHash)
    .eq('tenant_id', tenantId)
    .eq('is_update', false)
    .gte('received_at', windowStart)
    .order('received_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  
  return existingLoad;
}

// Haversine distance calculation
function haversineDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth radius in miles
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon/2) * Math.sin(dLon/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Match load to hunt plans
async function matchLoadToHunts(
  loadEmailId: string,
  loadId: string,
  parsedData: any,
  tenantId: string | null,
  loadContentFingerprint: string | null = null,
  receivedAt: Date | null = null
): Promise<void> {
  if (!tenantId) {
    console.log(`[inbound] BLOCKED - No tenant_id provided, cannot match without tenant context`);
    return;
  }
  
  // Check if matching is enabled
  const { data: matchingEnabled } = await supabase.rpc('is_feature_enabled', {
    _tenant_id: tenantId,
    _feature_key: 'load_hunter_matching',
  });
  
  if (matchingEnabled === false) {
    console.log(`[inbound] Matching disabled for tenant ${tenantId}`);
    return;
  }
  
  // Get enabled hunt plans for this tenant
  const { data: enabledHunts } = await supabase
    .from('hunt_plans')
    .select('id, vehicle_id, hunt_coordinates, pickup_radius, vehicle_size, floor_load_id, load_capacity, tenant_id, cooldown_seconds_min')
    .eq('enabled', true)
    .eq('tenant_id', tenantId);
  
  if (!enabledHunts?.length) return;
  
  const loadCoords = parsedData.pickup_coordinates;
  const loadVehicleType = parsedData.vehicle_type?.toLowerCase().replace(/[^a-z]/g, '');
  
  for (const hunt of enabledHunts) {
    if (hunt.floor_load_id && loadId <= hunt.floor_load_id) continue;
    
    const huntCoords = hunt.hunt_coordinates as { lat: number; lng: number } | null;
    if (!huntCoords?.lat || !huntCoords?.lng) continue;
    
    const distance = haversineDistance(loadCoords.lat, loadCoords.lng, huntCoords.lat, huntCoords.lng);
    if (distance > parseFloat(hunt.pickup_radius || '200')) continue;
    
    // Parse vehicle_sizes as JSON array
    let huntVehicleSizes: string[] = [];
    if (hunt.vehicle_size) {
      try {
        const parsed = JSON.parse(hunt.vehicle_size);
        huntVehicleSizes = Array.isArray(parsed) ? parsed : [hunt.vehicle_size];
      } catch {
        huntVehicleSizes = [hunt.vehicle_size];
      }
    }
    
    // Check vehicle type match
    if (huntVehicleSizes.length > 0 && loadVehicleType) {
      const loadTypeNormalized = loadVehicleType.toLowerCase().replace(/[^a-z-]/g, '');
      const vehicleMatches = huntVehicleSizes.some(huntSize => {
        const huntNormalized = huntSize.toLowerCase().replace(/[^a-z-]/g, '');
        return loadTypeNormalized === huntNormalized ||
          loadTypeNormalized.includes(huntNormalized) || 
          huntNormalized.includes(loadTypeNormalized) ||
          (loadTypeNormalized.includes('cargo') && huntNormalized.includes('cargo')) ||
          (loadTypeNormalized.includes('sprinter') && huntNormalized.includes('sprinter')) ||
          (loadTypeNormalized.includes('straight') && huntNormalized.includes('straight'));
      });
      if (!vehicleMatches) continue;
    }
    
    // Check payload capacity
    if (hunt.load_capacity) {
      const maxCapacity = parseFloat(hunt.load_capacity);
      const loadWeight = parseFloat(parsedData.weight || '0');
      if (!isNaN(maxCapacity) && !isNaN(loadWeight) && loadWeight > 0 && loadWeight > maxCapacity) {
        continue;
      }
    }
    
    // Check for existing match
    const { count: existingMatch } = await supabase
      .from('load_hunt_matches')
      .select('id', { count: 'exact', head: true })
      .eq('load_email_id', loadEmailId)
      .eq('hunt_plan_id', hunt.id);
    
    if (existingMatch && existingMatch > 0) continue;
    
    // Cooldown gating
    const hasFp = loadContentFingerprint && loadContentFingerprint.trim() !== '';
    const hasReceivedAt = !!receivedAt;
    
    if (!hasFp || !hasReceivedAt) {
      const missing = [
        !hasFp ? 'fingerprint' : null,
        !hasReceivedAt ? 'receivedAt' : null,
      ].filter(Boolean).join('|');
      console.log(`[hunt-cooldown] suppressed_missing_gate_data tenant=${tenantId} hunt=${hunt.id} load_email_id=${loadEmailId} missing=${missing}`);
      continue;
    }
    
    // Determine cooldown
    let cooldownSecondsMin = 60;
    if (hunt.cooldown_seconds_min != null) {
      cooldownSecondsMin = hunt.cooldown_seconds_min;
    } else {
      const { data: tenantData } = await supabase
        .from('tenants')
        .select('cooldown_seconds_min')
        .eq('id', tenantId)
        .maybeSingle();
      if (tenantData?.cooldown_seconds_min != null) {
        cooldownSecondsMin = tenantData.cooldown_seconds_min;
      }
    }
    
    const { data: shouldTrigger, error: cooldownError } = await supabase.rpc('should_trigger_hunt_for_fingerprint', {
      p_tenant_id: tenantId,
      p_hunt_plan_id: hunt.id,
      p_fingerprint: loadContentFingerprint,
      p_received_at: receivedAt.toISOString(),
      p_cooldown_seconds: cooldownSecondsMin,
      p_last_load_email_id: loadEmailId,
    });
    
    if (cooldownError) {
      console.error(`[hunt-cooldown] RPC error (SUPPRESSING match):`, cooldownError);
      continue;
    }
    
    if (!shouldTrigger) {
      console.log(`[hunt-cooldown] suppressed tenant=${tenantId} hunt=${hunt.id} fp=${loadContentFingerprint.substring(0, 8)}... cooldown=${cooldownSecondsMin}s`);
      continue;
    }
    
    console.log(`[hunt-cooldown] allowed tenant=${tenantId} hunt=${hunt.id} fp=${loadContentFingerprint.substring(0, 8)}...`);
    
    // Final tenant isolation check
    if (hunt.tenant_id !== tenantId) {
      console.error(`[inbound] BLOCKED cross-tenant match: load_email tenant=${tenantId} hunt tenant=${hunt.tenant_id}`);
      continue;
    }
    
    await supabase.from('load_hunt_matches').insert({
      load_email_id: loadEmailId,
      hunt_plan_id: hunt.id,
      vehicle_id: hunt.vehicle_id,
      distance_miles: Math.round(distance),
      is_active: true,
      match_status: 'active',
      matched_at: new Date().toISOString(),
      tenant_id: tenantId,
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// TIMEOUT HELPER
// ═══════════════════════════════════════════════════════════════════════════
const STEP_TIMEOUT_MS = 30_000; // 30 seconds per step

/**
 * Wrap a promise-like (thenable) with a timeout to prevent indefinite hangs.
 * Uses 'any' for promiseLike because Supabase query builders have complex
 * thenable types that don't match PromiseLike<T> strictly.
 * Cast the result at call sites if you need specific typing.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function withTimeout<T = any>(
  promiseLike: any,
  timeoutMs: number,
  stepName: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`TIMEOUT (${timeoutMs}ms) at step: ${stepName}`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      Promise.resolve(promiseLike),
      timeoutPromise,
    ]);
    if (timeoutId) clearTimeout(timeoutId);
    return result as T;
  } catch (e) {
    if (timeoutId) clearTimeout(timeoutId);
    throw e;
  }
}

/**
 * Process a single inbound email from the queue
 */
export async function processInboundEmail(item: InboundQueueItem): Promise<InboundProcessResult> {
  const startTime = Date.now();
  const itemIdShort = item.id.substring(0, 8);
  
  // Helper for step logging
  const logStep = (step: string, extra?: Record<string, any>) => {
    const elapsed = Date.now() - startTime;
    console.log(`[inbound] STEP ${step} id=${itemIdShort} elapsed=${elapsed}ms`, extra ? JSON.stringify(extra) : '');
  };
  
  // Entry breadcrumb: logged BEFORE any await, so if we see it, we know the function was called
  console.log(`[inbound] ENTRY processInboundEmail id=${itemIdShort} gmail=${item.gmail_message_id} payload_url=${item.payload_url?.substring(0, 50) ?? 'NULL'}`);
  
  try {
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 1: Mark as processing
    // ─────────────────────────────────────────────────────────────────────────
    logStep('1-mark-processing-start');
    await withTimeout(
      supabase
        .from('email_queue')
        .update({ status: 'processing', attempts: item.attempts + 1, processing_started_at: new Date().toISOString() })
        .eq('id', item.id),
      STEP_TIMEOUT_MS,
      'mark-processing'
    );
    logStep('1-mark-processing-done');
    
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 2: Check if already processed
    // ─────────────────────────────────────────────────────────────────────────
    logStep('2-check-existing-start');
    const existingCheckResult = await withTimeout(
      supabase
        .from('load_emails')
        .select('id', { count: 'exact', head: true })
        .eq('email_id', item.gmail_message_id),
      STEP_TIMEOUT_MS,
      'check-existing'
    ) as { count: number | null };
    const existingCount = existingCheckResult.count;
    logStep('2-check-existing-done', { count: existingCount });
    
    if (existingCount && existingCount > 0) {
      logStep('2-already-processed-marking-complete');
      await withTimeout(
        supabase
          .from('email_queue')
          .update({ status: 'completed', processed_at: new Date().toISOString() })
          .eq('id', item.id),
        STEP_TIMEOUT_MS,
        'mark-already-complete'
      );
      logStep('2-already-processed-done');
      return { success: true };
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 3: Load email payload from storage or direct HTTP fetch
    // ─────────────────────────────────────────────────────────────────────────
    let message: any = null;
    const STORAGE_BUCKET = 'email-content';
    let storagePath: string | null = null;
    const rawPayloadUrl = item.payload_url;
    
    // Try to extract storage path from URL
    if (rawPayloadUrl) {
      if (rawPayloadUrl.startsWith('http')) {
        const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
        const markerIndex = rawPayloadUrl.indexOf(marker);
        if (markerIndex !== -1) {
          storagePath = rawPayloadUrl.substring(markerIndex + marker.length);
        }
      } else {
        storagePath = rawPayloadUrl;
      }
    }
    
    // Strategy 1: Try storage SDK download if we have a path
    if (storagePath && !message) {
      logStep('3-storage-download-start', { bucket: STORAGE_BUCKET, path: storagePath });
      console.log(`[inbound] Attempting storage download: bucket=${STORAGE_BUCKET} path=${storagePath} messageId=${item.gmail_message_id}`);
      
      try {
        const downloadResult = await withTimeout<{ data: Blob | null; error: Error | null }>(
          supabase.storage.from(STORAGE_BUCKET).download(storagePath),
          STEP_TIMEOUT_MS,
          'storage-download'
        );
        
        if (downloadResult.error) {
          logStep('3-storage-download-error', { error: downloadResult.error.message });
          console.warn(`[inbound] Storage SDK download failed, will try direct HTTP:`, downloadResult.error.message);
        } else if (downloadResult.data) {
          logStep('3-storage-download-success-parsing-json');
          const payloadText = await downloadResult.data.text();
          message = JSON.parse(payloadText);
          console.log(`[inbound] Successfully loaded message from storage SDK: bucket=${STORAGE_BUCKET} path=${storagePath}`);
          logStep('3-storage-download-done', { payloadSize: payloadText.length });
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        logStep('3-storage-download-exception', { error: errorMsg });
        console.warn(`[inbound] Storage SDK exception, will try direct HTTP: ${errorMsg}`);
      }
    }
    
    // Strategy 2: Direct HTTP fetch from payload_url (with retry)
    if (!message && rawPayloadUrl && rawPayloadUrl.startsWith('http')) {
      logStep('3-http-fetch-start', { url: rawPayloadUrl.substring(0, 80) });
      console.log(`[inbound] Attempting direct HTTP fetch: ${rawPayloadUrl.substring(0, 80)}...`);
      
      const MAX_RETRIES = 2;
      const FETCH_TIMEOUT_MS = 15000;
      
      for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
          const controller = new AbortController();
          const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
          
          const response = await fetch(rawPayloadUrl, {
            method: 'GET',
            signal: controller.signal,
            headers: { 'Accept': 'application/json' },
          });
          
          clearTimeout(timeoutId);
          
          if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
          }
          
          const payloadText = await response.text();
          message = JSON.parse(payloadText);
          
          logStep('3-http-fetch-success', { attempt, payloadSize: payloadText.length });
          console.log(`[inbound] Successfully loaded message via HTTP fetch (attempt ${attempt}): ${payloadText.length} bytes`);
          break; // Success, exit retry loop
          
        } catch (e) {
          const errorMsg = e instanceof Error ? e.message : String(e);
          const isAbort = errorMsg.includes('aborted') || errorMsg.includes('abort');
          logStep('3-http-fetch-error', { attempt, error: errorMsg, isTimeout: isAbort });
          console.warn(`[inbound] HTTP fetch attempt ${attempt}/${MAX_RETRIES} failed: ${errorMsg}`);
          
          if (attempt === MAX_RETRIES) {
            console.error(`[inbound] All HTTP fetch attempts exhausted for ${item.gmail_message_id}`);
          } else {
            // Brief delay before retry
            await new Promise(r => setTimeout(r, 1000));
          }
        }
      }
    }
    
    if (!message) {
      throw new Error(`No stored payload available for ${item.gmail_message_id} (tried storage SDK and direct HTTP)`);
    }
    
    // Validate message structure
    if (!message.payload || typeof message.payload !== 'object') {
      throw new Error('Invalid email payload structure: missing payload object');
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 4: Extract and parse email
    // ─────────────────────────────────────────────────────────────────────────
    logStep('4-parse-start');
    
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value;
    
    const subject = getHeader('Subject') || '';
    const from = getHeader('From') || '';
    const receivedAt = message.internalDate 
      ? new Date(parseInt(message.internalDate, 10)) 
      : new Date();
    
    // Extract body
    const extractBody = (part: any, mimeType: string): string => {
      if (!part || typeof part !== 'object') return '';
      if (typeof part.mimeType !== 'string') {
        if (part.parts && Array.isArray(part.parts)) {
          for (const p of part.parts) {
            const text = extractBody(p, mimeType);
            if (text) return text;
          }
        }
        return '';
      }
      if (part.mimeType === mimeType && part.body?.data) {
        return Buffer.from(part.body.data, 'base64').toString('utf-8');
      }
      if (part.parts && Array.isArray(part.parts)) {
        for (const p of part.parts) {
          const text = extractBody(p, mimeType);
          if (text) return text;
        }
      }
      return '';
    };
    
    const payload = message.payload || {};
    const bodyText = extractBody(payload, 'text/plain') || extractBody(payload, 'text/html');
    const bodyHtml = extractBody(payload, 'text/html');
    
    // Detect email source
    let emailSource = 'sylectus';
    const fromEmailForDetection = (from.match(/<([^>]+)>/)?.[1] || from).trim();
    const fromEmailLower = fromEmailForDetection.toLowerCase();
    const bodyCombinedLower = `${bodyText}\n${bodyHtml}`.toLowerCase();
    
    const isFullCircleTMS =
      fromEmailLower.includes('fullcircletms.com') ||
      fromEmailLower.includes('fctms.com') ||
      bodyCombinedLower.includes('app.fullcircletms.com') ||
      bodyCombinedLower.includes('bid yes to this load') ||
      /^Load Available:\s+[A-Z]{2}\s+-\s+[A-Z]{2}/i.test(subject);
    
    if (isFullCircleTMS) {
      emailSource = 'fullcircle';
    }
    
    logStep('4-parse-detect-source', { emailSource });
    
    // Parse based on source
    let parsedData: ParsedEmailData;
    if (isFullCircleTMS) {
      parsedData = parseFullCircleTMSEmail(subject, bodyText, bodyHtml);
    } else {
      const subjectData = parseSubjectLine(subject);
      const bodyData = parseSylectusEmail(subject, bodyText);
      parsedData = { ...bodyData, ...subjectData };
    }
    
    logStep('4-parse-done', { 
      origin: parsedData.origin_city, 
      dest: parsedData.destination_city,
      vehicleType: parsedData.vehicle_type 
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 5: Geocode origin location
    // ─────────────────────────────────────────────────────────────────────────
    logStep('5-geocode-start');
    
    // Lookup city from zip if needed
    if (!parsedData.origin_city && parsedData.origin_zip) {
      const cityData = await lookupCityFromZip(parsedData.origin_zip, parsedData.origin_state);
      if (cityData) {
        parsedData.origin_city = cityData.city;
        parsedData.origin_state = cityData.state;
      }
    }
    
    if (!parsedData.destination_city && parsedData.destination_zip) {
      const cityData = await lookupCityFromZip(parsedData.destination_zip, parsedData.destination_state);
      if (cityData) {
        parsedData.destination_city = cityData.city;
        parsedData.destination_state = cityData.state;
      }
    }
    
    let geocodeFailed = false;
    let geocodingErrorCode: string | null = null;
    let geocodingWasAttempted = false;
    
    if (parsedData.origin_city && parsedData.origin_state) {
      geocodingWasAttempted = true;
      const coords = await geocodeLocation(parsedData.origin_city, parsedData.origin_state);
      if (coords) {
        parsedData.pickup_coordinates = coords;
      } else {
        geocodeFailed = true;
        geocodingErrorCode = 'geocode_failed';
      }
    } else {
      geocodingErrorCode = 'missing_input';
    }
    
    logStep('5-geocode-done', { 
      hasCoords: !!parsedData.pickup_coordinates,
      geocodeFailed 
    });
    
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 6: Check for issues and prepare data
    // ─────────────────────────────────────────────────────────────────────────
    logStep('6-prepare-data-start');
    
    const hasIssues = (!parsedData.broker_email && !isFullCircleTMS) || !parsedData.origin_city || !parsedData.vehicle_type || geocodeFailed;
    const issueNotes: string[] = [];
    if (!parsedData.broker_email && !isFullCircleTMS) issueNotes.push('Missing broker email');
    if (!parsedData.origin_city) issueNotes.push('Missing origin location');
    if (!parsedData.vehicle_type) issueNotes.push('Missing vehicle type');
    if (geocodeFailed) issueNotes.push(`Geocoding failed: ${geocodingErrorCode}`);
    
    const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/);
    const fromName = fromMatch ? fromMatch[1].trim() : from;
    const fromEmail = fromMatch ? fromMatch[2] : from;
    const tenantId = item.tenant_id;
    
    // For Full Circle TMS: create/update customer with MC#
    if (isFullCircleTMS && parsedData.broker_company && tenantId) {
      logStep('6-fullcircle-customer-upsert-start');
      const customerName = parsedData.broker_company;
      
      const customerResult = await withTimeout(
        supabase
          .from('customers')
          .select('id, mc_number')
          .ilike('name', customerName)
          .eq('tenant_id', tenantId)
          .maybeSingle(),
        STEP_TIMEOUT_MS,
        'customer-lookup'
      ) as { data: { id: string; mc_number: string | null } | null };
      const existingCustomer = customerResult.data;
      
      if (existingCustomer) {
        if (!existingCustomer.mc_number && parsedData.mc_number) {
          await withTimeout(
            supabase.from('customers').update({ mc_number: parsedData.mc_number }).eq('id', existingCustomer.id),
            STEP_TIMEOUT_MS,
            'customer-update'
          );
        }
      } else {
        await withTimeout(
          supabase.from('customers').insert({
            name: customerName,
            mc_number: parsedData.mc_number || null,
            contact_name: parsedData.broker_name || null,
            phone: parsedData.broker_phone || null,
            address: parsedData.broker_address || null,
            city: parsedData.broker_city || null,
            state: parsedData.broker_state || null,
            zip: parsedData.broker_zip || null,
            tenant_id: tenantId,
          }),
          STEP_TIMEOUT_MS,
          'customer-insert'
        );
      }
      logStep('6-fullcircle-customer-upsert-done');
    }
    
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 7: Generate fingerprints and check duplicates
    // ─────────────────────────────────────────────────────────────────────────
    logStep('7-fingerprint-start');
    
    const contentHash = generateContentHash(parsedData);
    const fingerprintResult = computeParsedLoadFingerprint(parsedData);
    const {
      fingerprint: parsedLoadFingerprint,
      canonicalPayload,
      dedupEligible,
      dedupEligibleReason,
      fingerprintMissingReason,
    } = fingerprintResult;
    
    let isDuplicate = false;
    let duplicateOfId: string | null = null;
    let loadContentFingerprint: string | null = null;
    let loadContentMissingReason: string | null = fingerprintMissingReason;
    
    if (dedupEligible && parsedLoadFingerprint && canonicalPayload) {
      logStep('7-check-duplicate-start');
      const existingDuplicate = await findExistingByFingerprint(parsedLoadFingerprint, tenantId, 168);
      
      if (existingDuplicate) {
        isDuplicate = true;
        duplicateOfId = existingDuplicate.id;
        logStep('7-duplicate-found', { duplicateOfId });
      }
      
      // Upsert to load_content table
      logStep('7-load-content-upsert-start');
      const canonicalPayloadJson = JSON.stringify(canonicalPayload);
      const sizeBytes = Buffer.byteLength(canonicalPayloadJson, 'utf8');
      
      const upsertResult = await withTimeout(
        supabase.rpc('upsert_load_content', {
          p_fingerprint: parsedLoadFingerprint,
          p_canonical_payload: canonicalPayload,
          p_fingerprint_version: FINGERPRINT_VERSION,
          p_size_bytes: sizeBytes,
          p_provider: emailSource || null,
        }),
        STEP_TIMEOUT_MS,
        'upsert-load-content'
      ) as { error: { message: string } | null };
      
      if (upsertResult.error) {
        logStep('7-load-content-upsert-error', { error: upsertResult.error.message });
        loadContentMissingReason = 'load_content_upsert_failed';
      } else {
        loadContentFingerprint = parsedLoadFingerprint;
        loadContentMissingReason = null;
      }
      logStep('7-load-content-upsert-done');
    }
    
    // Check for updates (legacy content hash)
    logStep('7-check-similar-start');
    const existingSimilarLoad = await findExistingSimilarLoad(contentHash, tenantId, 48);
    
    let isUpdate = false;
    let parentEmailId: string | null = null;
    
    if (existingSimilarLoad && !isDuplicate) {
      isUpdate = true;
      parentEmailId = existingSimilarLoad.id;
    }
    
    logStep('7-fingerprint-done', { isDuplicate, isUpdate });
    
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 8: Apply failsafe expiration rules
    // ─────────────────────────────────────────────────────────────────────────
    const now = Date.now();
    
    if (!parsedData.posted_at) {
      parsedData.posted_at = new Date(now).toISOString();
    }
    
    const postedTime = new Date(parsedData.posted_at).getTime();
    if (!parsedData.expires_at) {
      parsedData.expires_at = new Date(postedTime + 30 * 60 * 1000).toISOString();
    } else {
      const expiresTime = new Date(parsedData.expires_at).getTime();
      if (expiresTime <= postedTime) {
        parsedData.expires_at = new Date(postedTime + 30 * 60 * 1000).toISOString();
      }
    }
    
    const finalExpiresTime = new Date(parsedData.expires_at).getTime();
    if (finalExpiresTime < now) {
      parsedData.expires_at = new Date(now + 30 * 60 * 1000).toISOString();
    }
    
    const hasCoordinates = parsedData.pickup_coordinates?.lat && parsedData.pickup_coordinates?.lng;
    const geocodingStatus = hasCoordinates 
      ? 'success' 
      : (geocodingWasAttempted ? 'failed' : 'pending');
    
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 9: Insert into load_emails
    // ─────────────────────────────────────────────────────────────────────────
    logStep('9-load-emails-insert-start');
    
    const insertResult = await withTimeout(
      supabase
        .from('load_emails')
        .upsert({
          email_id: item.gmail_message_id,
          thread_id: message.threadId,
          from_email: fromEmail,
          from_name: fromName,
          subject,
          body_text: bodyText.substring(0, 50000),
          body_html: null,
          received_at: receivedAt.toISOString(),
          parsed_data: parsedData,
          expires_at: parsedData.expires_at || null,
          posted_at: parsedData.posted_at || null,
          status: isDuplicate ? 'duplicate' : (isUpdate ? 'update' : 'new'),
          has_issues: hasIssues,
          issue_notes: issueNotes.length > 0 ? issueNotes.join('; ') : null,
          email_source: emailSource,
          tenant_id: tenantId,
          raw_payload_url: item.payload_url || null,
          content_hash: contentHash,
          parsed_load_fingerprint: parsedLoadFingerprint,
          is_update: isUpdate,
          is_duplicate: isDuplicate,
          duplicate_of_id: duplicateOfId,
          parent_email_id: parentEmailId,
          dedup_eligible: dedupEligible,
          dedup_eligible_reason: dedupEligibleReason,
          dedup_canonical_payload: isDuplicate ? canonicalPayload : null,
          load_content_fingerprint: loadContentFingerprint,
          fingerprint_missing_reason: loadContentMissingReason,
          ingestion_source: 'vps-worker',
          geocoding_status: geocodingStatus,
          geocoding_error_code: geocodingErrorCode,
        }, { onConflict: 'email_id' })
        .select('id, load_id, received_at')
        .single(),
      STEP_TIMEOUT_MS,
      'load-emails-upsert'
    ) as { data: { id: string; load_id: string; received_at: string } | null; error: { message: string } | null };
    
    if (insertResult.error) {
      logStep('9-load-emails-insert-error', { error: insertResult.error.message });
      throw insertResult.error;
    }
    
    const insertedEmail = insertResult.data;
    logStep('9-load-emails-insert-done', { loadId: insertedEmail?.load_id });
    
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 10: Mark queue item as completed
    // ─────────────────────────────────────────────────────────────────────────
    logStep('10-mark-completed-start');
    
    await withTimeout(
      supabase
        .from('email_queue')
        .update({ 
          status: 'completed', 
          processed_at: new Date().toISOString(),
          parsed_at: new Date().toISOString(),
        })
        .eq('id', item.id),
      STEP_TIMEOUT_MS,
      'mark-completed'
    );
    
    logStep('10-mark-completed-done');
    
    // ─────────────────────────────────────────────────────────────────────────
    // STEP 11: Hunt matching (async, non-blocking)
    // ─────────────────────────────────────────────────────────────────────────
    if (insertedEmail && parsedData.pickup_coordinates && parsedData.vehicle_type) {
      const hasFp = loadContentFingerprint && loadContentFingerprint.trim() !== '';
      const hasReceivedAt = !!receivedAt;
      const hasTenant = !!tenantId;
      
      if (hasFp && hasReceivedAt && hasTenant) {
        logStep('11-hunt-matching-start');
        matchLoadToHunts(
          insertedEmail.id,
          insertedEmail.load_id,
          parsedData,
          tenantId,
          loadContentFingerprint,
          receivedAt
        ).catch((e) => {
          console.error(`[inbound] Hunt matching error for ${itemIdShort}:`, e instanceof Error ? e.message : e);
        });
      }
    }
    
    const totalElapsed = Date.now() - startTime;
    console.log(`[inbound] SUCCESS id=${itemIdShort} loadId=${insertedEmail?.load_id} elapsed=${totalElapsed}ms`);
    
    return {
      success: true,
      loadId: insertedEmail?.load_id,
      isUpdate,
      isDuplicate,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const isTimeout = errorMessage.includes('TIMEOUT');
    const newStatus = item.attempts >= 3 ? 'failed' : 'pending';
    
    // Log the failure with step info
    console.error(`[inbound] FAILED id=${itemIdShort} error=${errorMessage} isTimeout=${isTimeout}`);
    
    // Mark as failed in DB
    try {
      await supabase
        .from('email_queue')
        .update({ 
          status: newStatus, 
          last_error: errorMessage.substring(0, 1000),
          processing_started_at: null, // Clear so it can be reclaimed
        })
        .eq('id', item.id);
    } catch (updateError) {
      console.error(`[inbound] Failed to update queue status for ${itemIdShort}:`, updateError);
    }
    
    return { success: false, error: errorMessage };
  }
}

/**
 * Verify storage access on startup by downloading 1-3 newest queue items.
 * This is a diagnostic to confirm the worker can reach Supabase Storage.
 */
export async function verifyStorageAccess(): Promise<void> {
  console.log('[inbound] Running storage access verification...');
  
  const STORAGE_BUCKET = 'email-content';
  
  // Get 3 newest items with payload_url
  const { data: testItems, error: queryError } = await supabase
    .from('email_queue')
    .select('id, payload_url')
    .not('payload_url', 'is', null)
    .order('queued_at', { ascending: false })
    .limit(3);
  
  if (queryError) {
    console.error('[inbound] Storage verification FAILED - query error:', queryError.message);
    return;
  }
  
  if (!testItems || testItems.length === 0) {
    console.log('[inbound] Storage verification: No items with payload_url found, skipping');
    return;
  }
  
  let successCount = 0;
  
  for (const item of testItems) {
    const rawPayloadUrl = item.payload_url;
    let storagePath: string | null = null;
    
    if (rawPayloadUrl?.startsWith('http')) {
      const marker = `/storage/v1/object/public/${STORAGE_BUCKET}/`;
      const markerIndex = rawPayloadUrl.indexOf(marker);
      if (markerIndex !== -1) {
        storagePath = rawPayloadUrl.substring(markerIndex + marker.length);
      }
    } else if (rawPayloadUrl) {
      storagePath = rawPayloadUrl;
    }
    
    if (!storagePath) {
      console.log(`[inbound] Verification: Could not extract path from: ${rawPayloadUrl?.substring(0, 60)}`);
      continue;
    }
    
    const { data, error } = await supabase.storage.from(STORAGE_BUCKET).download(storagePath);
    
    if (error) {
      console.error(`[inbound] Verification FAILED for ${storagePath.substring(0, 40)}:`, JSON.stringify({
        bucket: STORAGE_BUCKET,
        path: storagePath,
        error: error.message,
      }));
    } else if (data) {
      const size = data.size;
      console.log(`[inbound] Verification SUCCESS: ${storagePath.substring(0, 40)}... (${size} bytes)`);
      successCount++;
    }
  }
  
  console.log(`[inbound] Storage verification complete: ${successCount}/${testItems.length} downloads succeeded`);
}
