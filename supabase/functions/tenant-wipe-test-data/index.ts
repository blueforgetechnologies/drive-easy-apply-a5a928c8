import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tables to wipe (in order - respecting foreign keys)
// Excluded: tenants, profiles, tenant_users, feature_flags, audit tables
const TABLES_TO_WIPE = [
  // Child tables first (FK dependencies)
  'load_hunt_matches',
  'load_bids',
  'load_stops',
  'load_expenses',
  'load_documents',
  'carrier_rate_history',
  'invoice_loads',
  // Main tenant-owned tables
  'hunt_plans',
  'settlements',
  'invoices',
  'expenses',
  'applications',
  'driver_invites',
  'contacts',
  'loads',
  'vehicles',
  'dispatchers',
  'customers',
  'carriers',
  'payees',
  'locations',
];

interface WipeRequest {
  confirm: boolean;
  tenant_id?: string; // Optional: wipe only for specific tenant
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Auth check
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseAuth.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    
    // Check platform admin
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", user.id)
      .single();

    if (!profile?.is_platform_admin) {
      return new Response(JSON.stringify({ error: "Platform admin required" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: WipeRequest = await req.json();

    if (!body.confirm) {
      return new Response(JSON.stringify({ 
        error: "Confirmation required",
        message: "Set confirm: true to proceed with data wipe",
        tables_affected: TABLES_TO_WIPE,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[tenant-wipe-test-data] Starting wipe...");
    console.log("[tenant-wipe-test-data] Tenant filter:", body.tenant_id || "ALL");

    const results: { table: string; deleted: number; error?: string }[] = [];

    for (const tableName of TABLES_TO_WIPE) {
      try {
        let query = supabase.from(tableName).delete();
        
        if (body.tenant_id) {
          // Wipe only for specific tenant
          query = query.eq("tenant_id", body.tenant_id);
        } else {
          // Wipe all - need a condition that matches all
          query = query.neq("id", "00000000-0000-0000-0000-000000000000");
        }

        const { data, error } = await query.select("id");

        if (error) {
          console.error(`[tenant-wipe-test-data] Error wiping ${tableName}:`, error);
          results.push({ table: tableName, deleted: 0, error: error.message });
        } else {
          const count = data?.length || 0;
          console.log(`[tenant-wipe-test-data] Wiped ${count} rows from ${tableName}`);
          results.push({ table: tableName, deleted: count });
        }
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        results.push({ table: tableName, deleted: 0, error: errorMessage });
      }
    }

    const totalDeleted = results.reduce((sum, r) => sum + r.deleted, 0);
    const errors = results.filter(r => r.error);

    console.log("[tenant-wipe-test-data] Wipe complete. Total deleted:", totalDeleted);

    return new Response(JSON.stringify({ 
      success: errors.length === 0,
      wiped_at: new Date().toISOString(),
      tenant_id: body.tenant_id || "ALL",
      total_deleted: totalDeleted,
      results,
      errors: errors.length > 0 ? errors : undefined,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("[tenant-wipe-test-data] Error:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
