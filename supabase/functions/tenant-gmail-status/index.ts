import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    // Create admin client to bypass RLS
    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    
    // Get request body
    const { tenantId, action, tokenId } = await req.json();
    
    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: 'tenantId is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get JWT to verify user has access to this tenant
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user auth
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseAuth = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid user session' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is platform admin via profiles table
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .maybeSingle();

    const isPlatformAdmin = profile?.is_platform_admin === true;

    // Check tenant membership via tenant_users table
    const { data: membership } = await supabaseAdmin
      .from('tenant_users')
      .select('id, role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenantId)
      .eq('is_active', true)
      .maybeSingle();

    const hasAccess = isPlatformAdmin || !!membership;

    if (!hasAccess) {
      return new Response(
        JSON.stringify({ error: 'Access denied to this tenant' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle disconnect action
    if (action === 'disconnect' && tokenId) {
      const { error: deleteError } = await supabaseAdmin
        .from('gmail_tokens')
        .delete()
        .eq('id', tokenId)
        .eq('tenant_id', tenantId); // Ensure token belongs to this tenant

      if (deleteError) {
        console.error('Error disconnecting Gmail:', deleteError);
        return new Response(
          JSON.stringify({ error: 'Failed to disconnect Gmail account' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[tenant-gmail-status] Disconnected tokenId=${tokenId} for tenantId=${tenantId}`);
      return new Response(
        JSON.stringify({ success: true, message: 'Gmail account disconnected' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Gmail tokens for this tenant (safe fields only - no actual tokens!)
    const { data: tokens, error: tokensError } = await supabaseAdmin
      .from('gmail_tokens')
      .select('id, user_email, tenant_id, token_expiry, updated_at, needs_reauth, reauth_reason')
      .eq('tenant_id', tenantId);

    if (tokensError) {
      console.error('Error fetching tokens:', tokensError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch Gmail status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get email source stats from load_emails
    const { data: emails, error: emailsError } = await supabaseAdmin
      .from('load_emails')
      .select('from_email, received_at')
      .eq('tenant_id', tenantId)
      .order('received_at', { ascending: false })
      .limit(500);

    let emailSourceStats: { from_email: string; count: number; last_email: string }[] = [];
    
    if (!emailsError && emails) {
      const statsMap = new Map<string, { count: number; last_email: string }>();
      
      for (const email of emails) {
        const key = email.from_email || 'unknown';
        const existing = statsMap.get(key);
        if (existing) {
          existing.count++;
        } else {
          statsMap.set(key, { 
            count: 1, 
            last_email: email.received_at 
          });
        }
      }

      emailSourceStats = Array.from(statsMap.entries())
        .map(([from_email, data]) => ({
          from_email,
          count: data.count,
          last_email: data.last_email
        }))
        .sort((a, b) => b.count - a.count);
    }

    console.log(`[tenant-gmail-status] tenantId=${tenantId}, tokens=${tokens?.length || 0}, emails=${emails?.length || 0}`);

    return new Response(
      JSON.stringify({
        connectedAccounts: tokens || [],
        emailSourceStats
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in tenant-gmail-status:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
