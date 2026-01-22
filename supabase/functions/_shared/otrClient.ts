// Shared OTR Solutions API client
// Used by check-broker-credit and submit-otr-invoice

// Staging URL - switch to production after OTR approves test invoices
// OTR docs / portal currently reference the carrier staging host (servicescstg)
export const OTR_API_BASE_URL = 'https://servicescstg.otrsolutions.com/carrier-tms/2';
// Production URL (use after approval): 'https://services.otrsolutions.com/carrier-tms/2'

export interface OtrTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
}

export interface OtrCredentials {
  subscriptionKey: string;
  // Some OTR environments require username/password for token auth, others rely on subscription key only.
  username?: string;
  password?: string;
}

// Get OAuth token from OTR Solutions
export async function getOtrToken(
  subscriptionKey: string, 
  username: string, 
  password: string,
  baseUrl: string = OTR_API_BASE_URL
): Promise<{
  success: boolean;
  access_token?: string;
  error?: string;
}> {
  try {
    console.log('[otr-client] Authenticating with OTR...');
    
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    
    const response = await fetch(`${baseUrl}/auth/token`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'ocp-apim-subscription-key': subscriptionKey,
        // Staging expects test flag; production can ignore it.
        'x-is-test': 'true'
      },
      body: formData.toString()
    });
    
    console.log(`[otr-client] OTR auth response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[otr-client] OTR auth error: ${response.status} - ${errorText}`);
      return { success: false, error: `Authentication failed: ${response.status} - ${errorText}` };
    }
    
    const data: OtrTokenResponse = await response.json();
    console.log('[otr-client] OTR authentication successful');
    
    return {
      success: true,
      access_token: data.access_token
    };
  } catch (error) {
    console.error('[otr-client] OTR auth error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Authentication failed'
    };
  }
}

// Get OTR credentials from environment
export function getOtrCredentialsFromEnv(): OtrCredentials | null {
  const subscriptionKey = Deno.env.get('OTR_API_KEY');
  const username = Deno.env.get('OTR_USERNAME');
  const password = Deno.env.get('OTR_PASSWORD');
  
  if (!subscriptionKey) return null;

  // Username/password are optional: some OTR deployments may not require token auth.
  if (username && password) {
    return { subscriptionKey, username, password };
  }

  return { subscriptionKey };
}

// Decrypt credentials helper
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
