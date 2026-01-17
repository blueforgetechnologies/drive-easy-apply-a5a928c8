import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Auth check - require valid JWT
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const jwt = authHeader.replace(/^Bearer\s+/i, '');
    const { data: userData, error: userError } = await supabase.auth.getUser(jwt);
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Invalid session' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if user is platform admin
    const { data: tenantUser } = await supabase
      .from('tenant_users')
      .select('role')
      .eq('user_id', userData.user.id)
      .eq('is_active', true)
      .maybeSingle();

    const isPlatformAdmin = tenantUser?.role === 'platform_admin';

    // Parse request body
    let errorFilter = 'mimeType';
    let tenantId: string | null = null;
    let limit = 100;

    try {
      const body = await req.json();
      errorFilter = body.error_filter || 'mimeType';
      tenantId = body.tenant_id || null;
      limit = Math.min(Math.max(body.limit || 100, 1), 500);
    } catch {
      // ignore
    }

    console.log(`[retry-failed] Starting retry: error_filter=${errorFilter}, tenant_id=${tenantId}, limit=${limit}`);

    // Build query for failed emails
    let query = supabase
      .from('email_queue')
      .select('id, gmail_message_id, tenant_id, last_error, attempts, payload_url')
      .eq('status', 'failed')
      .not('payload_url', 'is', null);

    if (errorFilter) {
      query = query.ilike('last_error', `%${errorFilter}%`);
    }

    if (tenantId) {
      query = query.eq('tenant_id', tenantId);
    }

    query = query.order('queued_at', { ascending: false }).limit(limit);

    const { data: failedEmails, error: fetchError } = await query;

    if (fetchError) {
      console.error('[retry-failed] Error fetching failed emails:', fetchError);
      throw fetchError;
    }

    if (!failedEmails || failedEmails.length === 0) {
      console.log('[retry-failed] No failed emails found matching criteria');
      return new Response(JSON.stringify({ 
        message: 'No failed emails found matching criteria',
        reset_count: 0 
      }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[retry-failed] Found ${failedEmails.length} failed emails to reset`);

    // If not platform admin, verify tenant access for each email
    if (!isPlatformAdmin) {
      const { data: userTenants } = await supabase
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', userData.user.id)
        .eq('is_active', true);

      const allowedTenantIds = new Set((userTenants || []).map(t => t.tenant_id));
      const filteredEmails = failedEmails.filter(e => allowedTenantIds.has(e.tenant_id));
      
      if (filteredEmails.length !== failedEmails.length) {
        console.log(`[retry-failed] Filtered from ${failedEmails.length} to ${filteredEmails.length} based on tenant access`);
      }
      
      if (filteredEmails.length === 0) {
        return new Response(JSON.stringify({ 
          error: 'No accessible failed emails found',
          reset_count: 0 
        }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    }

    // Reset failed emails to pending status
    const emailIds = failedEmails.map(e => e.id);
    
    const { error: updateError, count } = await supabase
      .from('email_queue')
      .update({
        status: 'pending',
        last_error: null,
        attempts: 0,
        processing_started_at: null,
        processed_at: null,
      })
      .in('id', emailIds);

    if (updateError) {
      console.error('[retry-failed] Error resetting emails:', updateError);
      throw updateError;
    }

    console.log(`[retry-failed] Successfully reset ${emailIds.length} emails to pending status`);

    return new Response(JSON.stringify({
      message: 'Successfully reset failed emails for retry',
      reset_count: emailIds.length,
      email_ids: emailIds,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[retry-failed] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
