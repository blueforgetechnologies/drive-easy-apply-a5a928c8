/**
 * Fingerprint / Deduplication Module
 * 
 * Ported from process-email-queue Edge Function.
 * Computes SHA256 fingerprint of parsed load data for exact-match deduplication.
 */

import crypto from 'crypto';
import type { ParsedEmailData } from './parsers/sylectus.js';

// Fingerprint version - increment when canonicalization logic changes
export const FINGERPRINT_VERSION = 1;

// Parse a numeric value and normalize to exactly 2 decimal places
function parseNumeric2Decimals(value: any): number | null {
  if (value === null || value === undefined) return null;
  
  if (typeof value === 'number') {
    if (isNaN(value)) return null;
    return Math.round(value * 100) / 100;
  }
  
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (trimmed === '') return null;
    
    // Handle European comma-decimal
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

// Parse an integer value strictly
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

// Normalize a string for fingerprinting: trim only
function normalizeStringStrict(value: any): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === 'string') {
    const trimmed = value.trim();
    return trimmed === '' ? null : trimmed;
  }
  return String(value).trim() || null;
}

// Normalize a string for case-insensitive fields: trim + lowercase
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
  
  // Try MM/DD/YY or MM/DD/YYYY
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

// Normalize stops array for fingerprinting
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

// Build canonical payload for fingerprinting
export function buildCanonicalLoadPayload(parsedData: Record<string, any>): Record<string, any> {
  const payload: Record<string, any> = {
    fingerprint_version: FINGERPRINT_VERSION,
    
    // Broker info
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
    
    // Order identifiers
    order_number: normalizeStringStrict(parsedData.order_number),
    order_number_secondary: normalizeStringStrict(parsedData.order_number_secondary),
    customer: normalizeStringStrict(parsedData.customer),
    
    // Origin
    origin_city: normalizeStringStrict(parsedData.origin_city),
    origin_state: normalizeStringStrict(parsedData.origin_state)?.toUpperCase() || null,
    origin_zip: normalizeStringStrict(parsedData.origin_zip),
    
    // Destination
    destination_city: normalizeStringStrict(parsedData.destination_city),
    destination_state: normalizeStringStrict(parsedData.destination_state)?.toUpperCase() || null,
    destination_zip: normalizeStringStrict(parsedData.destination_zip),
    
    // Load details
    miles: parseNumeric2Decimals(parsedData.miles),
    loaded_miles: parseNumeric2Decimals(parsedData.loaded_miles),
    weight: parseNumeric2Decimals(parsedData.weight),
    pieces: parseIntStrict(parsedData.pieces),
    
    // Rate/pricing
    rate: parseNumeric2Decimals(parsedData.rate),
    posted_amount: parseNumeric2Decimals(parsedData.posted_amount),
    
    // Dates
    pickup_date: normalizeDateStrict(parsedData.pickup_date),
    pickup_time: normalizeStringStrict(parsedData.pickup_time),
    delivery_date: normalizeDateStrict(parsedData.delivery_date),
    delivery_time: normalizeStringStrict(parsedData.delivery_time),
    expires_datetime: normalizeStringStrict(parsedData.expires_datetime),
    expires_at: normalizeStringStrict(parsedData.expires_at),
    
    // Equipment
    vehicle_type: normalizeStringStrict(parsedData.vehicle_type)?.toLowerCase() || null,
    load_type: normalizeStringStrict(parsedData.load_type)?.toLowerCase() || null,
    
    // Dimensions
    length: parseNumeric2Decimals(parsedData.length),
    width: parseNumeric2Decimals(parsedData.width),
    height: parseNumeric2Decimals(parsedData.height),
    dimensions: normalizeStringStrict(parsedData.dimensions),
    
    // Special requirements
    hazmat: normalizeBooleanStrict(parsedData.hazmat),
    team_required: normalizeBooleanStrict(parsedData.team_required),
    stackable: normalizeBooleanStrict(parsedData.stackable),
    dock_level: normalizeBooleanStrict(parsedData.dock_level),
    
    // Multi-stop info
    stops: normalizeStops(parsedData.stops),
    stop_count: parseIntStrict(parsedData.stop_count),
    has_multiple_stops: normalizeBooleanStrict(parsedData.has_multiple_stops),
    
    // Commodity and notes
    commodity: normalizeStringStrict(parsedData.commodity),
    special_instructions: normalizeStringStrict(parsedData.special_instructions),
    notes: normalizeStringStrict(parsedData.notes),
    
    // Additional fields
    broker: normalizeStringStrict((parsedData as any).broker),
    email: normalizeStringLower((parsedData as any).email),
    customer_name: normalizeStringStrict((parsedData as any).customer_name),
  };
  
  return payload;
}

// Check if load has critical fields for safe deduplication
export function isDedupEligible(canonicalPayload: Record<string, any>): { eligible: boolean; reason: string | null } {
  const hasOrigin = canonicalPayload.origin_city && canonicalPayload.origin_state;
  const hasDestination = canonicalPayload.destination_city && canonicalPayload.destination_state;
  const hasBrokerIdentity = canonicalPayload.broker_company || canonicalPayload.broker_name || canonicalPayload.broker_email || canonicalPayload.mc_number;
  const hasPickupDate = canonicalPayload.pickup_date;
  
  if (!hasOrigin) {
    return { eligible: false, reason: 'missing_origin_location' };
  }
  
  if (!hasDestination) {
    return { eligible: false, reason: 'missing_destination_location' };
  }
  
  if (!hasBrokerIdentity) {
    return { eligible: false, reason: 'missing_broker_identity' };
  }
  
  if (!hasPickupDate) {
    return { eligible: false, reason: 'missing_pickup_date' };
  }
  
  return { eligible: true, reason: null };
}

// Deep sort object keys for deterministic serialization
function sortObjectKeys(obj: any): any {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  const sorted: Record<string, any> = {};
  for (const key of Object.keys(obj).sort()) {
    sorted[key] = sortObjectKeys(obj[key]);
  }
  return sorted;
}

// Compute SHA256 fingerprint of parsed load data
export function computeParsedLoadFingerprint(
  parsedData: Record<string, any>
): {
  fingerprint: string | null;
  canonicalPayload: Record<string, any> | null;
  dedupEligible: boolean;
  dedupEligibleReason: string | null;
  fingerprintMissingReason: string | null;
} {
  if (!parsedData || typeof parsedData !== 'object') {
    console.error(`[fingerprint] MISSING PARSED_DATA - cannot compute fingerprint`);
    return {
      fingerprint: null,
      canonicalPayload: null,
      dedupEligible: false,
      dedupEligibleReason: null,
      fingerprintMissingReason: 'missing_parsed_data',
    };
  }
  
  try {
    const canonicalPayload = buildCanonicalLoadPayload(parsedData);
    const eligibility = isDedupEligible(canonicalPayload);
    
    const sortedPayload = sortObjectKeys(canonicalPayload);
    const payloadString = JSON.stringify(sortedPayload);
    
    // Compute SHA256 using Node.js crypto
    const hash = crypto.createHash('sha256');
    hash.update(payloadString);
    const fingerprint = hash.digest('hex');
    
    return {
      fingerprint,
      canonicalPayload: sortedPayload,
      dedupEligible: eligibility.eligible,
      dedupEligibleReason: eligibility.reason,
      fingerprintMissingReason: null,
    };
  } catch (error) {
    console.error(`[fingerprint] EXCEPTION during fingerprint computation: ${error}`);
    return {
      fingerprint: null,
      canonicalPayload: null,
      dedupEligible: false,
      dedupEligibleReason: null,
      fingerprintMissingReason: 'exception_during_compute',
    };
  }
}

// Generate a content hash for smart business-level deduplication (legacy)
export function generateContentHash(parsedData: Record<string, any>): string {
  const coreFields = [
    (parsedData.origin_city || '').toLowerCase().trim(),
    (parsedData.origin_state || '').toUpperCase().trim(),
    (parsedData.destination_city || '').toLowerCase().trim(),
    (parsedData.destination_state || '').toUpperCase().trim(),
    (parsedData.pickup_date || '').trim(),
    (parsedData.order_number || '').trim(),
    (parsedData.vehicle_type || '').toLowerCase().trim(),
  ];
  
  const hashInput = coreFields.join('|');
  
  let hash = 0;
  for (let i = 0; i < hashInput.length; i++) {
    const char = hashInput.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  
  return `ch_${Math.abs(hash).toString(36)}`;
}
