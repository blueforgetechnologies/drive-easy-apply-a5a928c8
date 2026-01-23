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
    
    const responseText = await response.text();
    let responseBody: unknown;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }
    
    console.log(`[otr-test] Response status: ${response.status}`);
    console.log(`[otr-test] Response body:`, JSON.stringify(responseBody, null, 2));
    
    return {
      success: response.ok,
      request_url: requestUrl,
      response_status: response.status,
      response_body: responseBody,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    console.error(`[otr-test] Error:`, error);
    return {
      success: false,
      request_url: requestUrl,
      response_status: 0,
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
  payload: {
    BrokerMC: number;
    ClientDOT: string;
    FromCity: string;
    FromState: string;
    ToCity: string;
    ToState: string;
    PoNumber: string;
    InvoiceNo: string;
    InvoiceDate: string;
    InvoiceAmount: number;
  }
): Promise<{
  success: boolean;
  request_url: string;
  request_payload: unknown;
  response_status: number;
  response_body: unknown;
  error?: string;
}> {
  const requestUrl = `${OTR_API_BASE_URL}/invoices`;
  
  console.log(`[otr-test] Testing invoice submission...`);
  console.log(`[otr-test] POST ${requestUrl}`);
  console.log(`[otr-test] Subscription key: ${maskSubscriptionKey(subscriptionKey)}`);
  console.log(`[otr-test] Payload:`, JSON.stringify(payload, null, 2));
  
  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: getOtrHeaders(subscriptionKey),
      body: JSON.stringify(payload),
    });
    
    const responseText = await response.text();
    let responseBody: unknown;
    try {
      responseBody = JSON.parse(responseText);
    } catch {
      responseBody = responseText;
    }
    
    console.log(`[otr-test] Response status: ${response.status}`);
    console.log(`[otr-test] Response body:`, JSON.stringify(responseBody, null, 2));
    
    return {
      success: response.ok,
      request_url: requestUrl,
      request_payload: payload,
      response_status: response.status,
      response_body: responseBody,
      error: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch (error) {
    console.error(`[otr-test] Error:`, error);
    return {
      success: false,
      request_url: requestUrl,
      request_payload: payload,
      response_status: 0,
      response_body: null,
      error: error instanceof Error ? error.message : 'Network error',
    };
  }
}
