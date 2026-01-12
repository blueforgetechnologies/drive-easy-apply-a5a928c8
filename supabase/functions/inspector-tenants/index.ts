import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface TenantMetrics {
  tenant_id: string;
  tenant_name: string;
  status: string | null;
  release_channel: string | null;
  created_at: string;
  gmail_alias: string | null;
  last_email_received_at: string | null;
  email_health_status: 'healthy' | 'warning' | 'critical' | 'no_source';
  metrics: {
    users_count: number;
    drivers_count: number;
    active_vehicles_count: number;
    pending_vehicles_count: number;
    active_hunts_count: number;
  };
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Get the authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      console.log('Missing authorization header');
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify user identity using their JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.log('User auth failed:', userError?.message);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('User authenticated:', user.id);

    // Use service role client for privileged operations
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Check platform admin status via profiles.is_platform_admin
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single();

    if (profileError) {
      console.error('Error checking admin status:', profileError);
      return new Response(
        JSON.stringify({ error: 'Failed to verify admin status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!profile?.is_platform_admin) {
      console.log('Access denied - user is not platform admin');
      return new Response(
        JSON.stringify({ error: 'Forbidden - Platform admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Platform admin verified, fetching tenant data...');

    // Fetch tenants with email health fields
    const { data: tenants, error: tenantsError } = await serviceClient
      .from('tenants')
      .select('id, name, status, release_channel, created_at, gmail_alias, last_email_received_at')
      .order('created_at', { ascending: false });

    if (tenantsError) {
      console.error('Error fetching tenants:', tenantsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch tenants' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!tenants || tenants.length === 0) {
      return new Response(
        JSON.stringify({ tenants: [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch counts in parallel for efficiency (avoid N+1)
    // Vehicles: separate active vs pending counts for clarity
    const [usersResult, driversResult, activeVehiclesResult, pendingVehiclesResult, huntsResult] = await Promise.all([
      serviceClient.from('tenant_users').select('tenant_id').eq('is_active', true),
      serviceClient.from('dispatchers').select('tenant_id').not('tenant_id', 'is', null),
      serviceClient.from('vehicles').select('tenant_id').eq('status', 'active').not('tenant_id', 'is', null),
      serviceClient.from('vehicles').select('tenant_id').eq('status', 'pending').not('tenant_id', 'is', null),
      serviceClient.from('hunt_plans').select('tenant_id').eq('enabled', true).not('tenant_id', 'is', null),
    ]);

    // Build count maps from results
    const countByTenant = (data: { tenant_id: string }[] | null): Map<string, number> => {
      const map = new Map<string, number>();
      if (!data) return map;
      for (const row of data) {
        if (row.tenant_id) {
          map.set(row.tenant_id, (map.get(row.tenant_id) || 0) + 1);
        }
      }
      return map;
    };

    const userCounts = countByTenant(usersResult.data);
    const driverCounts = countByTenant(driversResult.data);
    const activeVehicleCounts = countByTenant(activeVehiclesResult.data);
    const pendingVehicleCounts = countByTenant(pendingVehiclesResult.data);
    const huntCounts = countByTenant(huntsResult.data);

    // Calculate email health status for each tenant
    const now = new Date();
    const getEmailHealthStatus = (tenant: { gmail_alias: string | null; last_email_received_at: string | null }): 'healthy' | 'warning' | 'critical' | 'no_source' => {
      if (!tenant.gmail_alias) {
        return 'no_source';
      }
      if (!tenant.last_email_received_at) {
        return 'critical';
      }
      const lastEmail = new Date(tenant.last_email_received_at);
      const minutesSince = Math.floor((now.getTime() - lastEmail.getTime()) / 60000);
      
      // Use 30 min for business hours, 300 min (5hr) for off-hours as threshold
      const threshold = 60; // Use 1 hour as a general "warning" threshold for display
      const criticalThreshold = 180; // 3 hours as critical
      
      if (minutesSince > criticalThreshold) {
        return 'critical';
      } else if (minutesSince > threshold) {
        return 'warning';
      }
      return 'healthy';
    };

    // Transform tenants with metrics
    const tenantsWithMetrics: TenantMetrics[] = tenants.map(tenant => ({
      tenant_id: tenant.id,
      tenant_name: tenant.name,
      status: tenant.status,
      release_channel: tenant.release_channel,
      created_at: tenant.created_at,
      gmail_alias: tenant.gmail_alias,
      last_email_received_at: tenant.last_email_received_at,
      email_health_status: getEmailHealthStatus(tenant),
      metrics: {
        users_count: userCounts.get(tenant.id) || 0,
        drivers_count: driverCounts.get(tenant.id) || 0,
        active_vehicles_count: activeVehicleCounts.get(tenant.id) || 0,
        pending_vehicles_count: pendingVehicleCounts.get(tenant.id) || 0,
        active_hunts_count: huntCounts.get(tenant.id) || 0,
      }
    }));

    console.log(`Returning ${tenantsWithMetrics.length} tenants with metrics`);

    return new Response(
      JSON.stringify({ tenants: tenantsWithMetrics }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
