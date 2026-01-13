import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

const GMAIL_CLIENT_ID = Deno.env.get('GMAIL_CLIENT_ID')!;
const GMAIL_CLIENT_SECRET = Deno.env.get('GMAIL_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/**
 * TENANT ISOLATION NOTES:
 * This function fetches Gmail emails and creates load_emails records.
 * 
 * Tenant context is REQUIRED and derived from:
 * 1. gmail_tokens table (tenant_id column on the token row)
 * 2. tenant_integrations table (links gmail email to tenant)
 * 
 * If no tenant mapping exists, the function ABORTS with an error.
 * NO FALLBACK TO DEFAULT TENANT - this is a critical security measure.
 * 
 * All inserts include tenant_id for proper scoping.
 */

// Global tenant context for this execution
let effectiveTenantId: string | null = null;

async function getEffectiveTenantId(userEmail: string): Promise<{ tenantId: string | null; error: string | null }> {
  // PRIORITY 1: Check gmail_tokens table for tenant_id (most reliable mapping)
  const { data: tokenData, error: tokenError } = await supabase
    .from('gmail_tokens')
    .select('tenant_id')
    .eq('user_email', userEmail)
    .maybeSingle();
  
  if (tokenData?.tenant_id) {
    console.log(`[fetch-gmail-loads] Found tenant from gmail_tokens: ${tokenData.tenant_id}`);
    return { tenantId: tokenData.tenant_id, error: null };
  }
  
  // PRIORITY 2: Check tenant_integrations for this gmail account
  const { data: integration } = await supabase
    .from('tenant_integrations')
    .select('tenant_id, settings')
    .eq('provider', 'gmail')
    .eq('is_enabled', true);
  
  // Look for an integration that matches this email
  if (integration && integration.length > 0) {
    for (const int of integration) {
      // Check if settings contains this email
      const settings = int.settings as Record<string, any> || {};
      if (settings.email === userEmail || settings.gmail_email === userEmail) {
        console.log(`[fetch-gmail-loads] Found tenant from tenant_integrations: ${int.tenant_id}`);
        return { tenantId: int.tenant_id, error: null };
      }
    }
    // If only one gmail integration exists, use it (legacy compatibility)
    if (integration.length === 1) {
      console.log(`[fetch-gmail-loads] Using single gmail integration tenant: ${integration[0].tenant_id}`);
      return { tenantId: integration[0].tenant_id, error: null };
    }
  }
  
  // NO FALLBACK - Return error if no tenant mapping found
  const errorMsg = `No tenant mapping found for Gmail account: ${userEmail}. Please configure tenant_id in gmail_tokens or tenant_integrations.`;
  console.error(`[fetch-gmail-loads] CRITICAL: ${errorMsg}`);
  return { tenantId: null, error: errorMsg };
}

// ============================================================================
// PARSED LOAD FINGERPRINT - Strict Exact-match deduplication
// SHA256 of ALL parsed fields with meaning-preserving normalization.
// Provider is REQUIRED to prevent cross-provider dedup.
// ============================================================================

const FINGERPRINT_VERSION = 1;

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

// Build canonical payload for fingerprinting
// CRITICAL: provider is REQUIRED to prevent cross-provider dedup
function buildCanonicalLoadPayload(parsedData: Record<string, any>, provider: string): Record<string, any> {
  return {
    fingerprint_version: FINGERPRINT_VERSION,
    provider: provider.toLowerCase(), // REQUIRED, prevents cross-provider dedup
    
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
  const hasBrokerIdentity = canonicalPayload.broker_company || canonicalPayload.broker_name || 
                            canonicalPayload.broker_email || canonicalPayload.mc_number;
  const hasPickupDate = canonicalPayload.pickup_date;
  
  if (!hasOrigin) return { eligible: false, reason: 'missing_origin_location' };
  if (!hasDestination) return { eligible: false, reason: 'missing_destination_location' };
  if (!hasBrokerIdentity) return { eligible: false, reason: 'missing_broker_identity' };
  if (!hasPickupDate) return { eligible: false, reason: 'missing_pickup_date' };
  
  return { eligible: true, reason: null };
}

// Compute SHA256 fingerprint - provider is REQUIRED
async function computeParsedLoadFingerprint(
  parsedData: Record<string, any>,
  provider: string
): Promise<{
  fingerprint: string;
  canonicalPayload: Record<string, any>;
  dedupEligible: boolean;
  dedupEligibleReason: string | null;
}> {
  const canonicalPayload = buildCanonicalLoadPayload(parsedData, provider);
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
}


async function refreshAccessToken(refreshToken: string): Promise<string> {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const tokens = await tokenResponse.json();
  
  if (!tokens.access_token) {
    throw new Error('Failed to refresh access token');
  }

  const tokenExpiry = new Date(Date.now() + (tokens.expires_in * 1000));
  await supabase
    .from('gmail_tokens')
    .update({
      access_token: tokens.access_token,
      token_expiry: tokenExpiry.toISOString(),
    })
    .eq('refresh_token', refreshToken);

  return tokens.access_token;
}

async function getAccessToken(userEmail: string): Promise<string> {
  const { data: tokenData, error } = await supabase
    .from('gmail_tokens')
    .select('*')
    .eq('user_email', userEmail)
    .single();

  if (error || !tokenData) {
    throw new Error('No Gmail token found');
  }

  const tokenExpiry = new Date(tokenData.token_expiry);
  if (tokenExpiry <= new Date()) {
    return await refreshAccessToken(tokenData.refresh_token);
  }

  return tokenData.access_token;
}

// Detect if email is Full Circle TMS
function isFullCircleEmail(fromEmail: string, subject: string, bodyHtml: string): boolean {
  const fromLower = fromEmail.toLowerCase();
  const subjectLower = subject.toLowerCase();
  const bodyLower = bodyHtml.toLowerCase();
  
  // Check from email
  if (fromLower.includes('fullcircletms.com') || fromLower.includes('fctms.com')) {
    return true;
  }
  
  // Check subject
  if (subjectLower.includes('private network load board') || 
      subjectLower.includes('yfnplb') ||
      subjectLower.includes('fullcircle')) {
    return true;
  }
  
  // Check body content
  if (bodyLower.includes('app.fullcircletms.com') || 
      bodyLower.includes('bid yes to this load') ||
      bodyLower.includes('fctms.com') ||
      bodyLower.includes('fullcircletms.com')) {
    return true;
  }
  
  return false;
}

// Parse Full Circle TMS email format
function parseFullCircleTMSEmail(subject: string, bodyText: string): any {
  const data: any = {};
  
  // Parse route from subject
  const subjectRouteMatch = subject?.match(/from\s+([A-Za-z\s]+),\s*([A-Z]{2})\s+to\s+([A-Za-z\s]+),\s*([A-Z]{2})/i);
  if (subjectRouteMatch) {
    data.origin_city = subjectRouteMatch[1].trim();
    data.origin_state = subjectRouteMatch[2];
    data.destination_city = subjectRouteMatch[3].trim();
    data.destination_state = subjectRouteMatch[4];
  }
  
  // Parse vehicle type from subject
  const vehicleSubjectMatch = subject?.match(/^([A-Za-z\s]+)\s+from\s+/i);
  if (vehicleSubjectMatch) {
    data.vehicle_type = vehicleSubjectMatch[1].trim();
  }
  
  // Parse miles and weight from subject
  const milesWeightMatch = subject?.match(/:\s*(\d+)\s*mi,\s*(\d+)\s*lbs/i);
  if (milesWeightMatch) {
    data.loaded_miles = parseInt(milesWeightMatch[1]);
    data.weight = milesWeightMatch[2];
  }
  
  // Parse broker info from subject
  const postedByMatch = subject?.match(/Posted by\s+(.+?)\s+([\w.+-]+@[\w.-]+\.\w+)/i);
  if (postedByMatch) {
    data.broker_company = postedByMatch[1].trim();
    data.broker_email = postedByMatch[2].trim();
  }
  
  // Order numbers
  const orderMatch = bodyText?.match(/ORDER\s*NUMBER:?\s*(\d+)(?:\s+or\s+(\d+))?/i);
  if (orderMatch) {
    data.order_number = orderMatch[1];
    if (orderMatch[2]) data.order_number_secondary = orderMatch[2];
  }
  
  if (!data.order_number) {
    const postingIdMatch = bodyText?.match(/posting\/(\d+)\/bid/i);
    if (postingIdMatch) {
      data.order_number = postingIdMatch[1];
    }
  }
  
  // Extract stops from HTML table - zip can be empty
  const htmlStopsPattern = /<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(Pick Up|Delivery)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([A-Z]{2})<\/td>\s*<td[^>]*>([A-Z0-9]*)<\/td>\s*<td[^>]*>(USA|CAN)<\/td>\s*<td[^>]*>(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?<\/td>/gi;
  const stops: Array<{type: string, city: string, state: string, zip: string, country: string, datetime: string, tz: string, sequence: number}> = [];
  let match;
  while ((match = htmlStopsPattern.exec(bodyText)) !== null) {
    stops.push({
      sequence: parseInt(match[1]),
      type: match[2].toLowerCase(),
      city: match[3].trim(),
      state: match[4],
      zip: match[5],
      country: match[6],
      datetime: match[7],
      tz: match[8] || 'EST'
    });
  }
  
  // Set origin from first pickup
  const firstPickup = stops.find(s => s.type === 'pick up');
  if (firstPickup) {
    data.origin_city = firstPickup.city;
    data.origin_state = firstPickup.state;
    data.origin_zip = firstPickup.zip;
    data.pickup_date = firstPickup.datetime.split(' ')[0];
    data.pickup_time = firstPickup.datetime.split(' ')[1] + ' ' + firstPickup.tz;
  }
  
  // Set destination from first delivery
  const firstDelivery = stops.find(s => s.type === 'delivery');
  if (firstDelivery) {
    data.destination_city = firstDelivery.city;
    data.destination_state = firstDelivery.state;
    data.destination_zip = firstDelivery.zip;
    data.delivery_date = firstDelivery.datetime.split(' ')[0];
    data.delivery_time = firstDelivery.datetime.split(' ')[1] + ' ' + firstDelivery.tz;
  }
  
  if (stops.length > 0) {
    data.stops = stops;
    data.stop_count = stops.length;
    data.has_multiple_stops = stops.length > 2;
  }
  
  // Parse expiration
  const expiresMatch = bodyText?.match(/This posting expires:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(EST|CST|MST|PST|EDT|CDT|MDT|PDT)/i);
  if (expiresMatch) {
    const dateStr = expiresMatch[1];
    const timeStr = expiresMatch[2];
    const timezone = expiresMatch[3];
    data.expires_datetime = `${dateStr} ${timeStr} ${timezone}`;
    
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
      }
    } catch (e) {
      console.error('Error parsing FCTMS expiration:', e);
    }
  }
  
  // Parse pieces and weight
  const totalPiecesMatch = bodyText?.match(/<b>Total Pieces:<\/b>\s*(\d+)|Total Pieces:?\s*(\d+)/i);
  if (totalPiecesMatch) {
    data.pieces = parseInt(totalPiecesMatch[1] || totalPiecesMatch[2]);
  }
  
  if (!data.weight) {
    const totalWeightMatch = bodyText?.match(/<b>Total Weight:<\/b>\s*([\d,]+)|Total Weight:?\s*([\d,]+)\s*lbs?/i);
    if (totalWeightMatch) {
      data.weight = (totalWeightMatch[1] || totalWeightMatch[2]).replace(',', '');
    }
  }
  
  // Parse distance if not from subject
  if (!data.loaded_miles) {
    const distanceMatch = bodyText?.match(/<b>Distance:<\/b>\s*([\d,]+)\s*mi|Distance:?\s*([\d,]+)\s*mi/i);
    if (distanceMatch) {
      data.loaded_miles = parseInt((distanceMatch[1] || distanceMatch[2]).replace(',', ''));
    }
  }
  
  // Extract broker email from mailto link
  if (!data.broker_email) {
    const mailtoMatch = bodyText?.match(/mailto:([^\s"<>]+@[^\s"<>]+)/i);
    if (mailtoMatch) {
      data.broker_email = mailtoMatch[1].trim();
    }
  }
  
  // MC# extraction
  const mcMatch = bodyText?.match(/\(MC#\s*(\d+)\)/i);
  if (mcMatch) {
    data.mc_number = mcMatch[1];
  }
  
  // Broker company from "please contact:" section
  if (!data.broker_company) {
    const contactMatch = bodyText?.match(/please contact:[\s\S]*?<br\s*\/?>\s*([^<\n(]+)/i);
    if (contactMatch) {
      data.broker_company = contactMatch[1].trim().replace(/\(MC#.*$/, '').trim();
    }
  }
  
  // Broker phone
  const phoneMatch = bodyText?.match(/Phone:\s*\(?([\d\-\(\)\s]+)/i);
  if (phoneMatch) {
    data.broker_phone = phoneMatch[1].trim();
  }
  
  // Extract notes from red-colored text (h4 or p tags with style="color:red")
  const extractedNotes: string[] = [];
  const processNoteText = (text: string): string | null => {
    let noteText = text.trim();
    noteText = noteText.replace(/&#x([0-9A-F]+);/gi, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
    noteText = noteText.replace(/&#(\d+);/g, (_, dec) => String.fromCharCode(parseInt(dec)));
    noteText = noteText.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"');
    noteText = noteText.replace(/<[^>]*>/g, '').trim();
    noteText = noteText.replace(/^Notes:\s*/i, '');
    if (!noteText || 
        noteText.toLowerCase().includes('submit your bid via') || 
        noteText.toLowerCase().includes('submitted bids must include') ||
        noteText.toLowerCase().includes('location of your vehicle') ||
        noteText.toLowerCase().includes('confirm all key requirements')) {
      return null;
    }
    return noteText;
  };
  
  // Pattern 1: Red <p> tags
  const redPPattern = /<p[^>]*style\s*=\s*["'][^"']*color\s*:\s*red[^"']*["'][^>]*>([\s\S]*?)<\/p>/gi;
  let noteMatch;
  while ((noteMatch = redPPattern.exec(bodyText)) !== null) {
    const processed = processNoteText(noteMatch[1]);
    if (processed) extractedNotes.push(processed);
  }
  
  // Pattern 2: Red <h4> tags
  const redH4Pattern = /<h4[^>]*style\s*=\s*["'][^"']*color\s*:\s*red[^"']*["'][^>]*>([\s\S]*?)<\/h4>/gi;
  while ((noteMatch = redH4Pattern.exec(bodyText)) !== null) {
    const processed = processNoteText(noteMatch[1]);
    if (processed) extractedNotes.push(processed);
  }
  
  if (extractedNotes.length > 0) {
    data.notes = extractedNotes.join(' | ');
    console.log(`📝 FCTMS: Extracted notes: ${data.notes.substring(0, 100)}...`);
  }
  
  console.log(`📦 FCTMS parsed: Order ${data.order_number}, ${data.origin_city || data.origin_state} -> ${data.destination_city || data.destination_state}, ${data.vehicle_type}`);
  
  return data;
}

function parseLoadEmail(subject: string, bodyText: string): any {
  const parsed: any = {};

  // Parse Sylectus email subject format:
  // "VAN from Van Horn, TX to Tupelo, MS - Expedited Load - Typical Premium Freight Hot Shot Load : 1091 miles, 0 lbs. - Posted by..."
  
  // Extract vehicle type (first word)
  const vehicleTypeMatch = subject.match(/^([A-Z\s]+)\s+from/i);
  if (vehicleTypeMatch) {
    parsed.vehicle_type = vehicleTypeMatch[1].trim();
  }

  // Extract origin and destination from subject
  const routeMatch = subject.match(/from\s+([^,]+),\s*([A-Z]{2})\s+to\s+([^,]+),\s*([A-Z]{2})/i);
  if (routeMatch) {
    parsed.origin_city = routeMatch[1].trim();
    parsed.origin_state = routeMatch[2].trim();
    parsed.destination_city = routeMatch[3].trim();
    parsed.destination_state = routeMatch[4].trim();
  }

  // Extract miles from subject
  const milesMatch = subject.match(/:\s*(\d+)\s*miles/i);
  if (milesMatch) {
    parsed.loaded_miles = parseInt(milesMatch[1]);
  }

  // Extract weight from subject
  const weightMatch = subject.match(/(\d+)\s*lbs/i);
  if (weightMatch) {
    parsed.weight = weightMatch[1];
  }

  // Extract customer/poster from subject (this is also the broker in Sylectus emails)
  const postedByMatch = subject.match(/Posted by\s+([^(]+)/i);
  if (postedByMatch) {
    const posterName = postedByMatch[1].trim();
    parsed.customer = posterName;
    parsed.broker = posterName; // Broker is the same as the poster in Sylectus
  }

  // Extract Order Number from body text (e.g., "Bid on Order #206389")
  const orderNumberMatch = bodyText.match(/Bid on Order #(\d+)/i);
  if (orderNumberMatch) {
    parsed.order_number = orderNumberMatch[1];
  }

  // Extract from HTML structure using <strong> tags
  // Pieces: <strong>Pieces: </strong>1</p>
  const piecesHtmlMatch = bodyText.match(/<strong>Pieces?:\s*<\/strong>\s*(\d+)/i);
  if (piecesHtmlMatch) {
    parsed.pieces = parseInt(piecesHtmlMatch[1]);
  }

  // Dimensions: <strong>Dimensions: </strong>48L x 40W x 72H</p>
  const dimsHtmlMatch = bodyText.match(/<strong>Dimensions?:\s*<\/strong>\s*(\d+)L?\s*[xX]\s*(\d+)W?\s*[xX]\s*(\d+)H?/i);
  if (dimsHtmlMatch) {
    parsed.dimensions = `${dimsHtmlMatch[1]}x${dimsHtmlMatch[2]}x${dimsHtmlMatch[3]}`;
  }

  // Expires: <strong>Expires: </strong>11/30/25 12:00 EST</p>
  const expiresHtmlMatch = bodyText.match(/<strong>Expires?:\s*<\/strong>\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*([A-Z]{2,3}T?)/i);
  if (expiresHtmlMatch) {
    const dateStr = expiresHtmlMatch[1];
    const timeStr = expiresHtmlMatch[2];
    const timezone = expiresHtmlMatch[3];
    parsed.expires_datetime = `${dateStr} ${timeStr} ${timezone}`;
    
    // Convert to ISO timestamp for expires_at column with proper timezone handling
    try {
      // Parse date (handle both MM/DD/YY and MM/DD/YYYY)
      const dateParts = dateStr.split('/');
      const month = dateParts[0].padStart(2, '0');
      const day = dateParts[1].padStart(2, '0');
      let year = dateParts[2];
      
      // Convert 2-digit year to 4-digit (25 -> 2025)
      if (year.length === 2) {
        year = '20' + year;
      }
      
      // Parse time (handle both 12h and 24h format)
      const timeParts = timeStr.split(':');
      const hour = timeParts[0].padStart(2, '0');
      const minute = timeParts[1].padStart(2, '0');
      
      // Map timezone abbreviations to UTC offsets
      const timezoneOffsets: { [key: string]: string } = {
        'EST': '-05:00',
        'EDT': '-04:00',
        'CST': '-06:00',
        'CDT': '-05:00',
        'MST': '-07:00',
        'MDT': '-06:00',
        'PST': '-08:00',
        'PDT': '-07:00',
        'CEN': '-06:00', // Central
        'CENT': '-06:00',
      };
      
      const offset = timezoneOffsets[timezone.toUpperCase()] || '-05:00'; // Default to EST
      
      // Construct ISO 8601 string: YYYY-MM-DDTHH:MM:SS-05:00
      const isoString = `${year}-${month}-${day}T${hour}:${minute}:00${offset}`;
      const expiresDate = new Date(isoString);
      
      if (!isNaN(expiresDate.getTime())) {
        parsed.expires_at = expiresDate.toISOString();
      }
    } catch (e) {
      console.error('Error parsing expires date:', e);
    }
  }

  // Clean HTML for text-based parsing (fallback for other fields)
  let cleanText = bodyText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  // Extract pickup date and time from HTML structure
  // Look for the second <p> tag inside leginfo within pickup-box
  const pickupBoxMatch = bodyText.match(/<div class=['"]pickup-box['"]>[\s\S]*?<div class=['"]leginfo['"]>([\s\S]*?)<\/div>/i);
  if (pickupBoxMatch) {
    const leginfoContent = pickupBoxMatch[1];
    // Extract all <p> tags from leginfo
    const pTags = leginfoContent.match(/<p[^>]*>(.*?)<\/p>/gi);
    if (pTags && pTags.length >= 2) {
      // Second <p> tag should contain the date/time or instruction
      const secondP = pTags[1].replace(/<[^>]*>/g, '').trim();
      
      // First, try to match date + time together (e.g., "11/30/25 10:00 EST")
      const dateTimeMatch = secondP.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})/i);
      if (dateTimeMatch) {
        // Found both date and time - use them
        parsed.pickup_date = dateTimeMatch[1];
        parsed.pickup_time = dateTimeMatch[2];
      } else {
        // No date/time found, check if it's a valid instruction text (not a location fragment)
        // Valid instructions: ASAP, Deliver Direct, or similar short phrases
        // Exclude if it looks like a location (contains state abbreviations at end)
        const isLocationFragment = /\b[A-Z]{2}$/.test(secondP); // Ends with state code like "IN", "OH"
        if (!isLocationFragment && secondP.length > 0 && secondP.length < 50) {
          // It's likely a timing instruction like "ASAP" or "Deliver Direct"
          parsed.pickup_time = secondP;
        }
      }
    }
  }
  
  // Fallback to text-based extraction if nothing found
  if (!parsed.pickup_date && !parsed.pickup_time) {
    const pickupMatch = cleanText.match(/Pick.*?Up.*?(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})/i);
    if (pickupMatch) {
      parsed.pickup_date = pickupMatch[1];
      parsed.pickup_time = pickupMatch[2];
    }
  }

  // Extract delivery date and time from HTML structure
  // Look for the second <p> tag inside leginfo within delivery-box
  const deliveryBoxMatch = bodyText.match(/<div class=['"]delivery-box['"]>[\s\S]*?<div class=['"]leginfo['"]>([\s\S]*?)<\/div>/i);
  if (deliveryBoxMatch) {
    const leginfoContent = deliveryBoxMatch[1];
    // Extract all <p> tags from leginfo
    const pTags = leginfoContent.match(/<p[^>]*>(.*?)<\/p>/gi);
    if (pTags && pTags.length >= 2) {
      // Second <p> tag should contain the date/time or instruction
      const secondP = pTags[1].replace(/<[^>]*>/g, '').trim();
      
      // First, try to match date + time together (e.g., "11/30/25 10:00 EST")
      const dateTimeMatch = secondP.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})/i);
      if (dateTimeMatch) {
        // Found both date and time - use them
        parsed.delivery_date = dateTimeMatch[1];
        parsed.delivery_time = dateTimeMatch[2];
      } else {
        // No date/time found, check if it's a valid instruction text (not a location fragment)
        // Valid instructions: ASAP, Deliver Direct, or similar short phrases
        // Exclude if it looks like a location (contains state abbreviations at end)
        const isLocationFragment = /\b[A-Z]{2}$/.test(secondP); // Ends with state code like "IN", "OH"
        if (!isLocationFragment && secondP.length > 0 && secondP.length < 50) {
          // It's likely a timing instruction like "ASAP" or "Deliver Direct"
          parsed.delivery_time = secondP;
        }
      }
    }
  }
  
  // Fallback to text-based extraction if nothing found
  if (!parsed.delivery_date && !parsed.delivery_time) {
    const deliveryMatch = cleanText.match(/Delivery.*?(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})/i);
    if (deliveryMatch) {
      parsed.delivery_date = deliveryMatch[1];
      parsed.delivery_time = deliveryMatch[2];
    }
  }

  // Fallback: Extract pieces from plain text if not found in HTML
  if (!parsed.pieces) {
    const piecesMatch = cleanText.match(/(\d+)\s*(?:pieces?|pcs?|pallets?|plts?|plt|skids?)/i);
    if (piecesMatch) {
      parsed.pieces = parseInt(piecesMatch[1]);
    }
  }

  // Fallback: Extract dimensions from plain text if not found in HTML
  if (!parsed.dimensions) {
    const dimsSectionMatch = cleanText.match(/dimensions?[:\s-]*([0-9"' xX]+)/i);
    if (dimsSectionMatch) {
      const dimsInner = dimsSectionMatch[1];
      const dimsPattern = /(\d+)\s*[xX]\s*(\d+)\s*[xX]\s*(\d+)/;
      const innerMatch = dimsInner.match(dimsPattern);
      if (innerMatch) {
        parsed.dimensions = `${innerMatch[1]}x${innerMatch[2]}x${innerMatch[3]}`;
      }
    }
  }

  // Extract notes from HTML structure (notes-section class)
  const notesMatch = bodyText.match(/<div[^>]*class=['"]notes-section['"][^>]*>([\s\S]*?)<\/div>/i);
  if (notesMatch) {
    const notesContent = notesMatch[1];
    // Extract text from <p> tags, join with comma
    const notesPTags = notesContent.match(/<p[^>]*>(.*?)<\/p>/gi);
    if (notesPTags && notesPTags.length > 0) {
      const notesText = notesPTags
        .map(tag => tag.replace(/<[^>]*>/g, '').trim())
        .filter(text => text.length > 0)
        .join(', ');
      if (notesText) {
        parsed.notes = notesText;
      }
    }
  }

  // Extract broker information from HTML structure
  // Remove line breaks and extra whitespace for better regex matching
  const cleanedHtml = bodyText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
  
  // Extract Posted Amount (not Rate) - look for "Posted Amount:" specifically
  const postedAmountMatch = cleanedHtml.match(/<strong>Posted Amount:\s*<\/strong>\s*\$?\s*([\d,]+(?:\.\d{2})?)/i);
  if (postedAmountMatch) {
    parsed.rate = parseFloat(postedAmountMatch[1].replace(/,/g, ''));
  }
  
  
  // Broker Name: <strong>Broker Name: </strong>VALUE (text or inside tags)
  const brokerNameMatch = cleanedHtml.match(/<strong>Broker Name:\s*<\/strong>\s*(?:<[^>]+>)?([^<]+)/i);
  if (brokerNameMatch) {
    parsed.broker_name = brokerNameMatch[1].trim();
  }

  // Broker Company: <strong>Broker Company: </strong>VALUE (text or inside tags)
  const brokerCompanyMatch = cleanedHtml.match(/<strong>Broker Company:\s*<\/strong>\s*(?:<[^>]+>)?([^<]+)/i);
  if (brokerCompanyMatch) {
    parsed.broker_company = brokerCompanyMatch[1].trim();
  }

  // Broker Phone: <strong>Broker Phone: </strong>VALUE (text or inside tags)
  const brokerPhoneMatch = cleanedHtml.match(/<strong>Broker Phone:\s*<\/strong>\s*(?:<[^>]+>)?([^<]+)/i);
  if (brokerPhoneMatch) {
    parsed.broker_phone = brokerPhoneMatch[1].trim();
  }

  // Email field (not broker email - this is the general Email: field)
  // 1. <strong>Email: </strong>VALUE (direct text)
  let emailMatch1 = cleanedHtml.match(/<strong>Email:\s*<\/strong>\s*([^<]+)/i);
  if (emailMatch1 && emailMatch1[1].trim()) {
    parsed.email = emailMatch1[1].trim();
  }
  
  // 2. <strong>Email: </strong><a ...>VALUE</a> (inside link tag)
  if (!parsed.email) {
    const emailInLinkMatch = cleanedHtml.match(/<strong>Email:\s*<\/strong>\s*<a[^>]*>([^<]+)<\/a>/i);
    if (emailInLinkMatch) {
      parsed.email = emailInLinkMatch[1].trim();
    }
  }
  
  // Broker Email (separate field) - can be in subject line after poster name
  const emailInSubject = subject.match(/\(([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)\)/);
  if (emailInSubject) {
    parsed.broker_email = emailInSubject[1].trim();
  }

  // Load Type: <strong>Load Type: </strong>VALUE
  const loadTypeMatch = cleanedHtml.match(/<strong>Load Type:\s*<\/strong>\s*(?:<[^>]+>)?([^<]+)/i);
  if (loadTypeMatch) {
    parsed.load_type = loadTypeMatch[1].trim();
  }

  // Dock Level: <strong>Dock Level: </strong>VALUE
  const dockLevelMatch = cleanedHtml.match(/<strong>Dock Level:\s*<\/strong>\s*(?:<[^>]+>)?([^<]+)/i);
  if (dockLevelMatch) {
    parsed.dock_level = dockLevelMatch[1].trim();
  }

  // Hazmat: <strong>Hazmat: </strong>VALUE (Yes/No)
  const hazmatMatch = cleanedHtml.match(/<strong>Hazmat:\s*<\/strong>\s*(?:<[^>]+>)?([^<]+)/i);
  if (hazmatMatch) {
    const hazmatValue = hazmatMatch[1].trim().toLowerCase();
    parsed.hazmat = hazmatValue === 'yes' || hazmatValue === 'true';
  }

  // Stackable: <strong>Stackable: </strong>VALUE (Yes/No)
  const stackableMatch = cleanedHtml.match(/<strong>Stackable:\s*<\/strong>\s*(?:<[^>]+>)?([^<]+)/i);
  if (stackableMatch) {
    const stackableValue = stackableMatch[1].trim().toLowerCase();
    parsed.stackable = stackableValue === 'yes' || stackableValue === 'true';
  }

  // Detect 2 STOPS - look for multiple stop indicators in the email
  // Check for "2 stops" or "two stops" or multiple pickup/delivery sections
  const twoStopsIndicator = cleanedHtml.match(/2\s+stops/i) || cleanedHtml.match(/two\s+stops/i);
  if (twoStopsIndicator) {
    parsed.has_multiple_stops = true;
    parsed.stop_count = 2;
  }

  return parsed;
}

// Geocoding result with error code for diagnostics
type GeocodeResult = {
  coords: { lat: number; lng: number } | null;
  errorCode: string | null;
};

// Geocode location using Mapbox and cache
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

  const locationKey = `${city.toLowerCase().trim()}, ${state.toLowerCase().trim()}`;

  try {
    // Check cache first
    const { data: cached } = await supabase
      .from('geocode_cache')
      .select('latitude, longitude, id, hit_count')
      .eq('location_key', locationKey)
      .maybeSingle();

    if (cached) {
      supabase
        .from('geocode_cache')
        .update({ hit_count: (cached.hit_count || 1) + 1 })
        .eq('id', cached.id)
        .then(() => {});
      console.log(`📍 Geocode cache HIT: ${city}, ${state}`);
      return { coords: { lat: Number(cached.latitude), lng: Number(cached.longitude) }, errorCode: null };
    }

    // Cache miss - call Mapbox
    const query = encodeURIComponent(`${city}, ${state}, USA`);
    console.log(`📍 Geocode cache MISS: ${city}, ${state} - calling Mapbox API`);
    
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxToken}&limit=1`
    );
    
    // Log rate limit headers for monitoring
    const rateLimitLimit = response.headers.get('x-rate-limit-limit');
    const rateLimitRemaining = response.headers.get('x-rate-limit-remaining');
    const rateLimitReset = response.headers.get('x-rate-limit-reset');
    
    if (rateLimitRemaining) {
      console.log(`📍 Mapbox rate limit: ${rateLimitRemaining}/${rateLimitLimit} remaining, reset: ${rateLimitReset}`);
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
      
      const currentMonth = new Date().toISOString().slice(0, 7);
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
        console.error(`📍 Cache upsert FAILED for ${city}, ${state}:`, upsertError);
      }
      
      console.log(`📍 Geocoded & cached: ${city}, ${state} → ${coords.lat.toFixed(4)}, ${coords.lng.toFixed(4)}`);
      return { coords, errorCode: null };
    } else {
      console.warn(`📍 GEOCODE ERROR: no_features for "${city}, ${state}"`, {
        query: `${city}, ${state}, USA`,
        featureCount: data.features?.length || 0,
        attribution: data.attribution,
      });
      return { coords: null, errorCode: 'no_features' };
    }
  } catch (e) {
    console.error(`📍 GEOCODE ERROR: exception for "${city}, ${state}":`, e);
    return { coords: null, errorCode: 'exception' };
  }
}

// SMART MATCHING: Regional pre-filter before checking individual hunts
// This reduces distance calculations by 60-80% by first checking if email
// is within a broad region (500mi) of ANY hunt before checking all hunts individually
async function matchLoadToHunts(
  loadEmailId: string, 
  loadId: string, 
  parsedData: any,
  tenantId: string | null = null,
  loadContentFingerprint: string | null = null,
  receivedAt: Date | null = null
) {
  // Filter hunts by tenant if provided for proper isolation
  // Include cooldown_seconds_min for configurable cooldown
  const huntQuery = supabase
    .from('hunt_plans')
    .select('id, vehicle_id, hunt_coordinates, pickup_radius, vehicle_size, floor_load_id, load_capacity, tenant_id, cooldown_seconds_min')
    .eq('enabled', true);
  
  if (tenantId) {
    huntQuery.eq('tenant_id', tenantId);
  }
  
  const { data: enabledHunts } = await huntQuery;

  if (!enabledHunts?.length) return;

  const loadCoords = parsedData.pickup_coordinates;
  if (!loadCoords) return;
  
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

  // SMART PRE-FILTER: Check if load is within 500 miles of ANY hunt
  // This eliminates most emails before doing individual hunt checks
  const REGIONAL_RADIUS = 500; // miles
  const huntsWithCoords = enabledHunts.filter(h => {
    const coords = h.hunt_coordinates as { lat: number; lng: number } | null;
    return coords?.lat && coords?.lng;
  });
  
  if (huntsWithCoords.length === 0) return;
  
  // Quick check: is this load within regional radius of any hunt?
  const isInAnyRegion = huntsWithCoords.some(hunt => {
    const huntCoords = hunt.hunt_coordinates as { lat: number; lng: number };
    const distance = haversineDistance(loadCoords.lat, loadCoords.lng, huntCoords.lat, huntCoords.lng);
    return distance <= REGIONAL_RADIUS;
  });
  
  if (!isInAnyRegion) {
    console.log(`⏭️ Load ${loadId} skipped - not within ${REGIONAL_RADIUS}mi of any hunt region`);
    return;
  }

  // Load passed pre-filter, now check individual hunts
  let matchesCreated = 0;
  for (const hunt of enabledHunts) {
    if (hunt.floor_load_id && loadId <= hunt.floor_load_id) continue;

    const huntCoords = hunt.hunt_coordinates as { lat: number; lng: number } | null;
    if (!huntCoords?.lat || !huntCoords?.lng) continue;

    const distance = haversineDistance(loadCoords.lat, loadCoords.lng, huntCoords.lat, huntCoords.lng);
    if (distance > parseFloat(hunt.pickup_radius || '200')) continue;

    let huntVehicleSizes: string[] = [];
    if (hunt.vehicle_size) {
      try {
        const parsed = JSON.parse(hunt.vehicle_size);
        huntVehicleSizes = Array.isArray(parsed) ? parsed : [hunt.vehicle_size];
      } catch {
        huntVehicleSizes = [hunt.vehicle_size];
      }
    }

    if (huntVehicleSizes.length > 0 && loadVehicleType) {
      const loadTypeNormalized = loadVehicleType.toLowerCase().replace(/[^a-z-]/g, '');
      const vehicleMatches = huntVehicleSizes.some(huntSize => {
        const huntNormalized = huntSize.toLowerCase().replace(/[^a-z-]/g, '');
        return loadTypeNormalized === huntNormalized ||
          loadTypeNormalized.includes(huntNormalized) || 
          huntNormalized.includes(loadTypeNormalized) ||
          (loadTypeNormalized.includes('tractor') && huntNormalized.includes('tractor'));
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
      tenant_id: effectiveTenantId, // Include tenant_id for multi-tenant isolation
    });
    matchesCreated++;
  }
  
  if (matchesCreated > 0) {
    console.log(`🎯 Smart match: ${loadId} -> ${matchesCreated} hunt(s) created`);
  }
}

async function ensureCustomerExists(parsedData: any, tenantId: string): Promise<void> {
  // Use broker_company as the customer name (broker company is the customer)
  const customerName = parsedData?.broker_company || parsedData?.customer;
  
  // Skip invalid customer names
  if (!customerName || 
      customerName === '- Alliance Posted Load' || 
      customerName.includes('Name: </strong>') ||
      customerName.trim() === '') {
    return;
  }

  try {
    // CRITICAL: Check if customer already exists FOR THIS TENANT (case-insensitive)
    const { data: existing, error: checkError } = await supabase
      .from('customers')
      .select('id')
      .eq('tenant_id', tenantId) // TENANT SCOPING
      .ilike('name', customerName.trim())
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking customer:', checkError);
      return;
    }

    // If customer doesn't exist for this tenant, create it
    if (!existing) {
      const { error: insertError } = await supabase
        .from('customers')
        .insert({
          name: customerName.trim(),
          contact_name: parsedData?.broker_name || null,
          email: parsedData?.broker_email || null,
          phone: parsedData?.broker_phone || null,
          status: 'active',
          notes: 'Auto-imported from load email',
          tenant_id: tenantId, // CRITICAL: Include tenant_id
        });

      if (insertError) {
        console.error('Error creating customer:', insertError);
      } else {
        console.log(`Created new customer: ${customerName} for tenant ${tenantId}`);
      }
    }
  } catch (error) {
    console.error('Error in ensureCustomerExists:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const gmailUserEmail = 'p.d@talbilogistics.com';
    console.log('Fetching Gmail emails...');

    // CRITICAL: Get tenant context first - NO FALLBACK ALLOWED
    const tenantResult = await getEffectiveTenantId(gmailUserEmail);
    if (!tenantResult.tenantId) {
      console.error(`[fetch-gmail-loads] ABORTING: ${tenantResult.error}`);
      
      // Log this failed attempt for audit (fire and forget)
      try {
        await supabase.from('audit_logs').insert({
          action: 'gmail_fetch_no_tenant',
          entity_type: 'gmail_tokens',
          entity_id: gmailUserEmail,
          notes: tenantResult.error,
          tenant_id: '00000000-0000-0000-0000-000000000000', // Placeholder for system audit
        });
      } catch (auditError) {
        console.warn('[fetch-gmail-loads] Could not log audit event:', auditError);
      }
      
      return new Response(
        JSON.stringify({ 
          error: 'No tenant context available', 
          details: tenantResult.error,
          action_required: 'Configure tenant_id in gmail_tokens table or set up tenant_integrations with matching gmail email'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    effectiveTenantId = tenantResult.tenantId;
    
    // DEBUG: Log tenant isolation context (no email bodies)
    console.log(`[TENANT-ISOLATION-DEBUG] gmail_user_email=${gmailUserEmail}, effectiveTenantId=${effectiveTenantId}`);

    // Get access token
    const accessToken = await getAccessToken(gmailUserEmail);
    console.log('Access token retrieved');

    // Fetch unread messages from inbox
    const messagesResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&q=is:unread&maxResults=50',
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    const messagesData = await messagesResponse.json();
    console.log(`Found ${messagesData.messages?.length || 0} unread messages`);

    if (!messagesData.messages || messagesData.messages.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No new emails found', count: 0, tenant_id: effectiveTenantId }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let processedCount = 0;

    // Process each message
    for (const message of messagesData.messages) {
      try {
        // Fetch full message details
        const messageResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );

        const fullMessage = await messageResponse.json();
        
        // Extract headers
        const headers = fullMessage.payload?.headers || [];
        const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from');
        const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject');
        const dateHeader = headers.find((h: any) => h.name.toLowerCase() === 'date');

        const fromEmail = fromHeader?.value || 'unknown@example.com';
        const fromName = fromEmail.split('<')[0].trim();
        const subject = subjectHeader?.value || '(No Subject)';
        const receivedDate = dateHeader?.value ? new Date(dateHeader.value) : new Date();

        // Extract body (decode base64 as UTF-8)
        let bodyText = '';

        const decodeBase64Utf8 = (data: string) => {
          const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
          const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
          return new TextDecoder('utf-8').decode(bytes);
        };

        if (fullMessage.payload?.body?.data) {
          bodyText = decodeBase64Utf8(fullMessage.payload.body.data);
        } else if (fullMessage.payload?.parts) {
          for (const part of fullMessage.payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              bodyText += decodeBase64Utf8(part.body.data);
            }
          }
        }

        // Detect email source and parse accordingly
        const emailSource = isFullCircleEmail(fromEmail, subject, bodyText) ? 'fullcircle' : 'sylectus';
        console.log(`📧 Email source detected: ${emailSource} for: ${subject.substring(0, 60)}...`);
        
        // Parse load data using appropriate parser
        const parsedData = emailSource === 'fullcircle' 
          ? parseFullCircleTMSEmail(subject, bodyText)
          : parseLoadEmail(subject, bodyText);

        // Geocode if we have origin location
        let geocodingErrorCode: string | null = null;
        let geocodingWasAttempted = false;
        
        if (parsedData.origin_city && parsedData.origin_state) {
          geocodingWasAttempted = true;
          console.log('GEOCODE_VERSION=v2');
          const geocodeResult = await geocodeLocation(parsedData.origin_city, parsedData.origin_state);
          if (geocodeResult.coords) {
            parsedData.pickup_coordinates = geocodeResult.coords;
            console.log(`📍 Geocoded ${parsedData.origin_city}, ${parsedData.origin_state}`);
          } else {
            geocodingErrorCode = geocodeResult.errorCode;
          }
        } else {
          // No city/state to geocode - not a failure, just pending
          geocodingErrorCode = 'missing_input';
        }

        // Check and create customer if needed (with tenant context)
        if (effectiveTenantId) {
          await ensureCustomerExists(parsedData, effectiveTenantId);
        }

        // Check if email already exists
        const { data: existing } = await supabase
          .from('load_emails')
          .select('id, load_id, received_at, load_content_fingerprint, parsed_data')
          .eq('email_id', fullMessage.id)
          .maybeSingle();

        if (existing) {
          // ============================================================================
          // NOTE: Re-triggering for existing emails is NOT possible via this code path.
          // existingMatch(load_email_id, hunt_plan_id) will ALWAYS block because this
          // email already has matches for all applicable hunt plans.
          // 
          // Re-trigger ONLY occurs when:
          //   1. A NEW email ID arrives with the SAME load_content_fingerprint
          //   2. The new email's received_at is >= 60 seconds after last_received_at
          //   3. The cooldown RPC (should_trigger_hunt_for_fingerprint) returns true
          //
          // This is by design: deduplication is content-based, but action triggering
          // is per-email with cooldown gating.
          // ============================================================================
          console.log(`ℹ️ Existing email ${existing.load_id} (email_id=${fullMessage.id}) - skipping, re-trigger only on NEW email IDs`);
        } else {
          // ====================================================================
          // FINGERPRINT + LOAD_CONTENT INSERT/UPDATE
          // Provider is REQUIRED to prevent cross-provider dedup
          // If emailSource is null/unknown → skip fingerprinting entirely
          // ====================================================================
          
          let parsedLoadFingerprint: string | null = null;
          let loadContentFingerprint: string | null = null;
          let dedupEligible = false;
          let dedupEligibleReason: string | null = 'provider_unknown';
          
          // REQUIRED: emailSource must be known for fingerprinting
          if (emailSource && (emailSource === 'fullcircle' || emailSource === 'sylectus')) {
            const fingerprintResult = await computeParsedLoadFingerprint(parsedData, emailSource);
            parsedLoadFingerprint = fingerprintResult.fingerprint;
            dedupEligible = fingerprintResult.dedupEligible;
            dedupEligibleReason = fingerprintResult.dedupEligibleReason;
            const canonicalPayload = fingerprintResult.canonicalPayload;
            
            console.log(`🔑 Fingerprint: ${parsedLoadFingerprint.substring(0, 12)}... | Provider: ${emailSource} | Dedup eligible: ${dedupEligible}${dedupEligibleReason ? ` (${dedupEligibleReason})` : ''}`);
            
            if (dedupEligible && parsedLoadFingerprint) {
              const canonicalPayloadJson = JSON.stringify(canonicalPayload);
              const sizeBytes = new TextEncoder().encode(canonicalPayloadJson).length;
              
              // Step A: Try INSERT first (new row)
              const { error: lcInsertError } = await supabase
                .from('load_content')
                .insert({
                  fingerprint: parsedLoadFingerprint,
                  canonical_payload: canonicalPayload,
                  first_seen_at: new Date().toISOString(),
                  last_seen_at: new Date().toISOString(),
                  receipt_count: 1,
                  provider: emailSource,
                  fingerprint_version: FINGERPRINT_VERSION,
                  size_bytes: sizeBytes,
                });
              
              if (lcInsertError) {
                // Check if it's a unique violation (conflict)
                const isConflict = lcInsertError.code === '23505' || 
                                   lcInsertError.message?.includes('duplicate key') ||
                                   lcInsertError.message?.includes('already exists');
                
                if (isConflict) {
                  // Step B: Conflict - UPDATE existing row via RPC (atomic increment)
                  const { error: rpcError } = await supabase.rpc('increment_load_content_receipt_count', { 
                    p_fingerprint: parsedLoadFingerprint 
                  });
                  
                  if (rpcError) {
                    console.warn(`⚠️ load_content increment RPC failed: ${rpcError.message}`);
                  } else {
                    loadContentFingerprint = parsedLoadFingerprint;
                    console.log(`📦 load_content updated (existing): ${parsedLoadFingerprint.substring(0, 12)}...`);
                  }
                } else {
                  // Not a conflict - log the actual error
                  console.warn(`⚠️ load_content insert failed: ${lcInsertError.message}`);
                }
              } else {
                // Step C: INSERT succeeded
                loadContentFingerprint = parsedLoadFingerprint;
                console.log(`📦 load_content inserted: ${parsedLoadFingerprint.substring(0, 12)}... (${sizeBytes} bytes)`);
              }
            } else {
              console.log(`⚠️ Skipping load_content: ${dedupEligibleReason}`);
            }
          } else {
            console.log(`⚠️ Skipping fingerprint: emailSource is null or unknown`);
          }
          
          // Determine geocoding status:
          // - 'success' = geocoding was attempted AND returned coords
          // - 'failed' = geocoding was attempted AND failed (with error code)
          // - 'pending' = geocoding was NOT attempted (missing inputs)
          const hasCoordinates = parsedData.pickup_coordinates?.lat && parsedData.pickup_coordinates?.lng;
          const geocodingStatus = hasCoordinates 
            ? 'success' 
            : (geocodingWasAttempted ? 'failed' : 'pending');
          
          // CRITICAL: Insert with tenant_id for proper scoping
          const { data: inserted, error: insertError } = await supabase
            .from('load_emails')
            .insert({
              email_id: fullMessage.id,
              thread_id: fullMessage.threadId,
              from_email: fromEmail,
              from_name: fromName,
              subject: subject,
              body_html: bodyText,
              body_text: bodyText.substring(0, 5000),
              received_at: receivedDate.toISOString(),
              parsed_data: parsedData,
              expires_at: parsedData.expires_at || null,
              status: 'new',
              email_source: emailSource,
              tenant_id: effectiveTenantId,
              // Fingerprint fields (null-safe)
              parsed_load_fingerprint: parsedLoadFingerprint,
              load_content_fingerprint: loadContentFingerprint,
              dedup_eligible: dedupEligible,
              // Attribution & geocoding tracking
              ingestion_source: 'fetch-gmail-loads',
              geocoding_status: geocodingStatus,
              geocoding_error_code: geocodingErrorCode,
            })
            .select('id, load_id')
            .single();

          if (insertError) {
            console.error('Error inserting email:', insertError);
          } else {
            processedCount++;
            console.log(`Processed email for tenant ${effectiveTenantId}: ${subject}`);
            
            // Run hunt matching if we have coordinates and vehicle type
            // FAIL-CLOSED: Require fingerprint + receivedAt + tenantId for cooldown gating
            if (inserted && parsedData.pickup_coordinates && parsedData.vehicle_type) {
              const hasFp = loadContentFingerprint && loadContentFingerprint.trim() !== '';
              const hasReceivedAt = !!receivedDate;
              const hasTenant = !!effectiveTenantId;
              
              if (!hasFp || !hasReceivedAt || !hasTenant) {
                const missing = [
                  !hasFp ? 'fingerprint' : null,
                  !hasReceivedAt ? 'receivedAt' : null,
                  !hasTenant ? 'tenant' : null,
                ].filter(Boolean).join('|');
                console.log(`[hunt-cooldown] suppressed_missing_gate_data tenant=${effectiveTenantId || 'null'} load_email_id=${inserted.id} missing=${missing}`);
              } else {
                matchLoadToHunts(
                  inserted.id, 
                  inserted.load_id, 
                  parsedData,
                  effectiveTenantId,
                  loadContentFingerprint,
                  receivedDate
                ).catch(e => 
                  console.error('Hunt matching error:', e)
                );
              }
            }
          }
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    }

    // DEBUG: Log final count for tenant isolation verification
    console.log(`[TENANT-ISOLATION-DEBUG] gmail_user_email=${gmailUserEmail}, effectiveTenantId=${effectiveTenantId}, inserted_load_emails_count=${processedCount}`);

    return new Response(
      JSON.stringify({ 
        message: 'Emails fetched successfully', 
        count: processedCount,
        tenant_id: effectiveTenantId,
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error in fetch-gmail-loads:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
