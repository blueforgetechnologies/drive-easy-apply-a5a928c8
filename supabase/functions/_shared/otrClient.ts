// Shared OTR Solutions API client
// Used by check-broker-credit and submit-otr-invoice

// STAGING URL ONLY - do not use production until approved
// Base URL: https://servicesstg.otrsolutions.com (staging)
// Production URL: https://services.otrsolutions.com (DO NOT USE until approved)
export const OTR_API_BASE_URL = 'https://servicesstg.otrsolutions.com/carrier-tms/2';

// OTR API credentials - only subscription key required per OTR clarification
// No OAuth flow needed for Carrier TMS endpoints
export interface OtrCredentials {
  subscriptionKey: string;
}

// Get OTR credentials from environment
// Header required: ocp-apim-subscription-key
export function getOtrCredentialsFromEnv(): OtrCredentials | null {
  const subscriptionKey = Deno.env.get('OTR_API_KEY');
  
  if (!subscriptionKey) return null;

  return { subscriptionKey };
}

// Decrypt credentials helper (for tenant-specific integrations)
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
