import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Environment validation
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL) {
  throw new Error('SUPABASE_URL environment variable is required');
}
if (!SUPABASE_SERVICE_ROLE_KEY) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY environment variable is required');
}

// Startup diagnostics - log masked credentials info
const urlHost = new URL(SUPABASE_URL).host;
const keyLength = SUPABASE_SERVICE_ROLE_KEY.length;
const keyPrefix = SUPABASE_SERVICE_ROLE_KEY.substring(0, 10);
const keySuffix = SUPABASE_SERVICE_ROLE_KEY.substring(keyLength - 4);

console.log(`[supabase] Initializing client`);
console.log(`[supabase]   URL Host: ${urlHost}`);
console.log(`[supabase]   Service Role Key Length: ${keyLength}`);
console.log(`[supabase]   Service Role Key: ${keyPrefix}...${keySuffix}`);

// Validate key looks like a JWT (should start with 'eyJ')
if (!SUPABASE_SERVICE_ROLE_KEY.startsWith('eyJ')) {
  console.error(`[supabase] WARNING: Service role key does not appear to be a valid JWT (should start with 'eyJ')`);
}

// Service role client for admin operations
export const supabase: SupabaseClient = createClient(
  SUPABASE_URL,
  SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  }
);

console.log(`[supabase] Client initialized successfully`);

// Re-export for type usage
export type { SupabaseClient };
