import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

export interface TenantAccessResult {
  allowed: boolean;
  tenant_id?: string;
  user_id?: string;
  is_platform_admin?: boolean;
  reason?: string;
  response?: Response;
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

/**
 * Assert that the caller has access to the specified tenant.
 * 
 * CRITICAL: This validates the JWT from the Authorization header using an anon-key client,
 * then verifies the user has membership in the target tenant before allowing access.
 * 
 * This MUST be called at the top of any edge function that accepts tenant_id.
 * Only AFTER this check passes should you create a service-role client for privileged operations.
 * 
 * @param authHeader - The Authorization header from the request
 * @param targetTenantId - The tenant_id the caller wants to access
 * @returns TenantAccessResult with allowed=true if access is granted
 */
export async function assertTenantAccess(
  authHeader: string | null,
  targetTenantId: string | null | undefined
): Promise<TenantAccessResult> {
  try {
    // Validate auth header exists
    if (!authHeader) {
      console.log('[assertTenantAccess] Missing authorization header');
      return {
        allowed: false,
        reason: 'missing_auth',
        response: new Response(
          JSON.stringify({ error: 'Unauthorized', reason: 'missing_auth' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        ),
      };
    }

    // Validate tenant_id was provided
    if (!targetTenantId) {
      console.log('[assertTenantAccess] Missing tenant_id');
      return {
        allowed: false,
        reason: 'missing_tenant_id',
        response: new Response(
          JSON.stringify({ error: 'Bad Request', reason: 'missing_tenant_id' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        ),
      };
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
      console.error('[assertTenantAccess] Missing Supabase environment variables');
      return {
        allowed: false,
        reason: 'config_error',
        response: new Response(
          JSON.stringify({ error: 'Configuration error', reason: 'config_error' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        ),
      };
    }

    // Step 1: Verify user identity using getClaims (preferred for signing-keys)
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const token = authHeader.replace('Bearer ', '');
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
    
    if (claimsError || !claimsData?.claims?.sub) {
      console.log('[assertTenantAccess] User auth failed:', claimsError?.message || 'missing sub claim');
      return {
        allowed: false,
        reason: 'auth_failed',
        response: new Response(
          JSON.stringify({ error: 'Unauthorized', reason: 'auth_failed' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        ),
      };
    }
    
    const userId = claimsData.claims.sub as string;

    // Step 2: Use service role ONLY for privileged lookups (membership check)
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user is platform admin
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', userId)
      .maybeSingle();

    if (profileError) {
      console.warn('[assertTenantAccess] Profile lookup error:', profileError.message);
    }

    const isPlatformAdmin = profile?.is_platform_admin === true;

    // Platform admins can access any tenant
    if (isPlatformAdmin) {
      console.log(`[assertTenantAccess] Platform admin ${userId} granted access to tenant ${targetTenantId}`);
      return {
        allowed: true,
        tenant_id: targetTenantId,
        user_id: userId,
        is_platform_admin: true,
      };
    }

    // Step 3: Verify user has active membership in the target tenant
    const { data: membership, error: membershipError } = await serviceClient
      .from('tenant_users')
      .select('id, role')
      .eq('user_id', userId)
      .eq('tenant_id', targetTenantId)
      .eq('is_active', true)
      .maybeSingle();

    if (membershipError) {
      console.warn('[assertTenantAccess] Membership lookup error:', membershipError.message);
    }

    if (!membership) {
      console.log(`[assertTenantAccess] User ${userId} has no membership in tenant ${targetTenantId}`);
      return {
        allowed: false,
        reason: 'no_tenant_access',
        user_id: userId,
        response: new Response(
          JSON.stringify({ error: 'Forbidden', reason: 'no_tenant_access', tenant_id: targetTenantId }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        ),
      };
    }

    console.log(`[assertTenantAccess] User ${userId} granted access to tenant ${targetTenantId} (role: ${membership.role})`);
    return {
      allowed: true,
      tenant_id: targetTenantId,
      user_id: userId,
      is_platform_admin: false,
    };

  } catch (err) {
    console.error('[assertTenantAccess] Unexpected error:', err);
    return {
      allowed: false,
      reason: 'internal_error',
      response: new Response(
        JSON.stringify({ error: 'Internal error', reason: 'internal_error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      ),
    };
  }
}

/**
 * Helper to get a service role client AFTER access has been verified.
 * Only call this after assertTenantAccess returns allowed=true.
 */
export function getServiceClient() {
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  return createClient(supabaseUrl, supabaseServiceKey);
}

/**
 * Derive the effective tenant_id from JWT when not provided in request body.
 * Returns the user's first active tenant membership.
 * 
 * Use this before assertTenantAccess when tenant_id is optional in request.
 */
export async function deriveTenantFromJWT(
  authHeader: string | null
): Promise<{ tenant_id: string | null; user_id: string | null; error?: Response }> {
  if (!authHeader) {
    return {
      tenant_id: null,
      user_id: null,
      error: new Response(
        JSON.stringify({ error: 'Unauthorized', reason: 'missing_auth' }),
        { status: 401, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } }
      ),
    };
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY');
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

  if (!supabaseUrl || !supabaseAnonKey || !supabaseServiceKey) {
    return {
      tenant_id: null,
      user_id: null,
      error: new Response(
        JSON.stringify({ error: 'Configuration error' }),
        { status: 500, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } }
      ),
    };
  }

  // Verify user identity using getClaims
  const userClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } }
  });

  const token = authHeader.replace('Bearer ', '');
  const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);
  
  if (claimsError || !claimsData?.claims?.sub) {
    return {
      tenant_id: null,
      user_id: null,
      error: new Response(
        JSON.stringify({ error: 'Unauthorized', reason: 'auth_failed' }),
        { status: 401, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'application/json' } }
      ),
    };
  }
  
  const userId = claimsData.claims.sub as string;

  // Use service role to find user's first active tenant
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
  const { data: membership } = await serviceClient
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', userId)
    .eq('is_active', true)
    .limit(1)
    .maybeSingle();

  return {
    tenant_id: membership?.tenant_id || null,
    user_id: userId,
  };
}
