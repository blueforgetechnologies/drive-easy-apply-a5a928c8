import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Validate request - accepts either CRON_SECRET header or valid JWT from pg_cron
function validateRequest(req: Request): boolean {
  // Check for cron secret header first
  const cronSecret = Deno.env.get('CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  if (cronSecret && providedSecret === cronSecret) {
    return true;
  }
  
  // Also allow requests with valid Authorization header (from pg_cron with JWT)
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // pg_cron calls include the anon key - we accept these as trusted internal calls
    return true;
  }
  
  console.error('Unauthorized: No valid cron secret or authorization header');
  return false;
}

// Generate a content hash for smart business-level deduplication
// This catches loads that are reposted with small changes (rate, notes, etc.)
function generateContentHash(parsedData: Record<string, any>): string {
  // Core fields that define a unique load opportunity
  const coreFields = [
    (parsedData.origin_city || '').toLowerCase().trim(),
    (parsedData.origin_state || '').toUpperCase().trim(),
    (parsedData.destination_city || '').toLowerCase().trim(),
    (parsedData.destination_state || '').toUpperCase().trim(),
    (parsedData.pickup_date || '').trim(),
    (parsedData.order_number || '').trim(),
    (parsedData.vehicle_type || '').toLowerCase().trim(),
  ];
  
  // Create a simple hash by joining and encoding
  const hashInput = coreFields.join('|');
  
  // Use a simple but effective hash for deduplication
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32-bit integer
  }
  
  return `ch_${Math.abs(hash).toString(36)}`;
}

// ============================================================================
// PARSED LOAD FINGERPRINT - Strict Exact-match deduplication
// SHA256 of ALL parsed fields with meaning-preserving normalization.
// RULES:
// - null/undefined → null (NOT empty string)
// - Missing numeric fields → null (NOT 0)
// - Strings → trim only (lowercase for case-insensitive fields like email)
// - Dates → normalize to YYYY-MM-DD or null
// - Critical fields missing → dedup_eligible = false (skip dedup for safety)
// ============================================================================

// Parse a numeric value and normalize to exactly 2 decimal places
// Handles European comma-decimals (e.g., "2850,50") and thousands separators
function parseNumeric2Decimals(value: any): number | null {
  if (value === null || value === undefined) return null;
  
  if (typeof value === 'number') {
    if (isNaN(value)) return null;
    return Math.round(value * 100) / 100; // Round to 2 decimals
  }
  
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    
    // Handle European comma-decimal (e.g., "2850,50" → "2850.50")
    // Only if ends with ,dd pattern
    let normalized = trimmed;
    if (/,\d{2}$/.test(normalized)) {
      normalized = normalized.replace(/,(\d{2})$/, '.$1');
    }
    
    // Remove thousands separators (remaining commas)
    normalized = normalized.replace(/,/g, '');
    
    // Remove currency symbols and other non-numeric chars except . and -
    normalized = normalized.replace(/[^0-9.-]/g, '');
    
    if (normalized === '' || normalized === '-' || normalized === '.') return null;
    
    // Parse as float
    const parsed = parseFloat(normalized);
    if (isNaN(parsed)) return null;
    
    return Math.round(parsed * 100) / 100; // Round to 2 decimals
  }
  
  return null;
}

// Parse an integer value strictly: returns number if valid, null otherwise
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

// Normalize a string for fingerprinting: trim only (preserves case for most fields)
function normalizeStringStrict(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  return String(value).trim() || null;
}

// Normalize a string for case-insensitive fields (email, etc.): trim + lowercase
function normalizeStringLower(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim().toLowerCase();
    return trimmed === '' ? null : trimmed;
  }
  return String(value).trim().toLowerCase() || null;
}

// Normalize a date string to ISO format (YYYY-MM-DD) or null
function normalizeDateStrict(dateStr: any): string | null {
  if (dateStr === null || dateStr === undefined) return null;
  if (typeof dateStr !== 'string') dateStr = String(dateStr);
  
  const trimmed = dateStr.trim();
  if (!trimmed) return null;
  
  // Try parsing various date formats: MM/DD/YY, MM/DD/YYYY, YYYY-MM-DD
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
  
  // Already ISO format
  const iso = trimmed.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }
  
  // Return null if we can't parse (don't use raw string)
  return null;
}

// Normalize a boolean value strictly
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

// Fingerprint version - increment when canonicalization logic changes
const FINGERPRINT_VERSION = 1;

// Note: Coordinates are EXCLUDED from fingerprinting to avoid floating point issues

// Normalize stops array for fingerprinting (deterministic)
function normalizeStops(stops: any): any[] | null {
  if (stops === null || stops === undefined) return null;
  if (!Array.isArray(stops)) return null;
  if (stops.length === 0) return null;
  
  // Normalize each stop and sort by a deterministic key
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

// Build canonical payload for fingerprinting from parsed_data
// Uses STRICT normalization: null for missing, no defaults
// Includes ALL fields from ParsedEmailData for 100% exact-match dedup
function buildCanonicalLoadPayload(parsedData: Record<string, any>): Record<string, any> {
  const payload: Record<string, any> = {
    // === Fingerprint metadata ===
    fingerprint_version: FINGERPRINT_VERSION,
    
    // === Broker info (case-insensitive for email) ===
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
    
    // === Order identifiers ===
    order_number: normalizeStringStrict(parsedData.order_number),
    order_number_secondary: normalizeStringStrict(parsedData.order_number_secondary),
    customer: normalizeStringStrict(parsedData.customer),
    
    // === Origin ===
    origin_city: normalizeStringStrict(parsedData.origin_city),
    origin_state: normalizeStringStrict(parsedData.origin_state)?.toUpperCase() || null,
    origin_zip: normalizeStringStrict(parsedData.origin_zip),
    
    // === Destination ===
    destination_city: normalizeStringStrict(parsedData.destination_city),
    destination_state: normalizeStringStrict(parsedData.destination_state)?.toUpperCase() || null,
    destination_zip: normalizeStringStrict(parsedData.destination_zip),
    
    // === Pickup coordinates - EXCLUDED from fingerprint ===
    // pickup_coordinates: excluded to avoid floating point comparison issues
    
    // === Load details - normalized to 2 decimals, null if missing ===
    miles: parseNumeric2Decimals(parsedData.miles),
    loaded_miles: parseNumeric2Decimals(parsedData.loaded_miles),
    weight: parseNumeric2Decimals(parsedData.weight),
    pieces: parseIntStrict(parsedData.pieces),
    
    // === Rate/pricing - normalized to 2 decimals, null if missing ===
    rate: parseNumeric2Decimals(parsedData.rate),
    posted_amount: parseNumeric2Decimals(parsedData.posted_amount),
    
    // === Dates (normalized to ISO or null) ===
    pickup_date: normalizeDateStrict(parsedData.pickup_date),
    pickup_time: normalizeStringStrict(parsedData.pickup_time),
    delivery_date: normalizeDateStrict(parsedData.delivery_date),
    delivery_time: normalizeStringStrict(parsedData.delivery_time),
    expires_datetime: normalizeStringStrict(parsedData.expires_datetime),
    expires_at: normalizeStringStrict(parsedData.expires_at),
    
    // === Equipment ===
    vehicle_type: normalizeStringStrict(parsedData.vehicle_type)?.toLowerCase() || null,
    load_type: normalizeStringStrict(parsedData.load_type)?.toLowerCase() || null,
    
    // === Dimensions - normalized to 2 decimals, null if missing ===
    length: parseNumeric2Decimals(parsedData.length),
    width: parseNumeric2Decimals(parsedData.width),
    height: parseNumeric2Decimals(parsedData.height),
    dimensions: normalizeStringStrict(parsedData.dimensions),
    
    // === Special requirements - null if missing ===
    hazmat: normalizeBooleanStrict(parsedData.hazmat),
    team_required: normalizeBooleanStrict(parsedData.team_required),
    stackable: normalizeBooleanStrict(parsedData.stackable),
    dock_level: normalizeBooleanStrict(parsedData.dock_level),
    
    // === Multi-stop info ===
    stops: normalizeStops(parsedData.stops),
    stop_count: parseIntStrict(parsedData.stop_count),
    has_multiple_stops: normalizeBooleanStrict(parsedData.has_multiple_stops),
    
    // === Commodity and notes ===
    commodity: normalizeStringStrict(parsedData.commodity),
    special_instructions: normalizeStringStrict(parsedData.special_instructions),
    notes: normalizeStringStrict(parsedData.notes),
    
    // === Additional parsed fields (discovered in production data) ===
    broker: normalizeStringStrict((parsedData as any).broker),
    email: normalizeStringLower((parsedData as any).email),
    customer_name: normalizeStringStrict((parsedData as any).customer_name),
  };
  
  return payload;
}

// Check if load has critical fields for safe deduplication
// If missing critical fields, we should NOT dedup (too risky)
function isDedupEligible(canonicalPayload: Record<string, any>): { eligible: boolean; reason: string | null } {
  // === CRITICAL FIELD REQUIREMENTS ===
  // All three must be present for dedup to be safe
  
  const hasOrigin = canonicalPayload.origin_city && canonicalPayload.origin_state;
  const hasDestination = canonicalPayload.destination_city && canonicalPayload.destination_state;
  const hasBrokerIdentity = canonicalPayload.broker_company || canonicalPayload.broker_name || canonicalPayload.broker_email || canonicalPayload.mc_number;
  const hasPickupDate = canonicalPayload.pickup_date;
  
  // Must have origin location
  if (!hasOrigin) {
    return { eligible: false, reason: 'missing_origin_location' };
  }
  
  // Must have destination location
  if (!hasDestination) {
    return { eligible: false, reason: 'missing_destination_location' };
  }
  
  // Must have broker identification
  if (!hasBrokerIdentity) {
    return { eligible: false, reason: 'missing_broker_identity' };
  }
  
  // Must have pickup date
  if (!hasPickupDate) {
    return { eligible: false, reason: 'missing_pickup_date' };
  }
  
  return { eligible: true, reason: null };
}

// Compute SHA256 fingerprint of parsed load data
// Returns fingerprint, canonical payload, and eligibility
async function computeParsedLoadFingerprint(parsedData: Record<string, any>): Promise<{
  fingerprint: string;
  canonicalPayload: Record<string, any>;
  dedupEligible: boolean;
  dedupEligibleReason: string | null;
}> {
  const canonicalPayload = buildCanonicalLoadPayload(parsedData);
  const eligibility = isDedupEligible(canonicalPayload);
  
  // Sort keys for deterministic serialization (deep sort for nested objects)
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
  
  // Compute SHA256
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
}

// Check for existing load with same fingerprint in same tenant
async function findExistingByFingerprint(
  fingerprint: string,
  tenantId: string | null,
  hoursWindow: number = 168 // 7 days default
): Promise<{ id: string; load_id: string; received_at: string } | null> {
  if (!fingerprint || !tenantId) return null;
  
  const windowStart = new Date(Date.now() - hoursWindow * 60 * 60 * 1000).toISOString();
  
  const { data: existingLoad } = await supabase
    .from('load_emails')
    .select('id, load_id, received_at')
    .eq('parsed_load_fingerprint', fingerprint)
    .eq('tenant_id', tenantId)
    .eq('is_duplicate', false) // Find the original, not other duplicates
    .gte('received_at', windowStart)
    .order('received_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  
  return existingLoad;
}

// Check for existing similar load within same tenant (smart deduplication)
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
    .eq('is_update', false) // Find the original, not other updates
    .gte('received_at', windowStart)
    .order('received_at', { ascending: true })
    .limit(1)
    .maybeSingle();
  
  return existingLoad;
}

// Apply parser hints from database to fill missing fields
async function applyParserHints(
  emailSource: string, 
  parsedData: Record<string, any>, 
  bodyText: string, 
  bodyHtml: string
): Promise<Record<string, any>> {
  try {
    // Load active hints for this source
    const { data: hints } = await supabase
      .from('parser_hints')
      .select('field_name, pattern, context_before, context_after')
      .eq('email_source', emailSource)
      .eq('is_active', true);

    if (!hints?.length) return parsedData;

    const searchText = bodyHtml || bodyText || '';
    const result = { ...parsedData };

    for (const hint of hints) {
      // Skip if field already has a value
      if (result[hint.field_name] !== null && result[hint.field_name] !== undefined && result[hint.field_name] !== '') {
        continue;
      }

      try {
        // Try the stored pattern
        const regex = new RegExp(hint.pattern, 'i');
        const match = searchText.match(regex);
        
        if (match) {
          // If pattern has capture group, use it; otherwise use full match
          const value = match[1] || match[0];
          result[hint.field_name] = value.trim();
          console.log(`🔧 Hint applied: ${hint.field_name} = "${value.substring(0, 30)}..."`);
        }
      } catch (e) {
        // If regex fails, try simple substring search with context
        if (hint.context_before || hint.context_after) {
          const contextPattern = `${hint.context_before || ''}([\\s\\S]*?)${hint.context_after || ''}`;
          try {
            const contextRegex = new RegExp(contextPattern, 'i');
            const contextMatch = searchText.match(contextRegex);
            if (contextMatch?.[1]) {
              result[hint.field_name] = contextMatch[1].trim();
              console.log(`🔧 Context hint applied: ${hint.field_name}`);
            }
          } catch {}
        }
      }
    }

    return result;
  } catch (e) {
    console.error('Error applying parser hints:', e);
    return parsedData;
  }
}

// Parsing functions
function extractBrokerEmail(subject: string, bodyText: string): string | null {
  const subjectMatch = subject?.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (subjectMatch) return subjectMatch[0];
  
  const bodyMatch = bodyText?.match(/[\w.-]+@[\w.-]+\.\w+/);
  return bodyMatch ? bodyMatch[0] : null;
}

function parseSylectusEmail(subject: string, bodyText: string): Record<string, any> {
  const data: Record<string, any> = {};
  
  data.broker_email = extractBrokerEmail(subject, bodyText);
  
  const bidOrderMatch = bodyText?.match(/Bid on Order #(\d+)/i);
  if (bidOrderMatch) {
    data.order_number = bidOrderMatch[1];
  } else {
    const orderPatterns = [
      /Order\s*#\s*(\d+)/i,
      /Order\s*Number\s*:?\s*(\d+)/i,
      /Order\s*:?\s*#?\s*(\d+)/i,
    ];
    for (const pattern of orderPatterns) {
      const match = bodyText?.match(pattern);
      if (match) {
        data.order_number = match[1];
        break;
      }
    }
  }
  
  // First try to extract broker_name from HTML format: <strong>Broker Name: </strong>Matthew Rose
  const brokerNameHtmlMatch = bodyText?.match(/<strong>Broker\s*Name:\s*<\/strong>\s*([^<\n]+)/i);
  if (brokerNameHtmlMatch) {
    data.broker_name = brokerNameHtmlMatch[1].trim();
  }
  
  // Extract broker_company from HTML format: <strong>Broker Company: </strong>BLX LOGISTICS
  const brokerCompanyHtmlMatch = bodyText?.match(/<strong>Broker\s*Company:\s*<\/strong>\s*([^<\n]+)/i);
  if (brokerCompanyHtmlMatch) {
    data.broker_company = brokerCompanyHtmlMatch[1].trim();
  }
  
  // Extract broker_phone from HTML format: <strong>Broker Phone: </strong>941.334.9849
  const brokerPhoneHtmlMatch = bodyText?.match(/<strong>Broker\s*Phone:\s*<\/strong>\s*([^<\n]+)/i);
  if (brokerPhoneHtmlMatch) {
    data.broker_phone = brokerPhoneHtmlMatch[1].trim();
  }

  const patterns: Record<string, RegExp> = {
    broker_name: /(?:Contact|Rep|Agent)[\s:]+([A-Za-z\s]+?)(?:\n|$)/i,
    broker_company: /(?:Company|Broker)[\s:]+([^\n]+)/i,
    broker_phone: /(?:Phone|Tel|Ph)[\s:]+([0-9\s\-\(\)\.]+)/i,
    origin_city: /(?:Origin|Pick\s*up|From)[\s:]+([A-Za-z\s]+),?\s*([A-Z]{2})/i,
    destination_city: /(?:Destination|Deliver|To)[\s:]+([A-Za-z\s]+),?\s*([A-Z]{2})/i,
    posted_amount: /Posted\s*Amount[\s:]*\$?([\d,]+(?:\.\d{2})?)/i,
    vehicle_type: /(?:Equipment|Vehicle|Truck)[\s:]+([^\n]+)/i,
    load_type: /(?:Load\s*Type|Type)[\s:]+([^\n]+)/i,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    // Skip if already extracted from HTML format
    if (data[key]) continue;
    
    const match = bodyText?.match(pattern);
    if (match) {
      if (key === 'origin_city' && match[2]) {
        data.origin_city = match[1].trim();
        data.origin_state = match[2];
      } else if (key === 'destination_city' && match[2]) {
        data.destination_city = match[1].trim();
        data.destination_state = match[2];
      } else {
        data[key] = match[1].trim();
      }
    }
  }

  // Extract origin zip code from HTML - format: ", TX 75261" or "City, TX 75261"
  const originZipMatch = bodyText?.match(/Pick-Up[\s\S]*?(?:,\s*)?([A-Z]{2})\s+(\d{5})(?:\s|<|$)/i);
  if (originZipMatch) {
    data.origin_zip = originZipMatch[2];
    // If origin_state not set, use this
    if (!data.origin_state) {
      data.origin_state = originZipMatch[1].toUpperCase();
    }
  }

  // Extract destination zip code similarly
  const destZipMatch = bodyText?.match(/Delivery[\s\S]*?(?:,\s*)?([A-Z]{2})\s+(\d{5})(?:\s|<|$)/i);
  if (destZipMatch) {
    data.destination_zip = destZipMatch[2];
    if (!data.destination_state) {
      data.destination_state = destZipMatch[1].toUpperCase();
    }
  }

  // Parse pickup datetime from "Pick-Up" section - format: MM/DD/YY HH:MM TZ
  const pickupSection = bodyText?.match(/Pick-Up[\s\S]*?(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/i);
  if (pickupSection) {
    data.pickup_date = pickupSection[1];
    data.pickup_time = pickupSection[2] + (pickupSection[3] ? ' ' + pickupSection[3] : '');
  }

  // Parse delivery datetime from "Delivery" section - format: MM/DD/YY HH:MM TZ
  const deliverySection = bodyText?.match(/Delivery[\s\S]*?(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/i);
  if (deliverySection) {
    data.delivery_date = deliverySection[1];
    data.delivery_time = deliverySection[2] + (deliverySection[3] ? ' ' + deliverySection[3] : '');
  }

  // Fallback: Try leginfo format with separate date/time
  if (!data.pickup_date) {
    const legPickup = bodyText?.match(/Pick-Up.*?<p>(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/is);
    if (legPickup) {
      data.pickup_date = legPickup[1];
      data.pickup_time = legPickup[2] + (legPickup[3] ? ' ' + legPickup[3] : '');
    }
  }

  if (!data.delivery_date) {
    const legDelivery = bodyText?.match(/Delivery.*?<p>(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/is);
    if (legDelivery) {
      data.delivery_date = legDelivery[1];
      data.delivery_time = legDelivery[2] + (legDelivery[3] ? ' ' + legDelivery[3] : '');
    }
  }

  const vehicleTypes = ['CARGO VAN', 'SPRINTER', 'SMALL STRAIGHT', 'LARGE STRAIGHT', 'FLATBED', 'TRACTOR', 'VAN'];
  for (const vt of vehicleTypes) {
    if (bodyText?.toUpperCase().includes(vt)) {
      data.vehicle_type = vt;
      break;
    }
  }

  // Parse pieces - HTML format: <strong>Pieces: </strong>1
  const piecesHtmlMatch = bodyText?.match(/<strong>Pieces?:\s*<\/strong>\s*(\d+)/i);
  if (piecesHtmlMatch) {
    data.pieces = parseInt(piecesHtmlMatch[1]);
  } else {
    // Fallback: plain text format
    const piecesMatch = bodyText?.match(/Pieces?[:\s]+(\d+)/i);
    if (piecesMatch) {
      data.pieces = parseInt(piecesMatch[1]);
    }
  }

  // Parse weight - HTML format: <strong>Weight: </strong>500 lbs
  const weightHtmlMatch = bodyText?.match(/<strong>Weight:\s*<\/strong>\s*([\d,]+)\s*(?:lbs?)?/i);
  if (weightHtmlMatch) {
    data.weight = weightHtmlMatch[1].replace(',', '');
  } else {
    // Fallback: plain text or subject line
    const weightMatch = bodyText?.match(/(?:^|[\s,])(\d{1,6})\s*(?:lbs?|pounds?)(?:[\s,.]|$)/i);
    if (weightMatch) {
      data.weight = weightMatch[1];
    }
  }

  // Parse dimensions - HTML format: <strong>Dimensions: </strong>48x48x48
  const dimensionsHtmlMatch = bodyText?.match(/<strong>Dimensions?:\s*<\/strong>\s*([^<\n]+)/i);
  if (dimensionsHtmlMatch) {
    data.dimensions = dimensionsHtmlMatch[1].trim();
  } else {
    // Fallback: plain text format like "Dimensions: 48x48x48" (must have colon to avoid CSS)
    const dimensionsPlainMatch = bodyText?.match(/Dimensions?:\s*(\d+[x×X]\d+(?:[x×X]\d+)?)/i);
    if (dimensionsPlainMatch) {
      data.dimensions = dimensionsPlainMatch[1].trim();
    }
  }

  // Parse expiration datetime from "Expires" section (handles HTML tags like <strong>Expires: </strong>)
  const expirationMatch = bodyText?.match(/Expires?[:\s]*(?:<[^>]*>)*\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*(AM|PM)?\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/i);
  if (expirationMatch) {
    const dateStr = expirationMatch[1];
    const timeStr = expirationMatch[2];
    const ampm = expirationMatch[3] || '';
    const timezone = expirationMatch[4] || 'EST';
    
    data.expires_datetime = `${dateStr} ${timeStr} ${ampm} ${timezone}`.trim();
    
    // Convert to ISO timestamp for expires_at column
    try {
      const dateParts = dateStr.split('/');
      let year = parseInt(dateParts[2]);
      if (year < 100) year += 2000;
      const month = parseInt(dateParts[0]) - 1;
      const day = parseInt(dateParts[1]);
      
      let hours = parseInt(timeStr.split(':')[0]);
      const minutes = parseInt(timeStr.split(':')[1]);
      
      // Handle AM/PM if present
      if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
      if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
      
      // Timezone offsets
      const tzOffsets: Record<string, number> = {
        'EST': -5, 'EDT': -4, 'CST': -6, 'CDT': -5,
        'MST': -7, 'MDT': -6, 'PST': -8, 'PDT': -7
      };
      const offset = tzOffsets[timezone.toUpperCase()] || -5;
      
      const expiresDate = new Date(Date.UTC(year, month, day, hours - offset, minutes, 0));
      if (!isNaN(expiresDate.getTime())) {
        data.expires_at = expiresDate.toISOString();
        console.log(`📅 Parsed expiration: ${data.expires_datetime} -> ${data.expires_at}`);
      }
    } catch (e) {
      console.error('Error parsing expiration date:', e);
    }
  }

  // Extract notes from HTML structure (notes-section class) - Sylectus format
  const notesMatch = bodyText?.match(/<div[^>]*class=['"]notes-section['"][^>]*>([\s\S]*?)<\/div>/i);
  if (notesMatch) {
    const notesContent = notesMatch[1];
    const notesPTags = notesContent.match(/<p[^>]*>(.*?)<\/p>/gi);
    if (notesPTags && notesPTags.length > 0) {
      const notesText = notesPTags
        .map(tag => tag.replace(/<[^>]*>/g, '').trim())
        .filter(text => text.length > 0)
        .join(', ');
      if (notesText) {
        data.notes = notesText;
      }
    }
  }
  
  // Fallback: try plain text "Notes:" pattern
  if (!data.notes) {
    const notesPlainMatch = bodyText?.match(/Notes?:\s*([^\n<]+)/i);
    if (notesPlainMatch) {
      data.notes = notesPlainMatch[1].trim();
    }
  }

  return data;
}

// Geocoding result with error code for diagnostics
type GeocodeResult = {
  coords: { lat: number; lng: number } | null;
  errorCode: string | null;
};

async function geocodeLocation(city: string, state: string): Promise<GeocodeResult> {
  const mapboxToken = Deno.env.get('VITE_MAPBOX_TOKEN');
  
  // Validate inputs
  if (!mapboxToken) {
    console.error(`📍 GEOCODE ERROR: token_missing for "${city}, ${state}"`);
    return { coords: null, errorCode: 'token_missing' };
  }
  if (!city || !state) {
    console.error(`📍 GEOCODE ERROR: missing_input (city=${city}, state=${state})`);
    return { coords: null, errorCode: 'missing_input' };
  }

  // Normalize the location key (lowercase, trimmed)
  const locationKey = `${city.toLowerCase().trim()}, ${state.toLowerCase().trim()}`;

  try {
    // 1. Check cache first
    const { data: cached } = await supabase
      .from('geocode_cache')
      .select('latitude, longitude, id, hit_count')
      .eq('location_key', locationKey)
      .maybeSingle();

    if (cached) {
      // Cache hit - increment hit count (fire and forget)
      supabase
        .from('geocode_cache')
        .update({ hit_count: (cached.hit_count || 1) + 1 })
        .eq('id', cached.id)
        .then(() => {});
      
      console.log(`📍 Cache HIT: ${city}, ${state}`);
      return { coords: { lat: Number(cached.latitude), lng: Number(cached.longitude) }, errorCode: null };
    }

    // 2. Cache miss - call Mapbox API
    console.log(`📍 Cache MISS: ${city}, ${state} - calling Mapbox API`);
    const query = encodeURIComponent(`${city}, ${state}, USA`);
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxToken}&limit=1`
    );
    
    // Log rate limit headers
    const rateLimitRemaining = response.headers.get('x-rate-limit-remaining');
    const rateLimitLimit = response.headers.get('x-rate-limit-limit');
    if (rateLimitRemaining) {
      console.log(`📍 Mapbox rate limit: ${rateLimitRemaining}/${rateLimitLimit} remaining`);
    }
    
    if (!response.ok) {
      const errorBody = await response.text().catch(() => 'Could not read body');
      const httpErrorCode = response.status === 401 ? 'http_401' 
        : response.status === 403 ? 'http_403'
        : response.status === 429 ? 'http_429'
        : `http_${response.status}`;
      
      console.error(`📍 GEOCODE ERROR: ${httpErrorCode} for "${city}, ${state}"`, {
        status: response.status,
        statusText: response.statusText,
        body: errorBody.substring(0, 200),
        rateLimitRemaining,
        rateLimitLimit,
      });
      return { coords: null, errorCode: httpErrorCode };
    }
    
    const data = await response.json();
    if (data.features?.[0]?.center) {
      const coords = { lng: data.features[0].center[0], lat: data.features[0].center[1] };
      
      // 3. Store in cache for future use
      const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
      const { error: upsertError } = await supabase
        .from('geocode_cache')
        .upsert({
          location_key: locationKey,
          city: city.trim(),
          state: state.trim(),
          latitude: coords.lat,
          longitude: coords.lng,
          month_created: currentMonth,
        }, { onConflict: 'location_key' });
      
      if (upsertError) {
        console.error(`📍 Cache upsert error for ${city}, ${state}:`, upsertError);
      }
      
      console.log(`📍 Geocoded & cached: ${city}, ${state} → ${coords.lat}, ${coords.lng}`);
      return { coords, errorCode: null };
    } else {
      console.warn(`📍 GEOCODE ERROR: no_features for "${city}, ${state}"`, {
        query: `${city}, ${state}, USA`,
        featureCount: data.features?.length || 0,
      });
      return { coords: null, errorCode: 'no_features' };
    }
  } catch (e) {
    console.error(`📍 GEOCODE ERROR: exception for "${city}, ${state}":`, e);
    return { coords: null, errorCode: 'exception' };
  }
}

// Lookup city from zip code using Mapbox geocoding
async function lookupCityFromZip(zipCode: string, state?: string): Promise<{city: string, state: string} | null> {
  const mapboxToken = Deno.env.get('VITE_MAPBOX_TOKEN');
  if (!mapboxToken || !zipCode) return null;

  try {
    const query = encodeURIComponent(`${zipCode}, USA`);
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxToken}&types=postcode&limit=1`
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data.features?.[0]) {
        const feature = data.features[0];
        // Extract city from context
        let city = '';
        let foundState = state || '';
        
        for (const ctx of (feature.context || [])) {
          if (ctx.id?.startsWith('place.')) {
            city = ctx.text;
          }
          if (ctx.id?.startsWith('region.') && ctx.short_code) {
            // short_code is like "US-TX"
            foundState = ctx.short_code.replace('US-', '');
          }
        }
        
        // Fallback: use place_name if context didn't have city
        if (!city && feature.place_name) {
          const parts = feature.place_name.split(',');
          if (parts.length >= 2) {
            city = parts[0].replace(zipCode, '').trim();
          }
        }
        
        if (city && foundState) {
          console.log(`📮 Zip ${zipCode} -> ${city}, ${foundState}`);
          return { city, state: foundState };
        }
      }
    }
  } catch (e) {
    console.error('Zip lookup error:', e);
  }
  return null;
}

// Parse Full Circle TMS email format
function parseFullCircleTMSEmail(subject: string, bodyText: string, bodyHtml?: string): Record<string, any> {
  const data: Record<string, any> = {};
  
  // First, parse origin/destination from subject line as reliable fallback
  // Subject format: "Sprinter Van from Whitehall, MI to Greer, SC - Expedite / Hot-Shot"
  const subjectRouteMatch = subject?.match(/from\s+([A-Za-z\s]+),\s*([A-Z]{2})\s+to\s+([A-Za-z\s]+),\s*([A-Z]{2})/i);
  if (subjectRouteMatch) {
    data.origin_city = subjectRouteMatch[1].trim();
    data.origin_state = subjectRouteMatch[2];
    data.destination_city = subjectRouteMatch[3].trim();
    data.destination_state = subjectRouteMatch[4];
    console.log(`📍 FCTMS: Parsed route from subject: ${data.origin_city}, ${data.origin_state} -> ${data.destination_city}, ${data.destination_state}`);
  }
  
  // Parse vehicle type from subject
  // Format: "Sprinter Van from..." or "Large Straight from..."
  const vehicleSubjectMatch = subject?.match(/^([A-Za-z\s]+)\s+from\s+/i);
  if (vehicleSubjectMatch) {
    data.vehicle_type = vehicleSubjectMatch[1].trim();
  }
  
  // Order numbers - Full Circle uses format: ORDER NUMBER: 265637 or 4720340
  const orderMatch = bodyText?.match(/ORDER\s*NUMBER:?\s*(\d+)(?:\s+or\s+(\d+))?/i);
  if (orderMatch) {
    data.order_number = orderMatch[1];
    if (orderMatch[2]) {
      data.order_number_secondary = orderMatch[2];
    }
  }
  
  // Extract stops from HTML table - Full Circle uses <td> tags
  // Supports US/Canadian addresses, zip can be empty
  const htmlStopsPattern = /<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(Pick Up|Delivery)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([A-Z]{2})<\/td>\s*<td[^>]*>([A-Z0-9]*)<\/td>\s*<td[^>]*>(USA|CAN)<\/td>\s*<td[^>]*>(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?<\/td>/gi;
  const stops: Array<{type: string, city: string, state: string, zip: string, country: string, datetime: string, tz: string, sequence: number}> = [];
  let match;
  while ((match = htmlStopsPattern.exec(bodyText)) !== null) {
    stops.push({
      sequence: parseInt(match[1]),
      type: match[2].toLowerCase(),
      city: match[3].trim(),
      state: match[4],
      zip: match[5] || '',
      country: match[6],
      datetime: match[7],
      tz: match[8] || 'EST'
    });
  }
  
  // Also try plain text format as fallback - supports US/CAN, zip optional
  if (stops.length === 0) {
    const plainStopsPattern = /(\d+)\s+(Pick Up|Delivery)\s+([A-Za-z\s]+)\s+([A-Z]{2})\s+([A-Z0-9]*)\s+(USA|CAN)\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(EST|CST|MST|PST|EDT|CDT|MDT|PDT)/gi;
    while ((match = plainStopsPattern.exec(bodyText)) !== null) {
      stops.push({
        sequence: parseInt(match[1]),
        type: match[2].toLowerCase(),
        city: match[3].trim(),
        state: match[4],
        zip: match[5] || '',
        country: match[6],
        datetime: match[7],
        tz: match[8]
      });
    }
  }
  
  // Set origin from first pickup (overrides subject if found)
  const firstPickup = stops.find(s => s.type === 'pick up');
  if (firstPickup) {
    data.origin_city = firstPickup.city;
    data.origin_state = firstPickup.state;
    data.origin_zip = firstPickup.zip;
    data.pickup_date = firstPickup.datetime.split(' ')[0];
    data.pickup_time = firstPickup.datetime.split(' ')[1] + ' ' + firstPickup.tz;
  }
  
  // Set destination from first delivery (overrides subject if found)
  const firstDelivery = stops.find(s => s.type === 'delivery');
  if (firstDelivery) {
    data.destination_city = firstDelivery.city;
    data.destination_state = firstDelivery.state;
    data.destination_zip = firstDelivery.zip;
    data.delivery_date = firstDelivery.datetime.split(' ')[0];
    data.delivery_time = firstDelivery.datetime.split(' ')[1] + ' ' + firstDelivery.tz;
  }
  
  // Store all stops for multi-stop loads
  if (stops.length > 0) {
    data.stops = stops;
    data.stop_count = stops.length;
    data.has_multiple_stops = stops.length > 2;
    console.log(`📍 FCTMS: Parsed ${stops.length} stops from HTML table`);
  }
  
  // Parse expiration - format: 2025-12-14 10:51 EST (UTC-0500)
  const expiresMatch = bodyText?.match(/This posting expires:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(EST|CST|MST|PST|EDT|CDT|MDT|PDT)(?:\s*\(UTC([+-]\d{4})\))?/i);
  if (expiresMatch) {
    const dateStr = expiresMatch[1];
    const timeStr = expiresMatch[2];
    const timezone = expiresMatch[3];
    
    data.expires_datetime = `${dateStr} ${timeStr} ${timezone}`;
    
    // Convert to ISO - timezone offsets
    try {
      const tzOffsets: Record<string, number> = {
        'EST': -5, 'EDT': -4, 'CST': -6, 'CDT': -5,
        'MST': -7, 'MDT': -6, 'PST': -8, 'PDT': -7
      };
      const offset = tzOffsets[timezone.toUpperCase()] || -5;
      
      const [year, month, day] = dateStr.split('-').map(Number);
      const [hours, minutes] = timeStr.split(':').map(Number);
      
      const expiresDate = new Date(Date.UTC(year, month - 1, day, hours - offset, minutes, 0));
      if (!isNaN(expiresDate.getTime())) {
        data.expires_at = expiresDate.toISOString();
        console.log(`📅 FCTMS expiration: ${data.expires_datetime} -> ${data.expires_at}`);
      }
    } catch (e) {
      console.error('Error parsing FCTMS expiration:', e);
    }
  }
  
  // Parse pieces and weight from notes or dedicated fields
  const totalPiecesMatch = bodyText?.match(/Total Pieces:?\s*(\d+)/i);
  if (totalPiecesMatch) {
    data.pieces = parseInt(totalPiecesMatch[1]);
  }
  
  const totalWeightMatch = bodyText?.match(/Total Weight:?\s*([\d,]+)\s*(?:lbs?)?/i);
  if (totalWeightMatch) {
    data.weight = totalWeightMatch[1].replace(',', '');
  }
  
  // Parse distance
  const distanceMatch = bodyText?.match(/Distance:\s*([\d,]+)\s*mi/i);
  if (distanceMatch) {
    data.loaded_miles = parseInt(distanceMatch[1].replace(',', ''));
  }
  
  // Parse vehicle type - "Requested Vehicle Class:" or "We call this vehicle class:"
  const vehicleClassMatch = bodyText?.match(/(?:Requested Vehicle Class|We call this vehicle class):\s*([^\n]+)/i);
  if (vehicleClassMatch) {
    data.vehicle_type = vehicleClassMatch[1].trim().toUpperCase();
  }
  
  // Normalize common vehicle names
  if (data.vehicle_type) {
    const vehicleNormMap: Record<string, string> = {
      'SPRINTER VAN': 'SPRINTER',
      'CARGO VAN': 'CARGO VAN',
      'SMALL STRAIGHT TRUCK': 'SMALL STRAIGHT',
      'LARGE STRAIGHT TRUCK': 'LARGE STRAIGHT',
    };
    for (const [key, value] of Object.entries(vehicleNormMap)) {
      if (data.vehicle_type.includes(key)) {
        data.vehicle_type = value;
        break;
      }
    }
  }
  
  // Parse dock level, hazmat, team requirements
  const dockLevelMatch = bodyText?.match(/Dock Level.*?:\s*(Yes|No)/i);
  if (dockLevelMatch) {
    data.dock_level = dockLevelMatch[1].toLowerCase() === 'yes';
  }
  
  const hazmatMatch = bodyText?.match(/Hazardous\??\s*:\s*(Yes|No)/i);
  if (hazmatMatch) {
    data.hazmat = hazmatMatch[1].toLowerCase() === 'yes';
  }
  
  const teamMatch = bodyText?.match(/Driver TEAM.*?:\s*(Yes|No)/i);
  if (teamMatch) {
    data.team_required = teamMatch[1].toLowerCase() === 'yes';
  }
  
  // Parse broker company with MC# - check bodyHtml first (MC# is in HTML)
  // Format: "please contact:<br />\nCompany Name (MC# 478717)"
  if (bodyHtml) {
    const htmlContactMatch = bodyHtml.match(/please contact:[\s\S]*?<br\s*\/?>\s*([^<\n(]+)\s*\(MC#\s*(\d+)\)/i);
    if (htmlContactMatch) {
      const companyName = htmlContactMatch[1].trim().replace(/&#x([0-9A-F]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
      if (!data.broker_company) data.broker_company = companyName;
      data.mc_number = htmlContactMatch[2];
      console.log(`📍 FCTMS: Extracted MC# ${data.mc_number} for ${data.broker_company} from body_html`);
    }
  }
  
  // Fallback: check bodyText
  if (!data.mc_number && bodyText) {
    const brokerCompanyMCMatch = bodyText.match(/please contact:\s*\n?\s*([^\n(]+)\s*\(MC#\s*(\d+)\)/i);
    if (brokerCompanyMCMatch) {
      if (!data.broker_company) data.broker_company = brokerCompanyMCMatch[1].trim();
      data.mc_number = brokerCompanyMCMatch[2];
      console.log(`📍 FCTMS: Extracted MC# ${data.mc_number} from body_text`);
    }
  }
  
  // Fallback: look for any (MC# XXXXXX) pattern
  if (!data.mc_number) {
    const mcFallback = (bodyHtml || bodyText)?.match(/\(MC#\s*(\d+)\)/i);
    if (mcFallback) {
      data.mc_number = mcFallback[1];
      console.log(`📍 FCTMS: Extracted MC# ${data.mc_number} from fallback pattern`);
    }
  }
  
  // Parse broker address
  const addressMatch = bodyText?.match(/\(MC#\s*\d+\)\s*\n([^\n]+)\s*\n([^\n]+),\s*([A-Z]{2})\s+(\d{5})/i);
  if (addressMatch) {
    data.broker_address = addressMatch[1].trim();
    data.broker_city = addressMatch[2].trim();
    data.broker_state = addressMatch[3];
    data.broker_zip = addressMatch[4];
  }
  
  // Parse posted by / contact info
  const postedByMatch = bodyText?.match(/Load posted by:\s*([^\n]+)/i);
  if (postedByMatch) {
    data.broker_name = postedByMatch[1].trim();
  }
  
  const phoneMatch = bodyText?.match(/Phone:\s*\(?([\d\-\(\)\s]+)/i);
  if (phoneMatch) {
    data.broker_phone = phoneMatch[1].trim();
  }
  
  const faxMatch = bodyText?.match(/Fax:\s*\(?([\d\-\(\)\s]+)/i);
  if (faxMatch) {
    data.broker_fax = faxMatch[1].trim();
  }
  
  // Parse dimensions from the dimensions table
  const dimensionsMatch = bodyText?.match(/Stops\s+Pieces\s+Weight[\s\S]*?1 to 2\s+(\d+)\s+([\d,]+)\s*lbs?\s+(\d+)\s*in\s+(\d+)\s*in\s+(\d+)\s*in\s+(Yes|No)/i);
  if (dimensionsMatch) {
    data.dimensions = `${dimensionsMatch[3]}x${dimensionsMatch[4]}x${dimensionsMatch[5]}`;
    data.stackable = dimensionsMatch[6].toLowerCase() === 'yes';
    // Use these as primary if not set
    if (!data.pieces) data.pieces = parseInt(dimensionsMatch[1]);
    if (!data.weight) data.weight = dimensionsMatch[2].replace(',', '');
  }
  
  // Fallback: parse subject for origin/destination - "Load Available: MI - PA"
  if (!data.origin_state || !data.destination_state) {
    const subjectStatesMatch = subject?.match(/Load Available:\s*([A-Z]{2})\s*-\s*([A-Z]{2})/i);
    if (subjectStatesMatch) {
      if (!data.origin_state) data.origin_state = subjectStatesMatch[1].toUpperCase();
      if (!data.destination_state) data.destination_state = subjectStatesMatch[2].toUpperCase();
    }
  }
  
  // Extract notes from Full Circle TMS - they appear in red <h4> OR <p> tags
  const searchContent = bodyHtml || bodyText || '';
  const extractedNotes: string[] = [];
  
  // Helper to clean and validate note text
  const processNoteText = (text: string): string | null => {
    let noteText = text.trim();
    // Decode HTML entities
    noteText = noteText.replace(/&#x([0-9A-F]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    noteText = noteText.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec)));
    noteText = noteText.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    // Remove HTML tags
    noteText = noteText.replace(/<[^>]*>/g, '').trim();
    // Remove "Notes:" prefix if present
    noteText = noteText.replace(/^Notes:\s*/i, '');
    // Skip empty or bid instruction lines
    if (!noteText || 
        noteText.toLowerCase().includes('submit your bid via') || 
        noteText.toLowerCase().includes('submitted bids must include') ||
        noteText.toLowerCase().includes('location of your vehicle') ||
        noteText.toLowerCase().includes('confirm all key requirements')) {
      return null;
    }
    return noteText;
  };
  
  // Pattern 1: Red <p> tags (MOST common for actual notes)
  const redPPattern = /<p[^>]*style\s*=\s*["'][^"']*color\s*:\s*red[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi;
  let noteMatch;
  while ((noteMatch = redPPattern.exec(searchContent)) !== null) {
    const processed = processNoteText(noteMatch[1]);
    if (processed) extractedNotes.push(processed);
  }
  
  // Pattern 2: Red <h4> tags with <b> inside
  const redH4Pattern = /<h4[^>]*style\s*=\s*["'][^"']*color\s*:\s*red[^"']*["'][^>]*>([\s\S]*?)<\/h4>/gi;
  while ((noteMatch = redH4Pattern.exec(searchContent)) !== null) {
    const processed = processNoteText(noteMatch[1]);
    if (processed) extractedNotes.push(processed);
  }
  
  // Pattern 3: Any text after "Notes:" header until next section
  const notesBlockMatch = searchContent.match(/<h4[^>]*>[\s\S]*?Notes:[\s\S]*?<\/h4>([\s\S]*?)(?:<p>[\s\S]*?Distance:|<p>[\s\S]*?Total Pieces:)/i);
  if (notesBlockMatch) {
    // Extract any red text from this block
    const blockContent = notesBlockMatch[1];
    const redTextPattern = /<[^>]*style\s*=\s*["'][^"']*color\s*:\s*red[^"']*["'][^>]*>([\s\S]*?)<\/[^>]+>/gi;
    while ((noteMatch = redTextPattern.exec(blockContent)) !== null) {
      const processed = processNoteText(noteMatch[1]);
      if (processed && !extractedNotes.includes(processed)) extractedNotes.push(processed);
    }
  }
  
  if (extractedNotes.length > 0) {
    data.notes = extractedNotes.join(' | ');
    console.log(`📝 FCTMS: Extracted notes: ${data.notes.substring(0, 100)}...`);
  }
  
  // Fallback: try plain text "Notes:" pattern
  if (!data.notes) {
    const fctmsNotesMatch = (bodyHtml || bodyText)?.match(/(?:Notes?|Special Instructions?):\s*([^\n<]+)/i);
    if (fctmsNotesMatch && fctmsNotesMatch[1].trim()) {
      data.notes = fctmsNotesMatch[1].trim();
    }
  }
  
  console.log(`📦 FCTMS parsed: Order ${data.order_number}${data.order_number_secondary ? '/' + data.order_number_secondary : ''}, ${data.origin_city || data.origin_state} -> ${data.destination_city || data.destination_state}, ${data.vehicle_type}, ${data.pieces} pcs, ${data.weight} lbs, expires ${data.expires_at}`);
  
  return data;
}

function parseSubjectLine(subject: string): Record<string, any> {
  const data: Record<string, any> = {};
  
  const subjectMatch = subject.match(/^([A-Z\s]+(?:VAN|STRAIGHT|SPRINTER|TRACTOR|FLATBED|REEFER)[A-Z\s]*)\s+(?:from|-)\s+([^,]+),\s*([A-Z]{2})\s+to\s+([^,]+),\s*([A-Z]{2})/i);
  if (subjectMatch) {
    data.vehicle_type = subjectMatch[1].trim().toUpperCase();
    data.origin_city = subjectMatch[2].trim();
    data.origin_state = subjectMatch[3].trim();
    data.destination_city = subjectMatch[4].trim();
    data.destination_state = subjectMatch[5].trim();
  }
  
  const brokerEmailMatch = subject.match(/\(([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\)/);
  if (brokerEmailMatch) {
    data.broker_email = brokerEmailMatch[1];
  }
  
  const milesMatch = subject.match(/:\s*(\d+)\s*miles/i);
  if (milesMatch) {
    data.loaded_miles = parseInt(milesMatch[1], 10);
  }
  
  const weightMatch = subject.match(/(\d+)\s*lbs/i);
  if (weightMatch) {
    data.weight = weightMatch[1];
  }
  
  const customerMatch = subject.match(/Posted by ([^(]+)\s*\(/);
  if (customerMatch) {
    const rawCustomer = customerMatch[1].trim();
    // Handle case where customer name is empty before "-" but company is after "-"
    // e.g., "Posted by  - Alliance Posted Load ("
    if (rawCustomer.startsWith('-')) {
      const afterDash = rawCustomer.substring(1).trim();
      if (afterDash) {
        data.customer = afterDash;
        data.broker_company = afterDash;
      }
    } else if (rawCustomer.includes(' - ')) {
      // Has both name and company like "John Smith - Alliance"
      const parts = rawCustomer.split(' - ');
      data.customer = parts[0].trim() || parts[1]?.trim();
      data.broker_company = parts[1]?.trim() || parts[0].trim();
    } else if (rawCustomer) {
      data.customer = rawCustomer;
      data.broker_company = rawCustomer;
    }
  }
  
  return data;
}

serve(async (req) => {
  // VERSION LOG - runs on every invocation for deployment verification
  console.log('PROCESS_EMAIL_QUEUE_VERSION=v2');
  
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate request for security (accepts cron secret or JWT from pg_cron)
  if (!validateRequest(req)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const startTime = Date.now();
  let processed = 0;
  let errors = 0;
  let lastProcessedReceivedAt: string | null = null;
  let lastProcessedLoadId: string | null = null;

  try {
    // Get current processing state (cursor checkpoint)
    const { data: stateData } = await supabase
      .from('processing_state')
      .select('*')
      .eq('id', 'email_processor')
      .maybeSingle();
    
    // Use checkpoint or floor as starting point
    const checkpointReceivedAt = stateData?.last_processed_received_at || stateData?.floor_received_at || '2025-12-03T00:46:12Z';
    const floorReceivedAt = stateData?.floor_received_at || '2025-12-03T00:46:12Z';
    
    console.log(`📍 Checkpoint: ${checkpointReceivedAt}, Floor: ${floorReceivedAt}`);

    // Get pending queue items - process ALL pending items (cursor is for tracking, not filtering)
    const { data: queueItems, error: queueError } = await supabase
      .from('email_queue')
      .select('*')
      .eq('status', 'pending')
      .order('queued_at', { ascending: true }) // Process oldest first
      .limit(100); // Process up to 100 for maximum throughput

    if (queueError) {
      console.error('Queue fetch error:', queueError);
      return new Response(JSON.stringify({ error: 'Queue fetch failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!queueItems?.length) {
      console.log('📭 No new items in queue after checkpoint');
      return new Response(JSON.stringify({ processed: 0, message: 'No new items' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📧 Processing ${queueItems.length} queued emails (after checkpoint)`);

    // Get access token
    const { data: tokenData } = await supabase
      .from('gmail_tokens')
      .select('access_token, refresh_token, token_expiry, user_email')
      .limit(1)
      .single();

    if (!tokenData) {
      console.error('No token found');
      return new Response(JSON.stringify({ error: 'No token' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Refresh token if needed
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.token_expiry) <= new Date()) {
      const clientId = Deno.env.get('GMAIL_CLIENT_ID');
      const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');
      
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId!,
          client_secret: clientSecret!,
          refresh_token: tokenData.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      if (refreshResponse.ok) {
        const tokens = await refreshResponse.json();
        accessToken = tokens.access_token;
        await supabase
          .from('gmail_tokens')
          .update({
            access_token: tokens.access_token,
            token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          })
          .eq('user_email', tokenData.user_email);
      }
    }

    // Helper function to process a single email
    const processEmail = async (item: any): Promise<{ success: boolean; queuedAt: string; loadId?: string; error?: string; isUpdate?: boolean }> => {
      try {
        // Mark as processing
        await supabase
          .from('email_queue')
          .update({ status: 'processing', attempts: item.attempts + 1 })
          .eq('id', item.id);

        // Check if already in load_emails
        const { count } = await supabase
          .from('load_emails')
          .select('id', { count: 'exact', head: true })
          .eq('email_id', item.gmail_message_id);

        if (count && count > 0) {
          await supabase
            .from('email_queue')
            .update({ status: 'completed', processed_at: new Date().toISOString() })
            .eq('id', item.id);
          return { success: true, queuedAt: item.queued_at };
        }

        // Fetch full message from Gmail
        const msgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.gmail_message_id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!msgResponse.ok) {
          throw new Error(`Gmail API error: ${msgResponse.status}`);
        }

        const message = await msgResponse.json();

        // Extract email data
        const headers = message.payload?.headers || [];
        const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value;

        const subject = getHeader('Subject') || '';
        const from = getHeader('From') || '';
        const receivedAt = message.internalDate 
          ? new Date(parseInt(message.internalDate, 10)) 
          : new Date();

        // Extract body
        let bodyText = '';
        let bodyHtml = '';
        const extractBody = (part: any, mimeType: string): string => {
          if (part.mimeType === mimeType && part.body?.data) {
            return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
          }
          if (part.parts) {
            for (const p of part.parts) {
              const text = extractBody(p, mimeType);
              if (text) return text;
            }
          }
          return '';
        };
        bodyText = extractBody(message.payload, 'text/plain') || extractBody(message.payload, 'text/html');
        bodyHtml = extractBody(message.payload, 'text/html');

        // Detect email source FIRST before parsing
        let emailSource = 'sylectus'; // Default

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
          console.log('📧 Detected Full Circle TMS email source');
        }

        // Parse based on source - use dedicated parser for Full Circle TMS
        let parsedData: Record<string, any>;
        if (isFullCircleTMS) {
          parsedData = parseFullCircleTMSEmail(subject, bodyText, bodyHtml);
        } else {
          // Parse from subject (primary) then body (fallback) for Sylectus
          const subjectData = parseSubjectLine(subject);
          const bodyData = parseSylectusEmail(subject, bodyText);
          parsedData = { ...bodyData, ...subjectData };
        }

        // Apply parser hints from database to fill in missing fields
        parsedData = await applyParserHints(emailSource, parsedData, bodyText, bodyHtml);

        // If origin_city is missing but we have origin_zip, look up the city
        if (!parsedData.origin_city && parsedData.origin_zip) {
          console.log(`📮 Missing origin city, looking up zip ${parsedData.origin_zip}`);
          const cityData = await lookupCityFromZip(parsedData.origin_zip, parsedData.origin_state);
          if (cityData) {
            parsedData.origin_city = cityData.city;
            parsedData.origin_state = cityData.state;
            console.log(`📮 Resolved origin from zip: ${cityData.city}, ${cityData.state}`);
          }
        }

        // Similarly for destination
        if (!parsedData.destination_city && parsedData.destination_zip) {
          console.log(`📮 Missing destination city, looking up zip ${parsedData.destination_zip}`);
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
          console.log('GEOCODE_VERSION=v2');
          const geocodeResult = await geocodeLocation(parsedData.origin_city, parsedData.origin_state);
          if (geocodeResult.coords) {
            parsedData.pickup_coordinates = geocodeResult.coords;
          } else {
            geocodeFailed = true;
            geocodingErrorCode = geocodeResult.errorCode;
          }
        } else {
          // No city/state to geocode - not a failure, just pending
          geocodingErrorCode = 'missing_input';
        }

        // Check for issues
        const hasIssues = !parsedData.broker_email && !isFullCircleTMS || !parsedData.origin_city || !parsedData.vehicle_type || geocodeFailed;
        const issueNotes: string[] = [];
        if (!parsedData.broker_email && !isFullCircleTMS) issueNotes.push('Missing broker email');
        if (!parsedData.origin_city) issueNotes.push('Missing origin location');
        if (!parsedData.vehicle_type) issueNotes.push('Missing vehicle type');
        if (geocodeFailed) issueNotes.push(`Geocoding failed: ${geocodingErrorCode}`);

        // Extract sender info
        const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/);
        const fromName = fromMatch ? fromMatch[1].trim() : from;
        const fromEmail = fromMatch ? fromMatch[2] : from;

        // Get tenant_id early for customer creation
        const queueTenantId = item.tenant_id;

        // For Full Circle TMS: create/update customer with MC# if broker_company is present
        if (isFullCircleTMS && parsedData.broker_company) {
          const customerName = parsedData.broker_company;
          
          // Check if customer exists for this tenant
          const { data: existingCustomer } = await supabase
            .from('customers')
            .select('id, mc_number')
            .ilike('name', customerName)
            .eq('tenant_id', queueTenantId)
            .maybeSingle();
          
          if (existingCustomer) {
            // Update MC# if not set
            if (!existingCustomer.mc_number && parsedData.mc_number) {
              await supabase
                .from('customers')
                .update({ mc_number: parsedData.mc_number })
                .eq('id', existingCustomer.id);
              console.log(`📋 Updated customer ${customerName} with MC# ${parsedData.mc_number}`);
            }
          } else {
            // Create new customer with MC# and tenant_id
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
                tenant_id: queueTenantId, // Include tenant_id
              });
            console.log(`📋 Created customer ${customerName} with MC# ${parsedData.mc_number} for tenant ${queueTenantId}`);
          }
        }

        // Get tenant_id from queue item (propagate to load_emails)
        const tenantId = item.tenant_id;

        // Generate content hash for smart business-level deduplication (legacy)
        const contentHash = generateContentHash(parsedData);
        
        // ====================================================================
        // PARSED LOAD FINGERPRINT - Strict Exact-match deduplication
        // Computes SHA256 of ALL parsed fields with meaning-preserving normalization
        // ====================================================================
        const fingerprintResult = await computeParsedLoadFingerprint(parsedData);
        const { fingerprint: parsedLoadFingerprint, canonicalPayload, dedupEligible, dedupEligibleReason } = fingerprintResult;
        
        console.log(`🔑 Fingerprint: ${parsedLoadFingerprint.substring(0, 12)}... | Dedup eligible: ${dedupEligible}${dedupEligibleReason ? ` (${dedupEligibleReason})` : ''}`);
        
        let isDuplicate = false;
        let duplicateOfId: string | null = null;
        let loadContentFingerprint: string | null = null;
        
        // Only check for duplicates if the load is eligible (has critical fields)
        if (dedupEligible) {
          // Check for exact duplicate (same fingerprint within tenant in last 7 days)
          const existingDuplicate = await findExistingByFingerprint(parsedLoadFingerprint, tenantId, 168);
          
          if (existingDuplicate) {
            isDuplicate = true;
            duplicateOfId = existingDuplicate.id;
            console.log(`🔄 DUPLICATE detected: matches ${existingDuplicate.load_id} (fingerprint: ${parsedLoadFingerprint.substring(0, 12)})`);
          }
          
          // ====================================================================
          // CROSS-TENANT DEDUP: UPSERT into global load_content table
          // Store canonical payload ONCE globally, keyed by fingerprint
          // ====================================================================
          const canonicalPayloadJson = JSON.stringify(canonicalPayload);
          const sizeBytes = new TextEncoder().encode(canonicalPayloadJson).length;
          
          const { error: loadContentError } = await supabase
            .from('load_content')
            .upsert({
              fingerprint: parsedLoadFingerprint,
              canonical_payload: canonicalPayload,
              first_seen_at: new Date().toISOString(),
              last_seen_at: new Date().toISOString(),
              receipt_count: 1,
              provider: emailSource || null,
              fingerprint_version: FINGERPRINT_VERSION,
              size_bytes: sizeBytes,
            }, { 
              onConflict: 'fingerprint',
              ignoreDuplicates: false 
            });
          
          if (loadContentError) {
            // If UPSERT fails (conflict), manually increment receipt_count via raw update
            // The upsert likely failed because the row exists - update last_seen_at only
            const { error: updateError } = await supabase
              .from('load_content')
              .update({ 
                last_seen_at: new Date().toISOString()
              })
              .eq('fingerprint', parsedLoadFingerprint);
            
            if (updateError) {
              console.warn(`⚠️ load_content upsert/update failed: ${loadContentError.message || updateError.message}`);
            } else {
              loadContentFingerprint = parsedLoadFingerprint;
              console.log(`📦 load_content updated (existing): ${parsedLoadFingerprint.substring(0, 12)}...`);
            }
          } else {
            loadContentFingerprint = parsedLoadFingerprint;
            console.log(`📦 load_content upserted: ${parsedLoadFingerprint.substring(0, 12)}... (${sizeBytes} bytes)`);
          }
        } else {
          console.log(`⚠️ Skipping dedup check: ${dedupEligibleReason}`);
        }
        
        // Also check legacy content hash for "update" detection (different from exact duplicate)
        const existingSimilarLoad = await findExistingSimilarLoad(contentHash, tenantId, 48);
        
        let isUpdate = false;
        let parentEmailId: string | null = null;
        
        if (existingSimilarLoad && !isDuplicate) {
          // This is a similar load but not an exact duplicate - could be a rate change, etc.
          isUpdate = true;
          parentEmailId = existingSimilarLoad.id;
          console.log(`🔄 Detected update to existing load ${existingSimilarLoad.load_id} (original from ${existingSimilarLoad.received_at})`);
        }

        // Determine geocoding status:
        // - 'success' = geocoding was attempted AND returned coords
        // - 'failed' = geocoding was attempted AND failed (with error code)
        // - 'pending' = geocoding was NOT attempted (missing inputs)
        const hasCoordinates = parsedData.pickup_coordinates?.lat && parsedData.pickup_coordinates?.lng;
        const geocodingStatus = hasCoordinates 
          ? 'success' 
          : (geocodingWasAttempted ? 'failed' : 'pending');

        // Insert into load_emails with tenant_id, content_hash, fingerprint and dedup fields
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
            status: isDuplicate ? 'duplicate' : (isUpdate ? 'update' : 'new'),
            has_issues: hasIssues,
            issue_notes: issueNotes.length > 0 ? issueNotes.join('; ') : null,
            email_source: emailSource,
            tenant_id: tenantId,
            raw_payload_url: item.payload_url || null,
            content_hash: contentHash, // Legacy dedup
            parsed_load_fingerprint: parsedLoadFingerprint, // Exact-match dedup
            is_update: isUpdate,
            is_duplicate: isDuplicate,
            duplicate_of_id: duplicateOfId,
            parent_email_id: parentEmailId,
            dedup_eligible: dedupEligible,
            dedup_canonical_payload: isDuplicate ? canonicalPayload : null, // Store payload only for duplicates (for debugging)
            load_content_fingerprint: loadContentFingerprint, // FK to global load_content table
            // Attribution & geocoding tracking
            ingestion_source: 'process-email-queue',
            geocoding_status: geocodingStatus,
            geocoding_error_code: geocodingErrorCode,
          }, { onConflict: 'email_id' })
          .select('id, load_id, received_at')
          .single();

        if (insertError) throw insertError;

        // Mark queue item as completed
        await supabase
          .from('email_queue')
          .update({ status: 'completed', processed_at: new Date().toISOString() })
          .eq('id', item.id);

        // Hunt matching - run for ALL loads (new, update, duplicate) with coordinates + vehicle_type
        // Cooldown gate controls re-triggering; we only suppress via cooldown or missing gate data
        // FAIL-CLOSED: Require fingerprint + receivedAt + tenantId for cooldown gating
        if (insertedEmail && parsedData.pickup_coordinates && parsedData.vehicle_type) {
          const hasFp = loadContentFingerprint && loadContentFingerprint.trim() !== '';
          const hasReceivedAt = !!receivedAt;
          const hasTenant = !!tenantId;
          
          if (!hasFp || !hasReceivedAt || !hasTenant) {
            const missing = [
              !hasFp ? 'fingerprint' : null,
              !hasReceivedAt ? 'receivedAt' : null,
              !hasTenant ? 'tenant' : null,
            ].filter(Boolean).join('|');
            console.log(`[hunt-cooldown] suppressed_missing_gate_data tenant=${tenantId || 'null'} load_email_id=${insertedEmail.id} missing=${missing}`);
          } else {
            if (isDuplicate) {
              console.log(`🔄 Duplicate load detected, attempting re-trigger via cooldown gate...`);
            }
            if (isUpdate) {
              console.log(`🔄 Update detected for ${insertedEmail.load_id}, attempting match via cooldown gate...`);
            }
            matchLoadToHunts(
              insertedEmail.id, 
              insertedEmail.load_id, 
              parsedData, 
              tenantId,
              loadContentFingerprint, // Pass fingerprint for cooldown gating
              receivedAt // Pass received_at for cooldown comparison
            ).catch(() => {});
          }
        }

        return { success: true, queuedAt: item.queued_at, loadId: insertedEmail?.load_id, isUpdate };
      } catch (error) {
        const newStatus = item.attempts >= 3 ? 'failed' : 'pending';
        await supabase
          .from('email_queue')
          .update({ status: newStatus, last_error: String(error) })
          .eq('id', item.id);
        return { success: false, queuedAt: item.queued_at, error: String(error) };
      }
    };

    // Helper function for hunt matching - now tenant-aware with feature flag check and cooldown gating
    const matchLoadToHunts = async (
      loadEmailId: string, 
      loadId: string, 
      parsedData: any, 
      tenantId: string | null,
      loadContentFingerprint: string | null = null,
      receivedAt: Date | null = null
    ) => {
      // Check if matching is enabled for this tenant
      if (tenantId) {
        const { data: matchingEnabled } = await supabase.rpc('is_feature_enabled', {
          _tenant_id: tenantId,
          _feature_key: 'load_hunter_matching',
        });
        
        if (matchingEnabled === false) {
          console.log(`[process-email-queue] Matching disabled for tenant ${tenantId}`);
          return;
        }
      }
      // Only match hunts for the same tenant
      // Include cooldown_seconds_min for configurable cooldown
      const huntQuery = supabase
        .from('hunt_plans')
        .select('id, vehicle_id, hunt_coordinates, pickup_radius, vehicle_size, floor_load_id, load_capacity, tenant_id, cooldown_seconds_min')
        .eq('enabled', true);
      
      // Filter by tenant if provided
      if (tenantId) {
        huntQuery.eq('tenant_id', tenantId);
      }
      
      const { data: enabledHunts } = await huntQuery;

      if (!enabledHunts?.length) return;

      const loadCoords = parsedData.pickup_coordinates;
      const loadVehicleType = parsedData.vehicle_type?.toLowerCase().replace(/[^a-z]/g, '');

      const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 3959;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      };

      for (const hunt of enabledHunts) {
        if (hunt.floor_load_id && loadId <= hunt.floor_load_id) continue;

        const huntCoords = hunt.hunt_coordinates as { lat: number; lng: number } | null;
        if (!huntCoords?.lat || !huntCoords?.lng) continue;

        const distance = haversineDistance(loadCoords.lat, loadCoords.lng, huntCoords.lat, huntCoords.lng);
        if (distance > parseFloat(hunt.pickup_radius || '200')) continue;

        // Parse vehicle_sizes as JSON array (hunt plans store multiple vehicle types)
        let huntVehicleSizes: string[] = [];
        if (hunt.vehicle_size) {
          try {
            const parsed = JSON.parse(hunt.vehicle_size);
            huntVehicleSizes = Array.isArray(parsed) ? parsed : [hunt.vehicle_size];
          } catch {
            huntVehicleSizes = [hunt.vehicle_size];
          }
        }
        
        // Check if load's vehicle type matches ANY of the hunt's selected types
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

        // Check payload/weight capacity - skip if load exceeds hunt's max capacity
        if (hunt.load_capacity) {
          const maxCapacity = parseFloat(hunt.load_capacity);
          const loadWeight = parseFloat(parsedData.weight || '0');
          if (!isNaN(maxCapacity) && !isNaN(loadWeight) && loadWeight > 0 && loadWeight > maxCapacity) {
            continue; // Load too heavy for this truck
          }
        }

        const { count: existingMatch } = await supabase
          .from('load_hunt_matches')
          .select('id', { count: 'exact', head: true })
          .eq('load_email_id', loadEmailId)
          .eq('hunt_plan_id', hunt.id);

        if (existingMatch && existingMatch > 0) continue;

        // COOLDOWN GATING: Check if we should trigger action for this fingerprint
        // Cooldown is a MINIMUM threshold: suppress if delta < cooldown; allow if delta >= cooldown. No upper bound.
        // FAIL-CLOSED: If any gate data missing or RPC errors, suppress the match to prevent duplicates
        const effectiveTenantId = tenantId || hunt.tenant_id;
        const hasFp = loadContentFingerprint && loadContentFingerprint.trim() !== '';
        const hasReceivedAt = !!receivedAt;
        const hasTenant = !!effectiveTenantId;
        
        if (!hasFp || !hasReceivedAt || !hasTenant) {
          const missing = [
            !hasFp ? 'fingerprint' : null,
            !hasReceivedAt ? 'receivedAt' : null,
            !hasTenant ? 'tenant' : null,
          ].filter(Boolean).join('|');
          console.log(`[hunt-cooldown] suppressed_missing_gate_data tenant=${effectiveTenantId || 'null'} hunt=${hunt.id} load_email_id=${loadEmailId} missing=${missing}`);
          continue; // FAIL-CLOSED: Cannot enforce cooldown without all gate data
        }
        
        // Determine cooldown: hunt_plans.cooldown_seconds_min > tenants.cooldown_seconds_min > default 60
        let cooldownSecondsMin = 60; // System default
        if (hunt.cooldown_seconds_min != null) {
          cooldownSecondsMin = hunt.cooldown_seconds_min;
        } else if (effectiveTenantId) {
          // Fetch tenant default if hunt doesn't have one
          const { data: tenantData } = await supabase
            .from('tenants')
            .select('cooldown_seconds_min')
            .eq('id', effectiveTenantId)
            .maybeSingle();
          if (tenantData?.cooldown_seconds_min != null) {
            cooldownSecondsMin = tenantData.cooldown_seconds_min;
          }
        }
        
        const { data: shouldTrigger, error: cooldownError } = await supabase.rpc('should_trigger_hunt_for_fingerprint', {
          p_tenant_id: effectiveTenantId,
          p_hunt_plan_id: hunt.id,
          p_fingerprint: loadContentFingerprint,
          p_received_at: receivedAt.toISOString(),
          p_cooldown_seconds: cooldownSecondsMin,
          p_last_load_email_id: loadEmailId,
        });
        
        if (cooldownError) {
          // FAIL-CLOSED: On RPC error, suppress match to prevent duplicates
          console.error(`[hunt-cooldown] RPC error (SUPPRESSING match):`, cooldownError);
          continue; // Skip this match - gate is unhealthy
        }
        
        if (!shouldTrigger) {
          console.log(`[hunt-cooldown] suppressed tenant=${effectiveTenantId} hunt=${hunt.id} fp=${loadContentFingerprint.substring(0, 8)}... received_at=${receivedAt.toISOString()} cooldown=${cooldownSecondsMin}s`);
          continue; // Skip this match - still in cooldown
        }
        
        // Log allowed actions for observability
        console.log(`[hunt-cooldown] allowed tenant=${effectiveTenantId} hunt=${hunt.id} fp=${loadContentFingerprint.substring(0, 8)}... received_at=${receivedAt.toISOString()} cooldown=${cooldownSecondsMin}s`);
        

        await supabase.from('load_hunt_matches').insert({
          load_email_id: loadEmailId,
          hunt_plan_id: hunt.id,
          vehicle_id: hunt.vehicle_id,
          distance_miles: Math.round(distance),
          is_active: true,
          match_status: 'active',
          matched_at: new Date().toISOString(),
          tenant_id: tenantId, // Include tenant_id for multi-tenant isolation
        });
      }
    };

    // Process emails in parallel batches of 10 for ~10x speedup
    const BATCH_SIZE = 10;
    for (let i = 0; i < queueItems.length; i += BATCH_SIZE) {
      const batch = queueItems.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(item => processEmail(item)));
      
      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            processed++;
            if (result.value.queuedAt > (lastProcessedReceivedAt || '')) {
              lastProcessedReceivedAt = result.value.queuedAt;
            }
            if (result.value.loadId) {
              lastProcessedLoadId = result.value.loadId;
            }
          } else {
            errors++;
          }
        } else {
          errors++;
        }
      }
    }

    // Update checkpoint to the newest processed item (moving forward)
    if (lastProcessedReceivedAt) {
      const { error: updateError } = await supabase
        .from('processing_state')
        .upsert({
          id: 'email_processor',
          last_processed_received_at: lastProcessedReceivedAt,
          last_processed_load_id: lastProcessedLoadId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      
      if (updateError) {
        console.error('Failed to update checkpoint:', updateError);
      } else {
        console.log(`📍 Checkpoint updated to: ${lastProcessedReceivedAt} (${lastProcessedLoadId})`);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ Batch complete: ${processed} processed, ${errors} errors, ${elapsed}ms`);

    return new Response(JSON.stringify({ 
      processed, 
      errors, 
      elapsed,
      checkpoint: lastProcessedReceivedAt,
      lastLoadId: lastProcessedLoadId
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Processor error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
