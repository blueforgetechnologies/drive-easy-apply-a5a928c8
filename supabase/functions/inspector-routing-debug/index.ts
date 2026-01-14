import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface RoutingDecision {
  gmail_message_id: string;
  received_at: string;
  extracted_alias: string | null;
  routing_method: string | null;
  delivered_to_header: string | null;
  resolved_tenant_id: string | null;
  resolved_tenant_name: string | null;
  outcome: 'routed' | 'quarantined' | 'rate_limited' | 'paused' | 'feature_disabled';
  failure_reason: string | null;
  from_email: string | null;
  subject: string | null;
}

interface RoutingStats {
  total_processed: number;
  routed: number;
  quarantined: number;
  by_tenant: Record<string, number>;
  by_routing_method: Record<string, number>;
  quarantine_reasons: Record<string, number>;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify platform admin access
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is platform admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_platform_admin) {
      return new Response(
        JSON.stringify({ error: 'Platform admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse query params
    const url = new URL(req.url);
    const hoursBack = parseInt(url.searchParams.get('hours') || '24');
    const tenantFilter = url.searchParams.get('tenant_id');
    const limit = Math.min(parseInt(url.searchParams.get('limit') || '100'), 500);

    const cutoff = new Date(Date.now() - hoursBack * 60 * 60 * 1000).toISOString();

    // ========================================================================
    // 1. ROUTED EMAILS - from email_queue (successfully routed)
    // ========================================================================
    let routedQuery = supabase
      .from('email_queue')
      .select(`
        id,
        gmail_message_id,
        queued_at,
        tenant_id,
        extracted_alias,
        routing_method,
        delivered_to_header,
        from_email,
        subject,
        tenants!inner(name)
      `)
      .gte('queued_at', cutoff)
      .order('queued_at', { ascending: false })
      .limit(limit);

    if (tenantFilter) {
      routedQuery = routedQuery.eq('tenant_id', tenantFilter);
    }

    const { data: routedEmails, error: routedError } = await routedQuery;
    if (routedError) {
      console.error('[inspector-routing-debug] Routed emails query error:', routedError);
    }

    // ========================================================================
    // 2. QUARANTINED EMAILS - from unroutable_emails
    // ========================================================================
    const { data: quarantinedEmails, error: quarantinedError } = await supabase
      .from('unroutable_emails')
      .select('*')
      .gte('received_at', cutoff)
      .order('received_at', { ascending: false })
      .limit(limit);

    if (quarantinedError) {
      console.error('[inspector-routing-debug] Quarantined emails query error:', quarantinedError);
    }

    // ========================================================================
    // 3. BUILD UNIFIED ROUTING DECISIONS LIST
    // ========================================================================
    const decisions: RoutingDecision[] = [];

    // Add routed emails
    if (routedEmails) {
      for (const email of routedEmails) {
        const tenantData = email.tenants as any;
        decisions.push({
          gmail_message_id: email.gmail_message_id,
          received_at: email.queued_at,
          extracted_alias: email.extracted_alias,
          routing_method: email.routing_method,
          delivered_to_header: email.delivered_to_header,
          resolved_tenant_id: email.tenant_id,
          resolved_tenant_name: tenantData?.name || null,
          outcome: 'routed',
          failure_reason: null,
          from_email: email.from_email,
          subject: email.subject,
        });
      }
    }

    // Add quarantined emails
    if (quarantinedEmails) {
      for (const email of quarantinedEmails) {
        decisions.push({
          gmail_message_id: email.gmail_message_id,
          received_at: email.received_at,
          extracted_alias: email.extracted_alias,
          routing_method: email.extraction_source,
          delivered_to_header: email.delivered_to_header,
          resolved_tenant_id: null,
          resolved_tenant_name: null,
          outcome: 'quarantined',
          failure_reason: email.failure_reason,
          from_email: email.from_header,
          subject: email.subject,
        });
      }
    }

    // Sort by received_at descending
    decisions.sort((a, b) => new Date(b.received_at).getTime() - new Date(a.received_at).getTime());

    // ========================================================================
    // 4. COMPUTE STATS
    // ========================================================================
    const stats: RoutingStats = {
      total_processed: decisions.length,
      routed: decisions.filter(d => d.outcome === 'routed').length,
      quarantined: decisions.filter(d => d.outcome === 'quarantined').length,
      by_tenant: {},
      by_routing_method: {},
      quarantine_reasons: {},
    };

    for (const decision of decisions) {
      // By tenant
      if (decision.resolved_tenant_name) {
        stats.by_tenant[decision.resolved_tenant_name] = (stats.by_tenant[decision.resolved_tenant_name] || 0) + 1;
      }

      // By routing method
      const method = decision.routing_method || 'unknown';
      stats.by_routing_method[method] = (stats.by_routing_method[method] || 0) + 1;

      // Quarantine reasons
      if (decision.outcome === 'quarantined' && decision.failure_reason) {
        const reason = decision.failure_reason.length > 60 
          ? decision.failure_reason.substring(0, 60) + '...'
          : decision.failure_reason;
        stats.quarantine_reasons[reason] = (stats.quarantine_reasons[reason] || 0) + 1;
      }
    }

    // ========================================================================
    // 5. GET TENANT INBOUND ADDRESSES FOR REFERENCE
    // ========================================================================
    const { data: inboundAddresses } = await supabase
      .from('tenant_inbound_addresses')
      .select(`
        email_address,
        is_active,
        tenant_id,
        tenants!inner(name)
      `)
      .order('created_at', { ascending: false });

    const addressMappings = (inboundAddresses || []).map((addr: any) => ({
      email_address: addr.email_address,
      is_active: addr.is_active,
      tenant_name: addr.tenants?.name,
    }));

    // ========================================================================
    // 6. GET TENANT GMAIL ALIASES FOR REFERENCE
    // ========================================================================
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id, name, gmail_alias, is_paused')
      .order('name');

    const aliasConfig = (tenants || []).map((t: any) => ({
      tenant_name: t.name,
      gmail_alias: t.gmail_alias,
      is_paused: t.is_paused,
    }));

    // ========================================================================
    // RESPONSE
    // ========================================================================
    console.log(`[inspector-routing-debug] Returned ${decisions.length} decisions (${stats.routed} routed, ${stats.quarantined} quarantined)`);

    return new Response(
      JSON.stringify({
        summary: {
          time_window_hours: hoursBack,
          total_emails: decisions.length,
          routed: stats.routed,
          quarantined: stats.quarantined,
        },
        emails: decisions.slice(0, limit),
        stats,
        config: {
          alias_mappings: aliasConfig,
          inbound_address_mappings: addressMappings,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[inspector-routing-debug] Error:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
