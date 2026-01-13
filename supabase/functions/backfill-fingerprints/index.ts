import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Fingerprint version - must match process-email-queue and fetch-gmail-loads
const FINGERPRINT_VERSION = 1;

// ============================================================================
// FINGERPRINT COMPUTATION - Copy from process-email-queue for consistency
// ============================================================================

function parseNumeric2Decimals(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number') {
    if (isNaN(value)) return null;
    return Math.round(value * 100) / 100;
  }
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    let normalized = trimmed;
    if (/,\d{2}$/.test(normalized)) {
      normalized = normalized.replace(/,(\d{2})$/, '.$1');
    }
    normalized = normalized.replace(/,/g, '');
    normalized = normalized.replace(/[^0-9.-]/g, '');
    if (normalized === '' || normalized === '-' || normalized === '.') return null;
    const parsed = parseFloat(normalized);
    if (isNaN(parsed)) return null;
    return Math.round(parsed * 100) / 100;
  }
  return null;
}

function parseIntStrict(value: any): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'number' && !isNaN(value)) return Math.floor(value);
  if (typeof value === 'string') {
    const cleaned = value.replace(/[^0-9-]/g, '');
    if (!cleaned) return null;
    const parsed = parseInt(cleaned, 10);
    return isNaN(parsed) ? null : parsed;
  }
  return null;
}

function normalizeStringStrict(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  return String(value).trim() || null;
}

function normalizeStringLower(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    return trimmed === '' ? null : trimmed;
  }
  return String(value).trim().toLowerCase() || null;
}

function normalizeDateStrict(dateStr: any): string | null {
  if (dateStr === null || dateStr === undefined) return null;
  if (typeof dateStr !== 'string') dateStr = String(dateStr);
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  const mmddyy = trimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
  if (mmddyy) {
    const month = mmddyy[1].padStart(2, '0');
    const day = mmddyy[2].padStart(2, '0');
    let year = mmddyy[3];
    if (year.length === 2) {
      year = parseInt(year) > 50 ? '19' + year : '20' + year;
    }
    return `${year}-${month}-${day}`;
  }
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  return null;
}

function normalizeBooleanStrict(value: any): boolean | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') {
    const lower = value.toLowerCase().trim();
    if (lower === 'true' || lower === 'yes' || lower === '1') return true;
    if (lower === 'false' || lower === 'no' || lower === '0') return false;
  }
  if (typeof value === 'number') return value !== 0;
  return null;
}

function normalizeStops(stops: any): any[] | null {
  if (stops === null || stops === undefined) return null;
  if (!Array.isArray(stops)) return null;
  if (stops.length === 0) return null;
  return stops.map((stop: any, index: number) => ({
    sequence: index,
    city: normalizeStringStrict(stop?.city),
    state: normalizeStringStrict(stop?.state)?.toUpperCase() || null,
    zip: normalizeStringStrict(stop?.zip),
    type: normalizeStringStrict(stop?.type)?.toLowerCase() || null,
    date: normalizeDateStrict(stop?.date),
    time: normalizeStringStrict(stop?.time),
  }));
}

// NOTE: Provider is NOT included in fingerprint - we want cross-provider dedup
function buildCanonicalLoadPayload(parsedData: Record<string, any>): Record<string, any> {
  return {
    fingerprint_version: FINGERPRINT_VERSION,
    // NOTE: provider intentionally NOT included
    
    broker_name: normalizeStringStrict(parsedData.broker_name),
    broker_company: normalizeStringStrict(parsedData.broker_company),
    broker_email: normalizeStringLower(parsedData.broker_email),
    broker_phone: normalizeStringStrict(parsedData.broker_phone),
    broker_address: normalizeStringStrict(parsedData.broker_address),
    broker_city: normalizeStringStrict(parsedData.broker_city),
    broker_state: normalizeStringStrict(parsedData.broker_state)?.toUpperCase() || null,
    broker_zip: normalizeStringStrict(parsedData.broker_zip),
    broker_fax: normalizeStringStrict(parsedData.broker_fax),
    mc_number: normalizeStringStrict(parsedData.mc_number),
    
    order_number: normalizeStringStrict(parsedData.order_number),
    order_number_secondary: normalizeStringStrict(parsedData.order_number_secondary),
    customer: normalizeStringStrict(parsedData.customer),
    
    origin_city: normalizeStringStrict(parsedData.origin_city),
    origin_state: normalizeStringStrict(parsedData.origin_state)?.toUpperCase() || null,
    origin_zip: normalizeStringStrict(parsedData.origin_zip),
    
    destination_city: normalizeStringStrict(parsedData.destination_city),
    destination_state: normalizeStringStrict(parsedData.destination_state)?.toUpperCase() || null,
    destination_zip: normalizeStringStrict(parsedData.destination_zip),
    
    miles: parseNumeric2Decimals(parsedData.miles),
    loaded_miles: parseNumeric2Decimals(parsedData.loaded_miles),
    weight: parseNumeric2Decimals(parsedData.weight),
    pieces: parseIntStrict(parsedData.pieces),
    
    rate: parseNumeric2Decimals(parsedData.rate),
    posted_amount: parseNumeric2Decimals(parsedData.posted_amount),
    
    pickup_date: normalizeDateStrict(parsedData.pickup_date),
    pickup_time: normalizeStringStrict(parsedData.pickup_time),
    delivery_date: normalizeDateStrict(parsedData.delivery_date),
    delivery_time: normalizeStringStrict(parsedData.delivery_time),
    expires_datetime: normalizeStringStrict(parsedData.expires_datetime),
    expires_at: normalizeStringStrict(parsedData.expires_at),
    
    vehicle_type: normalizeStringStrict(parsedData.vehicle_type)?.toLowerCase() || null,
    load_type: normalizeStringStrict(parsedData.load_type)?.toLowerCase() || null,
    
    length: parseNumeric2Decimals(parsedData.length),
    width: parseNumeric2Decimals(parsedData.width),
    height: parseNumeric2Decimals(parsedData.height),
    dimensions: normalizeStringStrict(parsedData.dimensions),
    
    hazmat: normalizeBooleanStrict(parsedData.hazmat),
    team_required: normalizeBooleanStrict(parsedData.team_required),
    stackable: normalizeBooleanStrict(parsedData.stackable),
    dock_level: normalizeBooleanStrict(parsedData.dock_level),
    
    stops: normalizeStops(parsedData.stops),
    stop_count: parseIntStrict(parsedData.stop_count),
    has_multiple_stops: normalizeBooleanStrict(parsedData.has_multiple_stops),
    
    commodity: normalizeStringStrict(parsedData.commodity),
    special_instructions: normalizeStringStrict(parsedData.special_instructions),
    notes: normalizeStringStrict(parsedData.notes),
    
    broker: normalizeStringStrict((parsedData as any).broker),
    email: normalizeStringLower((parsedData as any).email),
    customer_name: normalizeStringStrict((parsedData as any).customer_name),
  };
}

function isDedupEligible(canonicalPayload: Record<string, any>): { eligible: boolean; reason: string | null } {
  const hasOrigin = canonicalPayload.origin_city && canonicalPayload.origin_state;
  const hasDestination = canonicalPayload.destination_city && canonicalPayload.destination_state;
  const hasBrokerIdentity = canonicalPayload.broker_company || canonicalPayload.broker_name || canonicalPayload.broker_email || canonicalPayload.mc_number;
  const hasPickupDate = canonicalPayload.pickup_date;
  
  if (!hasOrigin) return { eligible: false, reason: 'missing_origin_location' };
  if (!hasDestination) return { eligible: false, reason: 'missing_destination_location' };
  if (!hasBrokerIdentity) return { eligible: false, reason: 'missing_broker_identity' };
  if (!hasPickupDate) return { eligible: false, reason: 'missing_pickup_date' };
  
  return { eligible: true, reason: null };
}

async function computeFingerprint(parsedData: Record<string, any>): Promise<{
  fingerprint: string | null;
  canonicalPayload: Record<string, any> | null;
  dedupEligible: boolean;
  dedupEligibleReason: string | null;
}> {
  if (!parsedData) {
    return { fingerprint: null, canonicalPayload: null, dedupEligible: false, dedupEligibleReason: 'missing_inputs' };
  }
  
  try {
    const canonicalPayload = buildCanonicalLoadPayload(parsedData);
    const eligibility = isDedupEligible(canonicalPayload);
    
    function sortObjectKeys(obj: any): any {
      if (obj === null || typeof obj !== 'object') return obj;
      if (Array.isArray(obj)) return obj.map(sortObjectKeys);
      const sorted: Record<string, any> = {};
      for (const key of Object.keys(obj).sort()) {
        sorted[key] = sortObjectKeys(obj[key]);
      }
      return sorted;
    }
    
    const sortedPayload = sortObjectKeys(canonicalPayload);
    const payloadString = JSON.stringify(sortedPayload);
    
    const encoder = new TextEncoder();
    const data = encoder.encode(payloadString);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const fingerprint = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    return {
      fingerprint,
      canonicalPayload: sortedPayload,
      dedupEligible: eligibility.eligible,
      dedupEligibleReason: eligibility.reason,
    };
  } catch (error) {
    console.error(`[backfill] Exception computing fingerprint: ${error}`);
    return { fingerprint: null, canonicalPayload: null, dedupEligible: false, dedupEligibleReason: 'exception' };
  }
}

// ============================================================================
// MAIN HANDLER
// ============================================================================

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }
  
  try {
    // Verify admin/platform-admin access
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Check platform admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single();
    
    if (!profile?.is_platform_admin) {
      return new Response(JSON.stringify({ error: 'Platform admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Parse request body
    const body = await req.json().catch(() => ({}));
    const daysBack = body.days_back || 7;
    const batchSize = body.batch_size || 100;
    const maxBatches = body.max_batches || 50;
    const dryRun = body.dry_run === true;
    
    const cutoffDate = new Date(Date.now() - daysBack * 24 * 60 * 60 * 1000).toISOString();
    
    console.log(`[backfill] Starting fingerprint backfill | daysBack=${daysBack} | cutoff=${cutoffDate} | dryRun=${dryRun} | maxBatches=${maxBatches}`);
    
    // ========================================================================
    // PHASE 1: Find rows missing parsed_load_fingerprint (with deterministic pagination)
    // ========================================================================
    const parsedFpStats: Record<string, { updated: number; failed: number; skipped: number }> = {};
    let parsedFpUpdated = 0;
    let parsedFpFailed = 0;
    let parsedFpSkipped = 0;
    let parsedFpBatches = 0;
    let parsedFpTotalCandidates = 0;
    
    // Cursor-based pagination: (received_at, id)
    let lastReceivedAt: string | null = null;
    let lastId: string | null = null;
    
    while (parsedFpBatches < maxBatches) {
      // Build query with cursor-based pagination
      let query = supabase
        .from('load_emails')
        .select('id, tenant_id, email_source, ingestion_source, parsed_data, received_at')
        .gte('received_at', cutoffDate)
        .is('parsed_load_fingerprint', null)
        .order('received_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(batchSize);
      
      // Apply cursor if we have one
      if (lastReceivedAt && lastId) {
        query = query.or(`received_at.gt.${lastReceivedAt},and(received_at.eq.${lastReceivedAt},id.gt.${lastId})`);
      }
      
      const { data: missingParsedFp, error: mpfError } = await query;
      
      if (mpfError) {
        console.error(`[backfill] Error fetching missing parsed_load_fingerprint: ${mpfError.message}`);
        break;
      }
      
      if (!missingParsedFp || missingParsedFp.length === 0) {
        console.log(`[backfill] Phase 1: No more rows to process after ${parsedFpBatches} batches`);
        break;
      }
      
      parsedFpBatches++;
      parsedFpTotalCandidates += missingParsedFp.length;
      console.log(`[backfill] Phase 1 batch ${parsedFpBatches}: processing ${missingParsedFp.length} rows`);
      
      for (const row of missingParsedFp) {
        const key = `${row.email_source || 'unknown'}|${row.ingestion_source || 'unknown'}`;
        if (!parsedFpStats[key]) {
          parsedFpStats[key] = { updated: 0, failed: 0, skipped: 0 };
        }
        
        const parsedData = row.parsed_data as Record<string, any>;
        
        if (!parsedData || typeof parsedData !== 'object') {
          parsedFpStats[key].skipped++;
          parsedFpSkipped++;
          
          if (!dryRun) {
            await supabase
              .from('load_emails')
              .update({ fingerprint_missing_reason: 'missing_parsed_data' })
              .eq('id', row.id);
          }
          continue;
        }
        
        const result = await computeFingerprint(parsedData);
        
        if (!result.fingerprint) {
          parsedFpStats[key].skipped++;
          parsedFpSkipped++;
          
          if (!dryRun) {
            await supabase
              .from('load_emails')
              .update({ fingerprint_missing_reason: result.dedupEligibleReason || 'backfill_compute_failed' })
              .eq('id', row.id);
          }
          continue;
        }
        
        if (!dryRun) {
          const { error: updateError } = await supabase
            .from('load_emails')
            .update({
              parsed_load_fingerprint: result.fingerprint,
              dedup_eligible: result.dedupEligible,
              dedup_eligible_reason: result.dedupEligible ? null : result.dedupEligibleReason,
              fingerprint_missing_reason: null,
            })
            .eq('id', row.id);
          
          if (updateError) {
            console.warn(`[backfill] Failed to update parsed_load_fingerprint for ${row.id}: ${updateError.message}`);
            parsedFpStats[key].failed++;
            parsedFpFailed++;
          } else {
            parsedFpStats[key].updated++;
            parsedFpUpdated++;
          }
        } else {
          parsedFpStats[key].updated++;
          parsedFpUpdated++;
        }
      }
      
      // Update cursor for next batch
      const lastRow = missingParsedFp[missingParsedFp.length - 1];
      lastReceivedAt = lastRow.received_at;
      lastId = lastRow.id;
    }
    
    // ========================================================================
    // PHASE 2: Find dedup_eligible rows missing load_content_fingerprint (deterministic pagination)
    // ========================================================================
    const contentFkStats: Record<string, { updated: number; failed: number }> = {};
    let contentFkUpdated = 0;
    let contentFkFailed = 0;
    let contentFkBatches = 0;
    let contentFkTotalCandidates = 0;
    
    // Reset cursor for Phase 2
    let phase2LastReceivedAt: string | null = null;
    let phase2LastId: string | null = null;
    
    while (contentFkBatches < maxBatches) {
      // Build query with cursor-based pagination
      let p2Query = supabase
        .from('load_emails')
        .select('id, tenant_id, email_source, ingestion_source, parsed_data, parsed_load_fingerprint, received_at')
        .gte('received_at', cutoffDate)
        .eq('dedup_eligible', true)
        .is('load_content_fingerprint', null)
        .not('parsed_load_fingerprint', 'is', null)
        .order('received_at', { ascending: true })
        .order('id', { ascending: true })
        .limit(batchSize);
      
      // Apply cursor if we have one
      if (phase2LastReceivedAt && phase2LastId) {
        p2Query = p2Query.or(`received_at.gt.${phase2LastReceivedAt},and(received_at.eq.${phase2LastReceivedAt},id.gt.${phase2LastId})`);
      }
      
      const { data: missingContentFk, error: mcfError } = await p2Query;
      
      if (mcfError) {
        console.error(`[backfill] Error fetching missing load_content_fingerprint: ${mcfError.message}`);
        break;
      }
      
      if (!missingContentFk || missingContentFk.length === 0) {
        console.log(`[backfill] Phase 2: No more rows to process after ${contentFkBatches} batches`);
        break;
      }
      
      contentFkBatches++;
      contentFkTotalCandidates += missingContentFk.length;
      console.log(`[backfill] Phase 2 batch ${contentFkBatches}: processing ${missingContentFk.length} rows`);
      
      for (const row of missingContentFk) {
        const key = `${row.email_source || 'unknown'}|${row.ingestion_source || 'unknown'}`;
        if (!contentFkStats[key]) {
          contentFkStats[key] = { updated: 0, failed: 0 };
        }
        
        const fingerprint = row.parsed_load_fingerprint;
        const parsedData = row.parsed_data as Record<string, any>;
        
        if (!fingerprint) {
          contentFkStats[key].failed++;
          contentFkFailed++;
          continue;
        }
        
        // Recompute canonical payload for load_content upsert
        const result = await computeFingerprint(parsedData);
        
        if (!dryRun && result.fingerprint && result.canonicalPayload) {
          const canonicalPayloadJson = JSON.stringify(result.canonicalPayload);
          const sizeBytes = new TextEncoder().encode(canonicalPayloadJson).length;
          
          // Use unified RPC: upsert_load_content (handles insert/increment atomically)
          const { error: upsertError } = await supabase.rpc('upsert_load_content', {
            p_fingerprint: result.fingerprint,
            p_canonical_payload: result.canonicalPayload,
            p_fingerprint_version: FINGERPRINT_VERSION,
            p_size_bytes: sizeBytes,
            p_provider: row.email_source || null,
          });
          
          if (upsertError) {
            console.warn(`[backfill] load_content upsert failed for ${row.id}: ${upsertError.message}`);
          }
          
          // Update load_emails with FK
          const { error: leError } = await supabase
            .from('load_emails')
            .update({
              load_content_fingerprint: result.fingerprint,
              fingerprint_missing_reason: null,
            })
            .eq('id', row.id);
          
          if (leError) {
            console.warn(`[backfill] Failed to update load_content_fingerprint for ${row.id}: ${leError.message}`);
            contentFkStats[key].failed++;
            contentFkFailed++;
          } else {
            contentFkStats[key].updated++;
            contentFkUpdated++;
          }
        } else if (dryRun) {
          contentFkStats[key].updated++;
          contentFkUpdated++;
        }
      }
      
      // Update cursor for next batch
      const lastRowP2 = missingContentFk[missingContentFk.length - 1];
      phase2LastReceivedAt = lastRowP2.received_at;
      phase2LastId = lastRowP2.id;
    }
    
    const response = {
      success: true,
      dry_run: dryRun,
      cutoff_date: cutoffDate,
      days_back: daysBack,
      batch_size: batchSize,
      max_batches: maxBatches,
      
      parsed_load_fingerprint: {
        batches_processed: parsedFpBatches,
        total_candidates: parsedFpTotalCandidates,
        updated: parsedFpUpdated,
        failed: parsedFpFailed,
        skipped: parsedFpSkipped,
        by_source: parsedFpStats,
      },
      
      load_content_fingerprint: {
        batches_processed: contentFkBatches,
        total_candidates: contentFkTotalCandidates,
        updated: contentFkUpdated,
        failed: contentFkFailed,
        by_source: contentFkStats,
      },
    };
    
    console.log(`[backfill] Complete | ${JSON.stringify(response)}`);
    
    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
    
  } catch (error) {
    console.error(`[backfill] Error: ${error}`);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
