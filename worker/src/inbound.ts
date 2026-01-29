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
import { geocodeLocation, lookupCityFromZip } from './geocode.js';
import {
  computeParsedLoadFingerprint,
  generateContentHash,
  FINGERPRINT_VERSION,
} from './fingerprint.js';

export interface InboundQueueItem {
  id: string;
  tenant_id: string | null;
  gmail_message_id: string;
  gmail_history_id: string | null;
  payload_url: string | null;
  // New storage columns for reliable access
  storage_bucket: string | null;
  storage_path: string | null;
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

/**
 * Process a single inbound email from the queue
 */
export async function processInboundEmail(item: InboundQueueItem): Promise<InboundProcessResult> {
  try {
    // Mark as processing
    await supabase
      .from('email_queue')
      .update({ status: 'processing', attempts: item.attempts + 1 })
      .eq('id', item.id);
    
    // Check if already processed
    const { count } = await supabase
      .from('load_emails')
      .select('id', { count: 'exact', head: true })
      .eq('email_id', item.gmail_message_id);
    
    if (count && count > 0) {
      await supabase
        .from('email_queue')
        .update({ status: 'completed', processed_at: new Date().toISOString() })
        .eq('id', item.id);
      return { success: true };
    }
    
    // Load the email payload from storage
    // Priority: use storage_bucket + storage_path if available, fallback to payload_url
    let message: any = null;
    
    // Determine bucket and path
    const bucket = item.storage_bucket || 'email-content';
    const storagePath = item.storage_path || item.payload_url;
    
    if (storagePath) {
      console.log(`[inbound] Attempting storage download: bucket=${bucket} path=${storagePath} messageId=${item.gmail_message_id}`);
      
      try {
        const { data: payloadData, error: storageError } = await supabase
          .storage
          .from(bucket)
          .download(storagePath);
        
        if (storageError) {
          // Log the FULL error object for debugging
          console.error(`[inbound] Storage download failed for ${item.gmail_message_id}:`, {
            bucket,
            path: storagePath,
            errorMessage: storageError.message,
            errorName: storageError.name,
            errorCause: (storageError as any).cause,
            fullError: JSON.stringify(storageError, null, 2),
          });
        } else if (payloadData) {
          const payloadText = await payloadData.text();
          message = JSON.parse(payloadText);
          console.log(`[inbound] Successfully loaded message from storage: bucket=${bucket} path=${storagePath}`);
        } else {
          console.warn(`[inbound] Storage returned no data: bucket=${bucket} path=${storagePath}`);
        }
      } catch (e) {
        const errorMsg = e instanceof Error ? e.message : String(e);
        console.error(`[inbound] Storage download exception for ${item.gmail_message_id}:`, {
          bucket,
          path: storagePath,
          error: errorMsg,
          stack: e instanceof Error ? e.stack : undefined,
        });
      }
    } else {
      console.warn(`[inbound] No storage path available for ${item.gmail_message_id}`);
    }
    
    if (!message) {
      // No stored payload - need to fail gracefully
      // (VPS doesn't have Gmail API access like Edge Functions)
      throw new Error(`No stored payload available for ${item.gmail_message_id}. bucket=${bucket} path=${storagePath}. VPS cannot access Gmail API directly.`);
    }
    
    // Guard: Validate message structure before processing
    if (!message.payload || typeof message.payload !== 'object') {
      console.error(`[inbound] Invalid message structure for ${item.gmail_message_id}: missing or invalid payload`);
      throw new Error('Invalid email payload structure: missing payload object');
    }
    
    // Extract email data
    const headers = message.payload?.headers || [];
    const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value;
    
    const subject = getHeader('Subject') || '';
    const from = getHeader('From') || '';
    const receivedAt = message.internalDate 
      ? new Date(parseInt(message.internalDate, 10)) 
      : new Date();
    
    // Extract body - with defensive checks for missing payload structure
    const extractBody = (part: any, mimeType: string): string => {
      // Guard against undefined/null parts
      if (!part || typeof part !== 'object') return '';
      
      // Guard against missing mimeType property
      if (typeof part.mimeType !== 'string') {
        // Still check nested parts if they exist
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
    
    // Ensure message.payload exists before extracting body
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
      console.log(`[inbound] Detected Full Circle TMS email source`);
    }
    
    // Parse based on source
    let parsedData: ParsedEmailData;
    if (isFullCircleTMS) {
      parsedData = parseFullCircleTMSEmail(subject, bodyText, bodyHtml);
    } else {
      const subjectData = parseSubjectLine(subject);
      const bodyData = parseSylectusEmail(subject, bodyText);
      parsedData = { ...bodyData, ...subjectData };
    }
    
    // If origin_city is missing but we have origin_zip, look up the city
    if (!parsedData.origin_city && parsedData.origin_zip) {
      console.log(`[inbound] Missing origin city, looking up zip ${parsedData.origin_zip}`);
      const cityData = await lookupCityFromZip(parsedData.origin_zip, parsedData.origin_state);
      if (cityData) {
        parsedData.origin_city = cityData.city;
        parsedData.origin_state = cityData.state;
      }
    }
    
    // Similarly for destination
    if (!parsedData.destination_city && parsedData.destination_zip) {
      const cityData = await lookupCityFromZip(parsedData.destination_zip, parsedData.destination_state);
      if (cityData) {
        parsedData.destination_city = cityData.city;
        parsedData.destination_state = cityData.state;
      }
    }
    
    // Geocode if we have origin location
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
    
    // Check for issues
    const hasIssues = (!parsedData.broker_email && !isFullCircleTMS) || !parsedData.origin_city || !parsedData.vehicle_type || geocodeFailed;
    const issueNotes: string[] = [];
    if (!parsedData.broker_email && !isFullCircleTMS) issueNotes.push('Missing broker email');
    if (!parsedData.origin_city) issueNotes.push('Missing origin location');
    if (!parsedData.vehicle_type) issueNotes.push('Missing vehicle type');
    if (geocodeFailed) issueNotes.push(`Geocoding failed: ${geocodingErrorCode}`);
    
    // Extract sender info
    const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/);
    const fromName = fromMatch ? fromMatch[1].trim() : from;
    const fromEmail = fromMatch ? fromMatch[2] : from;
    
    const tenantId = item.tenant_id;
    
    // For Full Circle TMS: create/update customer with MC#
    if (isFullCircleTMS && parsedData.broker_company && tenantId) {
      const customerName = parsedData.broker_company;
      
      const { data: existingCustomer } = await supabase
        .from('customers')
        .select('id, mc_number')
        .ilike('name', customerName)
        .eq('tenant_id', tenantId)
        .maybeSingle();
      
      if (existingCustomer) {
        if (!existingCustomer.mc_number && parsedData.mc_number) {
          await supabase
            .from('customers')
            .update({ mc_number: parsedData.mc_number })
            .eq('id', existingCustomer.id);
          console.log(`[inbound] Updated customer ${customerName} with MC# ${parsedData.mc_number}`);
        }
      } else {
        await supabase
          .from('customers')
          .insert({
            name: customerName,
            mc_number: parsedData.mc_number || null,
            contact_name: parsedData.broker_name || null,
            phone: parsedData.broker_phone || null,
            address: parsedData.broker_address || null,
            city: parsedData.broker_city || null,
            state: parsedData.broker_state || null,
            zip: parsedData.broker_zip || null,
            tenant_id: tenantId,
          });
        console.log(`[inbound] Created customer ${customerName} with MC# ${parsedData.mc_number}`);
      }
    }
    
    // Generate hashes
    const contentHash = generateContentHash(parsedData);
    const fingerprintResult = computeParsedLoadFingerprint(parsedData);
    const {
      fingerprint: parsedLoadFingerprint,
      canonicalPayload,
      dedupEligible,
      dedupEligibleReason,
      fingerprintMissingReason,
    } = fingerprintResult;
    
    if (parsedLoadFingerprint) {
      console.log(`[inbound] Fingerprint: ${parsedLoadFingerprint.substring(0, 12)}... | Dedup eligible: ${dedupEligible}`);
    }
    
    let isDuplicate = false;
    let duplicateOfId: string | null = null;
    let loadContentFingerprint: string | null = null;
    let loadContentMissingReason: string | null = fingerprintMissingReason;
    
    if (dedupEligible && parsedLoadFingerprint && canonicalPayload) {
      const existingDuplicate = await findExistingByFingerprint(parsedLoadFingerprint, tenantId, 168);
      
      if (existingDuplicate) {
        isDuplicate = true;
        duplicateOfId = existingDuplicate.id;
        console.log(`[inbound] DUPLICATE detected: matches ${existingDuplicate.load_id}`);
      }
      
      // Upsert to load_content table
      const canonicalPayloadJson = JSON.stringify(canonicalPayload);
      const sizeBytes = Buffer.byteLength(canonicalPayloadJson, 'utf8');
      
      const { error: upsertError } = await supabase.rpc('upsert_load_content', {
        p_fingerprint: parsedLoadFingerprint,
        p_canonical_payload: canonicalPayload,
        p_fingerprint_version: FINGERPRINT_VERSION,
        p_size_bytes: sizeBytes,
        p_provider: emailSource || null,
      });
      
      if (upsertError) {
        console.warn(`[inbound] load_content upsert failed: ${upsertError.message}`);
        loadContentMissingReason = 'load_content_upsert_failed';
      } else {
        loadContentFingerprint = parsedLoadFingerprint;
        loadContentMissingReason = null;
      }
    }
    
    // Check for updates (legacy content hash)
    const existingSimilarLoad = await findExistingSimilarLoad(contentHash, tenantId, 48);
    
    let isUpdate = false;
    let parentEmailId: string | null = null;
    
    if (existingSimilarLoad && !isDuplicate) {
      isUpdate = true;
      parentEmailId = existingSimilarLoad.id;
      console.log(`[inbound] Detected update to existing load ${existingSimilarLoad.load_id}`);
    }
    
    // Determine geocoding status
    const hasCoordinates = parsedData.pickup_coordinates?.lat && parsedData.pickup_coordinates?.lng;
    const geocodingStatus = hasCoordinates 
      ? 'success' 
      : (geocodingWasAttempted ? 'failed' : 'pending');
    
    // FAILSAFE: 3-rule expiration correction (backup if parser missed it)
    const now = Date.now();
    
    // Rule 1: Ensure posted_at exists
    if (!parsedData.posted_at) {
      parsedData.posted_at = new Date(now).toISOString();
      console.log(`[inbound] FAILSAFE Rule 1: posted_at was null, set to now`);
    }
    
    // Rule 2: Ensure expires_at is valid relative to posted_at
    const postedTime = new Date(parsedData.posted_at).getTime();
    if (!parsedData.expires_at) {
      parsedData.expires_at = new Date(postedTime + 30 * 60 * 1000).toISOString();
      console.log(`[inbound] FAILSAFE Rule 2: expires_at was null, set to posted_at + 30min`);
    } else {
      const expiresTime = new Date(parsedData.expires_at).getTime();
      if (expiresTime <= postedTime) {
        parsedData.expires_at = new Date(postedTime + 30 * 60 * 1000).toISOString();
        console.log(`[inbound] FAILSAFE Rule 2: expires_at <= posted_at, corrected to posted_at + 30min`);
      }
    }
    
    // Rule 3: Ensure expires_at is not already in the past
    const finalExpiresTime = new Date(parsedData.expires_at).getTime();
    if (finalExpiresTime < now) {
      parsedData.expires_at = new Date(now + 30 * 60 * 1000).toISOString();
      console.log(`[inbound] FAILSAFE Rule 3: expires_at was already expired, extended to now + 30min`);
    }
    
    // Insert into load_emails
    const { data: insertedEmail, error: insertError } = await supabase
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
      .single();
    
    if (insertError) throw insertError;
    
    // Mark queue item as completed with parsed_at timestamp
    // parsed_at is set ONLY here after: payload fetch + parsing + load_emails upsert all succeeded
    await supabase
      .from('email_queue')
      .update({ 
        status: 'completed', 
        processed_at: new Date().toISOString(),
        parsed_at: new Date().toISOString(),
      })
      .eq('id', item.id);
    
    // Hunt matching
    if (insertedEmail && parsedData.pickup_coordinates && parsedData.vehicle_type) {
      const hasFp = loadContentFingerprint && loadContentFingerprint.trim() !== '';
      const hasReceivedAt = !!receivedAt;
      const hasTenant = !!tenantId;
      
      if (hasFp && hasReceivedAt && hasTenant) {
        matchLoadToHunts(
          insertedEmail.id,
          insertedEmail.load_id,
          parsedData,
          tenantId,
          loadContentFingerprint,
          receivedAt
        ).catch(() => {});
      }
    }
    
    return {
      success: true,
      loadId: insertedEmail?.load_id,
      isUpdate,
      isDuplicate,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const newStatus = item.attempts >= 3 ? 'failed' : 'pending';
    
    await supabase
      .from('email_queue')
      .update({ status: newStatus, last_error: errorMessage })
      .eq('id', item.id);
    
    console.error(`[inbound] Error processing ${item.gmail_message_id}:`, errorMessage);
    return { success: false, error: errorMessage };
  }
}

/**
 * One-time verification: Check if storage is accessible for newest queue items.
 * Call this once at worker startup to confirm storage connectivity.
 */
export async function verifyStorageAccess(): Promise<void> {
  console.log('[inbound] Running storage access verification...');
  
  // Get 3 newest items with storage info
  const { data: items, error: queryError } = await supabase
    .from('email_queue')
    .select('id, gmail_message_id, payload_url, storage_bucket, storage_path')
    .not('payload_url', 'is', null)
    .is('to_email', null)
    .order('queued_at', { ascending: false })
    .limit(3);
  
  if (queryError) {
    console.error('[inbound] Storage verification query failed:', queryError.message);
    return;
  }
  
  if (!items || items.length === 0) {
    console.log('[inbound] No items to verify storage access');
    return;
  }
  
  console.log(`[inbound] Verifying ${items.length} storage objects...`);
  
  for (const item of items) {
    const bucket = item.storage_bucket || 'email-content';
    const path = item.storage_path || item.payload_url;
    
    if (!path) {
      console.warn(`[inbound] VERIFY: ${item.gmail_message_id} - no path available`);
      continue;
    }
    
    try {
      const { data, error } = await supabase.storage.from(bucket).download(path);
      
      if (error) {
        console.error(`[inbound] VERIFY FAILED: ${item.gmail_message_id}`, {
          bucket,
          path,
          error: error.message,
          errorName: error.name,
        });
      } else if (data) {
        const size = await data.arrayBuffer().then(b => b.byteLength);
        console.log(`[inbound] VERIFY OK: ${item.gmail_message_id} - bucket=${bucket} path=${path} size=${size} bytes`);
      } else {
        console.warn(`[inbound] VERIFY EMPTY: ${item.gmail_message_id} - no data returned`);
      }
    } catch (e) {
      console.error(`[inbound] VERIFY EXCEPTION: ${item.gmail_message_id}`, {
        bucket,
        path,
        error: e instanceof Error ? e.message : String(e),
      });
    }
  }
  
  console.log('[inbound] Storage verification complete');
}
