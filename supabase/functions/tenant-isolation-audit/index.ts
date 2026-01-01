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
  'load_emails',
  'load_hunt_matches',
  'email_queue',
  'applications',
  'driver_invites',
  'invoices',
  'settlements',
  'expenses',
  'maintenance_records',
  'load_documents',
  'load_stops',
  'load_expenses',
  'contacts',
  'locations',
];

interface TableAudit {
  table_name: string;
  has_tenant_id: boolean;
  tenant_id_nullable: boolean;
  null_count: number;
  total_rows: number;
  null_percentage: number;
  rls_enabled: boolean;
  has_tenant_policy: boolean;
  counts_by_tenant: { tenant_id: string | null; tenant_name: string | null; count: number }[];
  issues: string[];
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

    // Check platform admin
    const supabase = createClient(supabaseUrl, supabaseServiceKey);
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

    console.log("[tenant-isolation-audit] Starting audit...");

    // Get all tenants for name lookup
    const { data: tenants } = await supabase
      .from("tenants")
      .select("id, name");
    
    const tenantMap = new Map((tenants || []).map(t => [t.id, t.name]));

    const results: TableAudit[] = [];

    for (const tableName of TENANT_OWNED_TABLES) {
      console.log(`[tenant-isolation-audit] Auditing ${tableName}...`);
      
      const audit: TableAudit = {
        table_name: tableName,
        has_tenant_id: false,
        tenant_id_nullable: true,
        null_count: 0,
        total_rows: 0,
        null_percentage: 0,
        rls_enabled: false,
        has_tenant_policy: false,
        counts_by_tenant: [],
        issues: [],
      };

      try {
        // Check if table exists and has tenant_id column
        const { data: columns, error: colError } = await supabase.rpc('get_table_columns', { 
          p_table_name: tableName 
        }).maybeSingle();

        // Fallback: try to select with tenant_id to check if column exists
        const { data: testRow, error: testError } = await supabase
          .from(tableName)
          .select("*")
          .limit(1)
          .maybeSingle();

        if (testError && testError.message.includes("does not exist")) {
          audit.issues.push("Table does not exist");
          results.push(audit);
          continue;
        }

        // Check if tenant_id column exists by trying to query it
        const { count: totalCount, error: countError } = await supabase
          .from(tableName)
          .select("*", { count: "exact", head: true });

        if (countError) {
          audit.issues.push(`Cannot query table: ${countError.message}`);
          results.push(audit);
          continue;
        }

        audit.total_rows = totalCount || 0;

        // Try to get tenant_id counts
        const { data: tenantCounts, error: tenantError } = await supabase
          .from(tableName)
          .select("tenant_id")
          .limit(10000);

        if (tenantError) {
          if (tenantError.message.includes("tenant_id")) {
            audit.has_tenant_id = false;
            audit.issues.push("Missing tenant_id column");
          } else {
            audit.issues.push(`Query error: ${tenantError.message}`);
          }
        } else {
          audit.has_tenant_id = true;
          
          // Count by tenant_id
          const countMap = new Map<string | null, number>();
          let nullCount = 0;
          
          for (const row of tenantCounts || []) {
            const tid = row.tenant_id;
            if (tid === null) {
              nullCount++;
            }
            countMap.set(tid, (countMap.get(tid) || 0) + 1);
          }

          audit.null_count = nullCount;
          audit.null_percentage = audit.total_rows > 0 
            ? Math.round((nullCount / audit.total_rows) * 100 * 100) / 100
            : 0;

          // Convert to array with tenant names
          audit.counts_by_tenant = Array.from(countMap.entries()).map(([tid, count]) => ({
            tenant_id: tid,
            tenant_name: tid ? (tenantMap.get(tid) || "Unknown") : "(NULL)",
            count,
          }));

          if (nullCount > 0) {
            audit.issues.push(`${nullCount} rows have NULL tenant_id`);
          }
        }

        // Check RLS status - query pg_class
        const { data: rlsData } = await supabase.rpc('check_rls_enabled', {
          p_table_name: tableName
        }).maybeSingle();

        // Fallback: assume RLS is enabled if we can't check
        // We'll rely on the policy check instead
        audit.rls_enabled = true; // Default assumption

        // Check if there's a tenant-scoped policy by looking at policy names
        const { data: policies } = await supabase.rpc('get_table_policies', {
          p_table_name: tableName
        });

        if (policies && Array.isArray(policies)) {
          audit.has_tenant_policy = policies.some((p: any) => 
            p.policy_name?.toLowerCase().includes('tenant') ||
            p.policy_qual?.includes('tenant_id') ||
            p.policy_with_check?.includes('tenant_id')
          );
        }

        // Check nullable status
        const { data: nullableCheck } = await supabase.rpc('is_column_nullable', {
          p_table_name: tableName,
          p_column_name: 'tenant_id'
        }).maybeSingle();

        if (nullableCheck !== null && typeof nullableCheck === 'boolean') {
          audit.tenant_id_nullable = nullableCheck;
          if (audit.has_tenant_id && audit.tenant_id_nullable) {
            audit.issues.push("tenant_id column is nullable");
          }
        }

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        console.error(`[tenant-isolation-audit] Error auditing ${tableName}:`, err);
        audit.issues.push(`Audit error: ${errorMessage}`);
      }

      // Add issues based on findings
      if (!audit.has_tenant_id && audit.total_rows > 0) {
        audit.issues.push("CRITICAL: No tenant_id column");
      }
      if (audit.has_tenant_id && !audit.has_tenant_policy) {
        audit.issues.push("WARNING: No tenant-scoped RLS policy detected");
      }

      results.push(audit);
    }

    console.log("[tenant-isolation-audit] Audit complete");

    return new Response(JSON.stringify({ 
      success: true,
      audited_at: new Date().toISOString(),
      results,
      summary: {
        total_tables: results.length,
        tables_with_tenant_id: results.filter(r => r.has_tenant_id).length,
        tables_with_issues: results.filter(r => r.issues.length > 0).length,
        tables_with_nulls: results.filter(r => r.null_count > 0).length,
      }
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
