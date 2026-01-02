import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DeriveTenantResult {
  tenant_id: string | null;
  user_id: string | null;
  error?: Response;
}

/**
 * Derives tenant_id from JWT when not provided in request.
 * Uses anon client for auth validation, service-role only for tenant lookup.
 */
export async function deriveTenantFromJWT(authHeader: string | null): Promise<DeriveTenantResult> {
  if (!authHeader) {
    return {
      tenant_id: null,
      user_id: null,
      error: new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Step 1: Use anon client with auth header to validate JWT and get user
  const anonClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const { data: { user }, error: userError } = await anonClient.auth.getUser();

  if (userError || !user) {
    console.error('[deriveTenantFromJWT] Auth error:', userError?.message);
    return {
      tenant_id: null,
      user_id: null,
      error: new Response(
        JSON.stringify({ error: 'Invalid or expired token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    };
  }

  // Step 2: Use service-role ONLY to lookup first active tenant membership
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

  const { data: membership, error: membershipError } = await serviceClient
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  if (membershipError) {
    console.error('[deriveTenantFromJWT] Membership lookup error:', membershipError.message);
    return {
      tenant_id: null,
      user_id: user.id,
      error: new Response(
        JSON.stringify({ error: 'Failed to lookup tenant membership' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    };
  }

  // Return tenant_id (may be null if user has no active membership)
  return {
    tenant_id: membership?.tenant_id || null,
    user_id: user.id
  };
}
