import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Simple UUID validation
function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[debug-tenant-data] No Authorization header");
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body for tenant_id
    let requestedTenantId: string | null = null;
    try {
      const body = await req.json();
      requestedTenantId = body.tenant_id || null;
    } catch {
      // No body or invalid JSON
    }

    // Also check header as fallback
    if (!requestedTenantId) {
      requestedTenantId = req.headers.get("x-tenant-id");
    }

    // Validate tenant_id if provided
    if (requestedTenantId && !isValidUUID(requestedTenantId)) {
      console.error("[debug-tenant-data] Invalid tenant_id format:", requestedTenantId);
      return new Response(JSON.stringify({ error: "invalid_tenant_id", message: "tenant_id must be a valid UUID" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create user client to verify identity
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error("[debug-tenant-data] User auth failed:", userError?.message);
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`[debug-tenant-data] User ${user.id} requesting tenant data, effective tenant: ${requestedTenantId || 'none'}`);

    // Verify platform admin using service role
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    
    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_platform_admin) {
      console.error("[debug-tenant-data] Not a platform admin:", user.id);
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[debug-tenant-data] Platform admin verified, fetching counts");

    // Fetch vehicle counts by tenant (global)
    const { data: vehicleCounts, error: vehicleError } = await serviceClient
      .from("vehicles")
      .select("tenant_id");

    if (vehicleError) {
      console.error("[debug-tenant-data] Vehicle query error:", vehicleError.message);
    }

    // Fetch load counts by tenant (global)
    const { data: loadCounts, error: loadError } = await serviceClient
      .from("loads")
      .select("tenant_id");

    if (loadError) {
      console.error("[debug-tenant-data] Load query error:", loadError.message);
    }

    // Aggregate counts by tenant_id
    const vehiclesByTenant: Record<string, number> = {};
    (vehicleCounts || []).forEach((v: any) => {
      const tid = v.tenant_id || "NULL";
      vehiclesByTenant[tid] = (vehiclesByTenant[tid] || 0) + 1;
    });

    const loadsByTenant: Record<string, number> = {};
    (loadCounts || []).forEach((l: any) => {
      const tid = l.tenant_id || "NULL";
      loadsByTenant[tid] = (loadsByTenant[tid] || 0) + 1;
    });

    // Get tenant names for context
    const allTenantIds = new Set([
      ...Object.keys(vehiclesByTenant),
      ...Object.keys(loadsByTenant),
    ]);
    allTenantIds.delete("NULL");

    const { data: tenants } = await serviceClient
      .from("tenants")
      .select("id, name, slug, release_channel")
      .in("id", Array.from(allTenantIds));

    const tenantMap: Record<string, any> = {};
    (tenants || []).forEach((t: any) => {
      tenantMap[t.id] = t;
    });

    // Build global results
    const results: Array<{
      tenant_id: string;
      tenant_name: string;
      tenant_slug: string;
      release_channel: string;
      entity: string;
      count: number;
    }> = [];

    // Add vehicle counts
    for (const [tid, count] of Object.entries(vehiclesByTenant)) {
      const tenant = tenantMap[tid];
      results.push({
        tenant_id: tid,
        tenant_name: tenant?.name || (tid === "NULL" ? "(no tenant)" : "Unknown"),
        tenant_slug: tenant?.slug || "-",
        release_channel: tenant?.release_channel || "-",
        entity: "vehicles",
        count,
      });
    }

    // Add load counts
    for (const [tid, count] of Object.entries(loadsByTenant)) {
      const tenant = tenantMap[tid];
      results.push({
        tenant_id: tid,
        tenant_name: tenant?.name || (tid === "NULL" ? "(no tenant)" : "Unknown"),
        tenant_slug: tenant?.slug || "-",
        release_channel: tenant?.release_channel || "-",
        entity: "loads",
        count,
      });
    }

    // Sort by tenant_name, then entity
    results.sort((a, b) => {
      if (a.tenant_name !== b.tenant_name) return a.tenant_name.localeCompare(b.tenant_name);
      return a.entity.localeCompare(b.entity);
    });

    // Calculate current tenant scoped counts
    let currentTenantCounts: {
      tenant_id: string | null;
      tenant_name: string | null;
      vehicles: number;
      loads: number;
    } | null = null;

    if (requestedTenantId) {
      const vehicleCount = vehiclesByTenant[requestedTenantId] || 0;
      const loadCount = loadsByTenant[requestedTenantId] || 0;
      const tenantInfo = tenantMap[requestedTenantId];

      currentTenantCounts = {
        tenant_id: requestedTenantId,
        tenant_name: tenantInfo?.name || "Unknown",
        vehicles: vehicleCount,
        loads: loadCount,
      };

      console.log(`[debug-tenant-data] Current tenant ${requestedTenantId}: ${vehicleCount} vehicles, ${loadCount} loads`);
    }

    console.log(`[debug-tenant-data] Returning ${results.length} global rows`);

    return new Response(
      JSON.stringify({
        success: true,
        // Global counts by tenant
        global_counts_by_tenant: results,
        // Current tenant scoped counts
        current_tenant_counts: currentTenantCounts,
        // Totals
        totals: {
          vehicles: Object.values(vehiclesByTenant).reduce((a, b) => a + b, 0),
          loads: Object.values(loadsByTenant).reduce((a, b) => a + b, 0),
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("[debug-tenant-data] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "internal_error", message: String(error) }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});