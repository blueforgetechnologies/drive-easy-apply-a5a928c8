import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Tables that should be tenant-scoped
const TENANT_OWNED_TABLES = [
  'vehicles',
  'loads',
  'dispatchers',
  'customers',
  'carriers',
  'payees',
  'hunt_plans',
  'applications',
  'driver_invites',
  'invoices',
  'settlements',
  'expenses',
  'load_expenses',
  'contacts',
  'locations',
];

interface TableAudit {
  table_name: string;
  has_tenant_id: boolean;
  tenant_id_nullable: boolean;
  total_rows: number;
  rows_with_null_tenant_id: number;
  rows_for_requested_tenant: number;
  rows_for_other_tenants: number;
  null_sample_ids: string[];
  other_tenant_sample_ids: string[];
  status: 'green' | 'yellow' | 'red';
  issues: string[];
}

interface AuditRequest {
  tenant_id?: string;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Auth check - platform admin only
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

    // Service client for admin operations
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

    // Parse request body
    let body: AuditRequest = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is OK
    }

    const requestedTenantId = body.tenant_id;
    console.log("[tenant-isolation-audit] Starting audit for tenant:", requestedTenantId || "ALL");

    // Get all tenants for reference
    const { data: tenants } = await supabase.from("tenants").select("id, name");
    const tenantMap = new Map((tenants || []).map(t => [t.id, t.name]));

    const results: TableAudit[] = [];

    for (const tableName of TENANT_OWNED_TABLES) {
      console.log(`[tenant-isolation-audit] Auditing ${tableName}...`);
      
      const audit: TableAudit = {
        table_name: tableName,
        has_tenant_id: true,
        tenant_id_nullable: false,
        total_rows: 0,
        rows_with_null_tenant_id: 0,
        rows_for_requested_tenant: 0,
        rows_for_other_tenants: 0,
        null_sample_ids: [],
        other_tenant_sample_ids: [],
        status: 'green',
        issues: [],
      };

      try {
        // Get total count
        const { count: totalCount, error: countError } = await supabase
          .from(tableName)
          .select("*", { count: "exact", head: true });

        if (countError) {
          audit.issues.push(`Cannot query table: ${countError.message}`);
          audit.status = 'red';
          results.push(audit);
          continue;
        }

        audit.total_rows = totalCount || 0;

        // Get rows with NULL tenant_id
        const { data: nullRows, error: nullError } = await supabase
          .from(tableName)
          .select("id, tenant_id")
          .is("tenant_id", null)
          .limit(5);

        if (nullError) {
          if (nullError.message.includes("tenant_id")) {
            audit.has_tenant_id = false;
            audit.issues.push("CRITICAL: Missing tenant_id column");
            audit.status = 'red';
          } else {
            audit.issues.push(`Query error: ${nullError.message}`);
            audit.status = 'red';
          }
          results.push(audit);
          continue;
        }

        audit.rows_with_null_tenant_id = nullRows?.length || 0;
        audit.null_sample_ids = (nullRows || []).map(r => r.id);

        // If we need exact null count (when sample is 5)
        if (audit.rows_with_null_tenant_id === 5) {
          const { count: nullCount } = await supabase
            .from(tableName)
            .select("*", { count: "exact", head: true })
            .is("tenant_id", null);
          audit.rows_with_null_tenant_id = nullCount || 5;
        }

        // Count for requested tenant
        if (requestedTenantId) {
          const { count: tenantCount } = await supabase
            .from(tableName)
            .select("*", { count: "exact", head: true })
            .eq("tenant_id", requestedTenantId);
          audit.rows_for_requested_tenant = tenantCount || 0;

          // Count for other tenants
          const { data: otherRows, count: otherCount } = await supabase
            .from(tableName)
            .select("id", { count: "exact" })
            .neq("tenant_id", requestedTenantId)
            .not("tenant_id", "is", null)
            .limit(5);
          
          audit.rows_for_other_tenants = otherCount || 0;
          audit.other_tenant_sample_ids = (otherRows || []).map(r => r.id);
        }

        // Determine status
        if (audit.rows_for_other_tenants > 0) {
          audit.status = 'red';
          audit.issues.push(`LEAK: ${audit.rows_for_other_tenants} rows belong to other tenants`);
        } else if (audit.rows_with_null_tenant_id > 0) {
          audit.status = 'yellow';
          audit.issues.push(`${audit.rows_with_null_tenant_id} rows have NULL tenant_id`);
        } else {
          audit.status = 'green';
        }

        // Check if tenant_id is nullable by trying to infer from schema
        // If we found null rows, it must be nullable (or was before migration)
        if (audit.rows_with_null_tenant_id > 0) {
          audit.tenant_id_nullable = true;
        }

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[tenant-isolation-audit] Error auditing ${tableName}:`, err);
        audit.issues.push(`Audit error: ${errorMessage}`);
        audit.status = 'red';
      }

      results.push(audit);
    }

    console.log("[tenant-isolation-audit] Audit complete");

    // Summary stats
    const summary = {
      total_tables: results.length,
      green_tables: results.filter(r => r.status === 'green').length,
      yellow_tables: results.filter(r => r.status === 'yellow').length,
      red_tables: results.filter(r => r.status === 'red').length,
      total_null_rows: results.reduce((sum, r) => sum + r.rows_with_null_tenant_id, 0),
      total_leaked_rows: results.reduce((sum, r) => sum + r.rows_for_other_tenants, 0),
    };

    return new Response(JSON.stringify({ 
      success: true,
      audited_at: new Date().toISOString(),
      requested_tenant_id: requestedTenantId || null,
      requested_tenant_name: requestedTenantId ? tenantMap.get(requestedTenantId) : null,
      results,
      summary,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("[tenant-isolation-audit] Error:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
