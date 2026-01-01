import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isValidUUID(str: string): boolean {
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  return uuidRegex.test(str);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      console.error("[tenant-counts] No Authorization header");
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    let tenantId: string | null = null;
    try {
      const body = await req.json();
      tenantId = body.tenant_id || null;
    } catch {
      // No body
    }

    console.log("[tenant-counts] Requested tenant_id:", tenantId);

    // Validate tenant_id if provided
    if (tenantId && !isValidUUID(tenantId)) {
      return new Response(
        JSON.stringify({ error: "invalid_tenant_id", message: "tenant_id must be a valid UUID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user identity
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error("[tenant-counts] User auth failed:", userError?.message);
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Verify platform admin
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const { data: profile, error: profileError } = await serviceClient
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", user.id)
      .single();

    if (profileError || !profile?.is_platform_admin) {
      console.error("[tenant-counts] Not a platform admin:", user.id);
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[tenant-counts] Platform admin verified, fetching counts...");

    // Fetch all vehicles and loads tenant_ids
    const [vehiclesResult, loadsResult] = await Promise.all([
      serviceClient.from("vehicles").select("tenant_id"),
      serviceClient.from("loads").select("tenant_id"),
    ]);

    // Build counts by tenant
    const vehiclesByTenant: Record<string, number> = {};
    (vehiclesResult.data || []).forEach((v: any) => {
      const tid = v.tenant_id || "NULL";
      vehiclesByTenant[tid] = (vehiclesByTenant[tid] || 0) + 1;
    });

    const loadsByTenant: Record<string, number> = {};
    (loadsResult.data || []).forEach((l: any) => {
      const tid = l.tenant_id || "NULL";
      loadsByTenant[tid] = (loadsByTenant[tid] || 0) + 1;
    });

    // Get tenant names
    const allTenantIds = new Set([
      ...Object.keys(vehiclesByTenant),
      ...Object.keys(loadsByTenant),
    ]);
    allTenantIds.delete("NULL");

    const { data: tenants } = await serviceClient
      .from("tenants")
      .select("id, name, slug")
      .in("id", Array.from(allTenantIds));

    const tenantMap: Record<string, any> = {};
    (tenants || []).forEach((t: any) => {
      tenantMap[t.id] = t;
    });

    // Build global_by_tenant
    const globalByTenant: Array<{
      tenant_id: string;
      tenant_name: string;
      vehicles: number;
      loads: number;
    }> = [];

    const allIds = new Set([...Object.keys(vehiclesByTenant), ...Object.keys(loadsByTenant)]);
    for (const tid of allIds) {
      globalByTenant.push({
        tenant_id: tid,
        tenant_name: tenantMap[tid]?.name || (tid === "NULL" ? "(no tenant)" : "Unknown"),
        vehicles: vehiclesByTenant[tid] || 0,
        loads: loadsByTenant[tid] || 0,
      });
    }

    globalByTenant.sort((a, b) => a.tenant_name.localeCompare(b.tenant_name));

    // Scoped counts for requested tenant
    let scoped: { vehicles: number; loads: number } | null = null;
    if (tenantId) {
      scoped = {
        vehicles: vehiclesByTenant[tenantId] || 0,
        loads: loadsByTenant[tenantId] || 0,
      };
      console.log(`[tenant-counts] Scoped for ${tenantId}: ${scoped.vehicles} vehicles, ${scoped.loads} loads`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        requested_tenant_id: tenantId,
        scoped,
        global_by_tenant: globalByTenant,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[tenant-counts] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "internal_error", message: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
