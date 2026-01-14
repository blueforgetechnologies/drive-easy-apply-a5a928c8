import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface TenantCounts {
  tenant_id: string;
  tenant_name: string;
  email_queue_count: number;
  unroutable_emails_count: number;
  load_emails_count: number;
  matches_count: number;
  hunt_plans_count: number;
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseKey);

    // Verify user is platform admin
    const anonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: adminRole } = await serviceClient
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('role', 'admin')
      .maybeSingle();

    if (!adminRole) {
      return new Response(JSON.stringify({ error: 'Platform admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse query params
    const url = new URL(req.url);
    const hours = parseInt(url.searchParams.get('hours') || '24');
    const cutoffTime = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();

    console.log(`[isolation-check] Running tenant isolation check for last ${hours} hours (since ${cutoffTime})`);

    // Get all tenants
    const { data: tenants, error: tenantsError } = await serviceClient
      .from('tenants')
      .select('id, name, slug')
      .order('name');

    if (tenantsError) {
      throw new Error(`Failed to fetch tenants: ${tenantsError.message}`);
    }

    const results: TenantCounts[] = [];
    const crossTenantIssues: string[] = [];

    for (const tenant of tenants || []) {
      // Count email_queue entries for this tenant
      const { count: emailQueueCount } = await serviceClient
        .from('email_queue')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .gte('queued_at', cutoffTime);

      // Count unroutable_emails (quarantined) - these don't have tenant_id
      // We can't count by tenant, so we'll get the total

      // Count load_emails for this tenant
      const { count: loadEmailsCount } = await serviceClient
        .from('load_emails')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .gte('received_at', cutoffTime);

      // Count load_hunt_matches via hunt_plans for this tenant
      const { count: matchesCount } = await serviceClient
        .from('load_hunt_matches')
        .select('*, hunt_plans!inner(tenant_id)', { count: 'exact', head: true })
        .eq('hunt_plans.tenant_id', tenant.id)
        .gte('matched_at', cutoffTime);

      // Count active hunt_plans for this tenant
      const { count: huntPlansCount } = await serviceClient
        .from('hunt_plans')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .eq('enabled', true);

      results.push({
        tenant_id: tenant.id,
        tenant_name: tenant.name,
        email_queue_count: emailQueueCount || 0,
        unroutable_emails_count: 0, // Will be set below for aggregate
        load_emails_count: loadEmailsCount || 0,
        matches_count: matchesCount || 0,
        hunt_plans_count: huntPlansCount || 0,
      });
    }

    // Get total quarantined emails (no tenant context)
    const { count: totalQuarantined } = await serviceClient
      .from('unroutable_emails')
      .select('*', { count: 'exact', head: true })
      .gte('received_at', cutoffTime);

    // Check for NULL tenant_id issues across key tables
    const nullTenantChecks = await Promise.all([
      serviceClient
        .from('email_queue')
        .select('id', { count: 'exact', head: true })
        .is('tenant_id', null)
        .gte('queued_at', cutoffTime),
      serviceClient
        .from('load_emails')
        .select('id', { count: 'exact', head: true })
        .is('tenant_id', null)
        .gte('received_at', cutoffTime),
      serviceClient
        .from('hunt_plans')
        .select('id', { count: 'exact', head: true })
        .is('tenant_id', null),
    ]);

    const nullTenantCounts = {
      email_queue_null: nullTenantChecks[0].count || 0,
      load_emails_null: nullTenantChecks[1].count || 0,
      hunt_plans_null: nullTenantChecks[2].count || 0,
    };

    if (nullTenantCounts.email_queue_null > 0) {
      crossTenantIssues.push(`${nullTenantCounts.email_queue_null} email_queue entries with NULL tenant_id`);
    }
    if (nullTenantCounts.load_emails_null > 0) {
      crossTenantIssues.push(`${nullTenantCounts.load_emails_null} load_emails with NULL tenant_id`);
    }
    if (nullTenantCounts.hunt_plans_null > 0) {
      crossTenantIssues.push(`${nullTenantCounts.hunt_plans_null} hunt_plans with NULL tenant_id`);
    }

    // Summary stats
    const summary = {
      time_window_hours: hours,
      cutoff_time: cutoffTime,
      total_tenants: results.length,
      total_routed_emails: results.reduce((sum, r) => sum + r.email_queue_count, 0),
      total_quarantined: totalQuarantined || 0,
      total_load_emails: results.reduce((sum, r) => sum + r.load_emails_count, 0),
      total_matches: results.reduce((sum, r) => sum + r.matches_count, 0),
      null_tenant_issues: nullTenantCounts,
      cross_tenant_issues: crossTenantIssues,
      isolation_status: crossTenantIssues.length === 0 ? 'PASS' : 'FAIL',
    };

    console.log('[isolation-check] Summary:', JSON.stringify(summary));

    return new Response(JSON.stringify({
      summary,
      by_tenant: results,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[isolation-check] Error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
