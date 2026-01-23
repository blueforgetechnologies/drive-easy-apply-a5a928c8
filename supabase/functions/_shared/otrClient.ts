// Shared OTR Solutions API client
// Used by check-broker-credit and submit-otr-invoice

// =============================================================================
// CONFIGURATION
// =============================================================================

// STAGING URL - only use production after approval
// Note: Root URL may 404; only full endpoints work
export const OTR_API_BASE_URL = 'https://servicesstg.otrsolutions.com/carrier-tms/2';
// Production URL (DO NOT USE until approved): 'https://services.otrsolutions.com/carrier-tms/2'

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
 * Check if token-based OAuth is enabled via environment
 * Default: false (subscription-key-only mode)
 */
export function isTokenAuthEnabled(): boolean {
  const flag = Deno.env.get('OTR_USE_TOKEN_AUTH');
  return flag === 'true' || flag === '1';
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
// TOKEN AUTH (disabled by default, toggle with OTR_USE_TOKEN_AUTH=true)
// =============================================================================

/**
 * Get OAuth token from OTR Solutions (only used if OTR_USE_TOKEN_AUTH=true)
 * This is kept for future use if OTR requires token-based auth
 */
export async function getOtrToken(
  subscriptionKey: string, 
  username: string, 
  password: string
): Promise<{
  success: boolean;
  access_token?: string;
  error?: string;
}> {
  try {
    console.log(`[otr-client] Token auth: Authenticating with OTR (key: ${maskSubscriptionKey(subscriptionKey)})`);
    
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    
    const tokenUrl = `${OTR_API_BASE_URL}/auth/token`;
    console.log(`[otr-client] Token auth: POST ${tokenUrl}`);
    
    const response = await fetch(tokenUrl, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'ocp-apim-subscription-key': subscriptionKey,
      },
      body: formData.toString()
    });
    
    console.log(`[otr-client] Token auth response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[otr-client] Token auth error: ${response.status} - ${errorText}`);
      return { success: false, error: `Authentication failed: ${response.status}` };
    }
    
    const data: OtrTokenResponse = await response.json();
    console.log('[otr-client] Token auth successful');
    
    return {
      success: true,
      access_token: data.access_token
    };
  } catch (error) {
    console.error('[otr-client] Token auth error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Authentication failed'
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
