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

// Parse host info (safe to log)
const supabaseHost = new URL(SUPABASE_URL).hostname;
const supabaseProjectRef = supabaseHost.split('.')[0] || 'unknown';
const serviceRoleKeyLen = SUPABASE_SERVICE_ROLE_KEY.length;
const hasServiceRoleKey = serviceRoleKeyLen > 0;
const workerId = process.env.HOSTNAME || process.env.WORKER_ID || 'worker-unknown';

console.log(`[supabase] Initializing client`);
console.log(`[supabase]   workerId: ${workerId}`);
console.log(`[supabase]   supabaseHost: ${supabaseHost}`);
console.log(`[supabase]   supabaseProjectRef: ${supabaseProjectRef}`);
console.log(`[supabase]   serviceRoleKeyLen: ${serviceRoleKeyLen}`);
console.log(`[supabase]   hasServiceRoleKey: ${hasServiceRoleKey}`);

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

console.log(`[supabase] Client created`);

/**
 * Self-check: verify we can query the database with this client.
 * Retries every 10s until successful. Blocks startup until verified.
 */
export async function verifySelfCheck(): Promise<void> {
  const maxRetries = 60; // 10 minutes max
  let attempt = 0;
  
  while (attempt < maxRetries) {
    attempt++;
    console.log(`[supabase] Self-check attempt ${attempt}...`);
    
    try {
      const { count, error } = await supabase
        .from('email_queue')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      
      if (error) {
        const isAuthFailure = 
          error.code === '401' || 
          error.code === '403' || 
          (error as any).status === 401 ||
          (error as any).status === 403 ||
          error.message?.includes('UNAUTHENTICATED') ||
          error.message?.includes('Invalid API key') ||
          error.message?.includes('JWT');
        
        console.error(`[supabase] Self-check FAILED`, {
          message: error.message,
          code: error.code,
          details: error.details,
          hint: error.hint,
          status: (error as any).status,
        });
        
        if (isAuthFailure) {
          console.error(`[supabase] AUTH_FAILURE detected - check SUPABASE_SERVICE_ROLE_KEY env var`);
        }
      } else {
        console.log(`[supabase] Self-check PASSED - pending count: ${count}`);
        return; // Success!
      }
    } catch (err: any) {
      console.error(`[supabase] Self-check exception:`, {
        name: err?.name,
        message: err?.message,
        code: err?.code,
        status: err?.status,
      });
    }
    
    console.log(`[supabase] Retrying in 10s...`);
    await new Promise(r => setTimeout(r, 10000));
  }
  
  throw new Error('[supabase] Self-check failed after max retries - cannot proceed');
}

// Re-export for type usage
export type { SupabaseClient };
