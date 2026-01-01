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
      console.error("[tenant-seed-data] No Authorization header");
      return new Response(JSON.stringify({ error: "unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    let tenantId: string | null = null;
    let vehicleCount = 0;
    let loadCount = 0;

    try {
      const body = await req.json();
      tenantId = body.tenant_id || null;
      vehicleCount = parseInt(body.vehicles, 10) || 0;
      loadCount = parseInt(body.loads, 10) || 0;
    } catch {
      return new Response(JSON.stringify({ error: "invalid_body" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Validate tenant_id
    if (!tenantId || !isValidUUID(tenantId)) {
      console.error("[tenant-seed-data] Invalid tenant_id:", tenantId);
      return new Response(
        JSON.stringify({ error: "invalid_tenant_id", message: "tenant_id must be a valid UUID" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`[tenant-seed-data] Request: tenant=${tenantId}, vehicles=${vehicleCount}, loads=${loadCount}`);

    // Verify user identity
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      console.error("[tenant-seed-data] User auth failed:", userError?.message);
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
      console.error("[tenant-seed-data] Not a platform admin:", user.id);
      return new Response(JSON.stringify({ error: "forbidden" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[tenant-seed-data] Platform admin verified, seeding data...");

    // Generate test vehicles
    const vehiclesToInsert = [];
    const timestamp = Date.now();
    for (let i = 0; i < vehicleCount; i++) {
      vehiclesToInsert.push({
        tenant_id: tenantId,
        vehicle_number: `TEST-${timestamp}-${i + 1}`,
        make: "TestMake",
        model: "TestModel",
        year: 2024,
        status: "active",
        asset_type: "truck",
      });
    }

    let vehiclesCreated = 0;
    if (vehiclesToInsert.length > 0) {
      const { data: vehicleData, error: vehicleError } = await serviceClient
        .from("vehicles")
        .insert(vehiclesToInsert)
        .select("id");

      if (vehicleError) {
        console.error("[tenant-seed-data] Vehicle insert error:", vehicleError.message);
      } else {
        vehiclesCreated = vehicleData?.length || 0;
        console.log(`[tenant-seed-data] Created ${vehiclesCreated} vehicles`);
      }
    }

    // Generate test loads
    const loadsToInsert = [];
    for (let i = 0; i < loadCount; i++) {
      loadsToInsert.push({
        tenant_id: tenantId,
        load_number: `TEST-LOAD-${timestamp}-${i + 1}`,
        status: "pending",
        load_type: "test",
        pickup_city: "Test City",
        pickup_state: "TX",
        delivery_city: "Dest City",
        delivery_state: "CA",
      });
    }

    let loadsCreated = 0;
    if (loadsToInsert.length > 0) {
      const { data: loadData, error: loadError } = await serviceClient
        .from("loads")
        .insert(loadsToInsert)
        .select("id");

      if (loadError) {
        console.error("[tenant-seed-data] Load insert error:", loadError.message);
      } else {
        loadsCreated = loadData?.length || 0;
        console.log(`[tenant-seed-data] Created ${loadsCreated} loads`);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        tenant_id: tenantId,
        vehicles_created: vehiclesCreated,
        loads_created: loadsCreated,
        message: `DEBUG: Seeded ${vehiclesCreated} vehicles and ${loadsCreated} loads for tenant ${tenantId}`,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("[tenant-seed-data] Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: "internal_error", message: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
