// Shared OTR Solutions API client
// Used by check-broker-credit and submit-otr-invoice

// =============================================================================
// CONFIGURATION
// =============================================================================

// PRODUCTION URL - switched from staging on 2026-01-31 as staging lacks broker data
// Note: Root URL may 404; only full endpoints work
export const OTR_API_BASE_URL = 'https://services.otrsolutions.com/carrier-tms/2';
// Staging URL (for testing): 'https://servicesstg.otrsolutions.com/carrier-tms/2'

// Endpoints (appended to BASE_URL):
// - GET  /broker-check/{brokerMc}
// - POST /invoices

// =============================================================================
// TYPES
// =============================================================================

export interface OtrCredentials {
  subscriptionKey: string;
  // Optional: for token-based auth if OTR_USE_TOKEN_AUTH=true
  username?: string;
  password?: string;
}

export interface OtrTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
}

export interface OtrInvoicePayload {
  BrokerMC: number;          // Broker MC number (numeric)
  ClientDOT: string;         // Your carrier DOT number (digits only)
  FromCity: string;          // Pickup city
  FromState: string;         // Pickup state (2-letter)
  ToCity: string;            // Delivery city
  ToState: string;           // Delivery state (2-letter)
  PoNumber: string;          // PO/Reference number (numeric-only string)
  InvoiceNo: string;         // Invoice number (numeric-only string)
  InvoiceDate: string;       // YYYY-MM-DD or YYYY-MM-DDT00:00:00Z
  InvoiceAmount: number;     // Invoice amount (> 0)
  
  // Optional fields
  TermPkey?: number;
  Weight?: number;
  Miles?: number;
  Notes?: string;
}

export interface PayloadValidationResult {
  valid: boolean;
  errors: string[];
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Mask subscription key for safe logging (show first 6-8 chars only)
 */
export function maskSubscriptionKey(key: string): string {
  if (!key || key.length < 8) return '***';
  return `${key.substring(0, 8)}...`;
}

/**
 * Check if ISO datetime format should be used for InvoiceDate
 * Default: false (YYYY-MM-DD format)
 * Set OTR_USE_ISO_DATE=true for YYYY-MM-DDT00:00:00Z format
 */
export function useIsoDateFormat(): boolean {
  const flag = Deno.env.get('OTR_USE_ISO_DATE');
  return flag === 'true' || flag === '1';
}

/**
 * Get standard headers for OTR API calls
 */
export function getOtrHeaders(subscriptionKey: string): Record<string, string> {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'ocp-apim-subscription-key': subscriptionKey,
  };
}

/**
 * Get headers with Bearer token (for token-auth mode)
 */
export function getOtrHeadersWithToken(subscriptionKey: string, accessToken: string): Record<string, string> {
  return {
    'Accept': 'application/json',
    'Content-Type': 'application/json',
    'ocp-apim-subscription-key': subscriptionKey,
    'Authorization': `Bearer ${accessToken}`,
  };
}

// =============================================================================
// PAYLOAD VALIDATION
// =============================================================================

/**
 * Validate OTR invoice payload before submission
 * Checks required fields exist and are correct type/format
 */
export function validateOtrPayload(payload: OtrInvoicePayload): PayloadValidationResult {
  const errors: string[] = [];

  // BrokerMC: must be a positive integer
  if (typeof payload.BrokerMC !== 'number' || !Number.isInteger(payload.BrokerMC) || payload.BrokerMC <= 0) {
    errors.push(`BrokerMC must be a positive integer, got: ${JSON.stringify(payload.BrokerMC)} (type: ${typeof payload.BrokerMC})`);
  }

  // ClientDOT: must be string with digits only
  if (typeof payload.ClientDOT !== 'string') {
    errors.push(`ClientDOT must be a string, got: ${typeof payload.ClientDOT}`);
  } else if (!/^\d+$/.test(payload.ClientDOT)) {
    errors.push(`ClientDOT must contain digits only, got: "${payload.ClientDOT}"`);
  }

  // FromCity/ToCity: must be non-empty strings
  if (typeof payload.FromCity !== 'string' || payload.FromCity.trim().length === 0) {
    errors.push(`FromCity must be a non-empty string, got: "${payload.FromCity}"`);
  }
  if (typeof payload.ToCity !== 'string' || payload.ToCity.trim().length === 0) {
    errors.push(`ToCity must be a non-empty string, got: "${payload.ToCity}"`);
  }

  // FromState/ToState: must be exactly 2 letters
  if (typeof payload.FromState !== 'string' || !/^[A-Z]{2}$/.test(payload.FromState)) {
    errors.push(`FromState must be exactly 2 uppercase letters, got: "${payload.FromState}"`);
  }
  if (typeof payload.ToState !== 'string' || !/^[A-Z]{2}$/.test(payload.ToState)) {
    errors.push(`ToState must be exactly 2 uppercase letters, got: "${payload.ToState}"`);
  }

  // PoNumber: must be numeric-only string
  if (typeof payload.PoNumber !== 'string') {
    errors.push(`PoNumber must be a string, got: ${typeof payload.PoNumber}`);
  } else if (!/^\d+$/.test(payload.PoNumber)) {
    errors.push(`PoNumber must be numeric-only (digits), got: "${payload.PoNumber}"`);
  }

  // InvoiceNo: must be numeric-only string
  if (typeof payload.InvoiceNo !== 'string') {
    errors.push(`InvoiceNo must be a string, got: ${typeof payload.InvoiceNo}`);
  } else if (!/^\d+$/.test(payload.InvoiceNo)) {
    errors.push(`InvoiceNo must be numeric-only (digits), got: "${payload.InvoiceNo}"`);
  }

  // InvoiceDate: must be YYYY-MM-DD or YYYY-MM-DDT00:00:00Z format
  if (typeof payload.InvoiceDate !== 'string') {
    errors.push(`InvoiceDate must be a string, got: ${typeof payload.InvoiceDate}`);
  } else {
    const datePattern = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}:\d{2}Z)?$/;
    if (!datePattern.test(payload.InvoiceDate)) {
      errors.push(`InvoiceDate must be YYYY-MM-DD or YYYY-MM-DDT00:00:00Z format, got: "${payload.InvoiceDate}"`);
    }
  }

  // InvoiceAmount: must be positive number
  if (typeof payload.InvoiceAmount !== 'number' || payload.InvoiceAmount <= 0) {
    errors.push(`InvoiceAmount must be a positive number, got: ${JSON.stringify(payload.InvoiceAmount)} (type: ${typeof payload.InvoiceAmount})`);
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

// =============================================================================
// CREDENTIALS
// =============================================================================

/**
 * Get OTR credentials from environment
 */
export function getOtrCredentialsFromEnv(): OtrCredentials | null {
  const subscriptionKey = Deno.env.get('OTR_API_KEY');
  
  if (!subscriptionKey) return null;

  // Include username/password if token auth might be needed
  const username = Deno.env.get('OTR_USERNAME');
  const password = Deno.env.get('OTR_PASSWORD');

  return { 
    subscriptionKey,
    username: username || undefined,
    password: password || undefined,
  };
}

// =============================================================================
// TOKEN AUTH (REQUIRED for invoice submission per OTR support confirmation)
// =============================================================================

interface OtrTokenResult {
  success: boolean;
  access_token?: string;
  attempt_id: string;
  error?: string;
  response_status?: number;
  response_body?: unknown;
  utc_time: string;
  eastern_time: string;
}

/**
 * Get timestamp info for logging
 */
function getTimestampInfo(): { utc_time: string; eastern_time: string; eastern_hour: number } {
  const now = new Date();
  const utc_time = now.toISOString();
  
  const easternFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  
  const parts = easternFormatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || "";
  const eastern_time = `${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart("minute")}:${getPart("second")} America/New_York`;
  const eastern_hour = parseInt(getPart("hour"), 10);
  
  return { utc_time, eastern_time, eastern_hour };
}

/**
 * Get OAuth token from OTR Solutions - REQUIRED for invoice submission
 * Per OTR support: All POST /invoices requests MUST include Bearer token
 */
export async function getOtrToken(
  subscriptionKey: string, 
  username: string, 
  password: string
): Promise<OtrTokenResult> {
  const attempt_id = crypto.randomUUID();
  const timestamps = getTimestampInfo();
  const tokenUrl = `${OTR_API_BASE_URL}/auth/token`;
  
  console.log('\n' + '='.repeat(70));
  console.log(`[OTR TOKEN - ATTEMPT ${attempt_id}]`);
  console.log('='.repeat(70));
  console.log(`[TIMESTAMP] UTC: ${timestamps.utc_time}`);
  console.log(`[TIMESTAMP] Eastern: ${timestamps.eastern_time}`);
  console.log(`[REQUEST] URL: ${tokenUrl}`);
  console.log(`[REQUEST] Subscription Key: ${maskSubscriptionKey(subscriptionKey)}`);
  console.log(`[REQUEST] Username: ${username ? username.substring(0, 3) + '***' : 'NOT SET'}`);
  console.log(`[REQUEST] Password: ${password ? '***SET***' : 'NOT SET'}`);
  
  try {
    // OTR uses simple username/password auth - no grant_type required
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'ocp-apim-subscription-key': subscriptionKey,
      },
      body: formData.toString()
    });
    
    const responseText = await response.text();
    let responseBody: unknown;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }
    
    console.log(`[RESPONSE] Status: ${response.status}`);
    console.log(`[RESPONSE] Body:`, JSON.stringify(responseBody, null, 2));
    console.log('='.repeat(70) + '\n');
    
    if (!response.ok) {
      console.error(`[OTR TOKEN ERROR]`, JSON.stringify({
        attempt_id,
        request_url: tokenUrl,
        status: response.status,
        response_body: responseBody,
        utc_time: timestamps.utc_time,
        eastern_time: timestamps.eastern_time,
      }, null, 2));
      
      return { 
        success: false, 
        attempt_id,
        error: `Token authentication failed: HTTP ${response.status}`,
        response_status: response.status,
        response_body: responseBody,
        utc_time: timestamps.utc_time,
        eastern_time: timestamps.eastern_time,
      };
    }
    
    const data = responseBody as OtrTokenResponse;
    console.log(`[OTR TOKEN SUCCESS] Token obtained (attempt: ${attempt_id})`);
    
    return {
      success: true,
      access_token: data.access_token,
      attempt_id,
      response_status: response.status,
      response_body: { token_type: data.token_type, expires_in: data.expires_in },
      utc_time: timestamps.utc_time,
      eastern_time: timestamps.eastern_time,
    };
  } catch (error) {
    console.error('[OTR TOKEN EXCEPTION]', JSON.stringify({
      attempt_id,
      request_url: tokenUrl,
      error: error instanceof Error ? error.message : String(error),
      utc_time: timestamps.utc_time,
      eastern_time: timestamps.eastern_time,
    }, null, 2));
    
    return { 
      success: false, 
      attempt_id,
      error: error instanceof Error ? error.message : 'Token authentication failed',
      utc_time: timestamps.utc_time,
      eastern_time: timestamps.eastern_time,
    };
  }
}

// =============================================================================
// CRYPTO HELPERS
// =============================================================================

/**
 * Decrypt credentials helper (for tenant-specific integrations)
 */
export async function decrypt(ciphertext: string, masterKey: string): Promise<string> {
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterKey.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    keyMaterial,
    data
  );
  
  return new TextDecoder().decode(decrypted);
}

// =============================================================================
// TEST HELPERS
// =============================================================================

/**
 * Test OTR API connectivity with a broker check
 * Returns detailed diagnostics for debugging
 */
export async function testOtrBrokerCheck(
  subscriptionKey: string,
  brokerMc: string
): Promise<{
  success: boolean;
  request_url: string;
  response_status: number;
  response_headers: Record<string, string>;
  response_body: unknown;
  error?: string;
}> {
  const cleanMc = brokerMc.replace(/^MC-?/i, '').trim();
  const requestUrl = `${OTR_API_BASE_URL}/broker-check/${cleanMc}`;
  
  console.log(`[otr-test] Testing broker check...`);
  console.log(`[otr-test] GET ${requestUrl}`);
  console.log(`[otr-test] Subscription key: ${maskSubscriptionKey(subscriptionKey)}`);
  
  try {
    const response = await fetch(requestUrl, {
      method: 'GET',
      headers: getOtrHeaders(subscriptionKey),
    });
    
    // Capture response headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    
    const responseText = await response.text();
    let responseBody: unknown;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }
    
    console.log(`[otr-test] Response status: ${response.status}`);
    console.log(`[otr-test] Response headers:`, JSON.stringify(responseHeaders, null, 2));
    console.log(`[otr-test] Response body:`, JSON.stringify(responseBody, null, 2));
    
    return {
      success: response.ok,
      request_url: requestUrl,
      response_status: response.status,
      response_headers: responseHeaders,
      response_body: responseBody,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    console.error(`[otr-test] Error:`, error);
    return {
      success: false,
      request_url: requestUrl,
      response_status: 0,
      response_headers: {},
      response_body: null,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}

/**
 * Test OTR API with a test invoice submission
 * Returns detailed diagnostics for debugging
 */
export async function testOtrInvoiceSubmit(
  subscriptionKey: string,
  payload: OtrInvoicePayload
): Promise<{
  success: boolean;
  validation: PayloadValidationResult;
  request_url: string;
  request_headers: Record<string, string>;
  request_payload: OtrInvoicePayload;
  response_status: number;
  response_headers: Record<string, string>;
  response_body: unknown;
  error?: string;
}> {
  const requestUrl = `${OTR_API_BASE_URL}/invoices`;
  const requestHeaders = getOtrHeaders(subscriptionKey);
  
  // Validate payload first
  const validation = validateOtrPayload(payload);
  
  console.log(`[otr-test] Testing invoice submission...`);
  console.log(`[otr-test] POST ${requestUrl}`);
  console.log(`[otr-test] Subscription key: ${maskSubscriptionKey(subscriptionKey)}`);
  console.log(`[otr-test] Request headers:`, JSON.stringify({
    ...requestHeaders,
    'ocp-apim-subscription-key': maskSubscriptionKey(subscriptionKey),
  }, null, 2));
  console.log(`[otr-test] Payload:`, JSON.stringify(payload, null, 2));
  console.log(`[otr-test] Payload validation:`, JSON.stringify(validation, null, 2));
  
  if (!validation.valid) {
    console.error(`[otr-test] Payload validation failed:`, validation.errors);
  }
  
  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: requestHeaders,
      body: JSON.stringify(payload),
    });
    
    // Capture response headers
    const responseHeaders: Record<string, string> = {};
    response.headers.forEach((value, key) => {
      responseHeaders[key] = value;
    });
    
    const responseText = await response.text();
    let responseBody: unknown;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }
    
    console.log(`[otr-test] Response status: ${response.status}`);
    console.log(`[otr-test] Response headers:`, JSON.stringify(responseHeaders, null, 2));
    console.log(`[otr-test] Response body:`, JSON.stringify(responseBody, null, 2));
    
    // Enhanced 400 error logging
    if (response.status === 400) {
      console.error(`[otr-test] ======== 400 ERROR DETAILS ========`);
      console.error(`[otr-test] Request URL: ${requestUrl}`);
      console.error(`[otr-test] Request Method: POST`);
      console.error(`[otr-test] Request Headers:`, JSON.stringify({
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'ocp-apim-subscription-key': maskSubscriptionKey(subscriptionKey),
      }, null, 2));
      console.error(`[otr-test] Request Payload:`, JSON.stringify(payload, null, 2));
      console.error(`[otr-test] Response Status: ${response.status}`);
      console.error(`[otr-test] Response Headers:`, JSON.stringify(responseHeaders, null, 2));
      console.error(`[otr-test] Response Body:`, JSON.stringify(responseBody, null, 2));
      console.error(`[otr-test] ====================================`);
    }
    
    return {
      success: response.ok,
      validation,
      request_url: requestUrl,
      request_headers: {
        ...requestHeaders,
        'ocp-apim-subscription-key': maskSubscriptionKey(subscriptionKey),
      },
      request_payload: payload,
      response_status: response.status,
      response_headers: responseHeaders,
      response_body: responseBody,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    console.error(`[otr-test] Error:`, error);
    return {
      success: false,
      validation,
      request_url: requestUrl,
      request_headers: {
        ...requestHeaders,
        'ocp-apim-subscription-key': maskSubscriptionKey(subscriptionKey),
      },
      request_payload: payload,
      response_status: 0,
      response_headers: {},
      response_body: null,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}
