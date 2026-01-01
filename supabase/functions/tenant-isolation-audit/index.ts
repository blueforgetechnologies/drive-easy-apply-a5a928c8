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

interface RlsTestResult {
  table_name: string;
  rls_enforced: boolean;
  rows_returned_via_rls: number;
  rows_for_tenant: number;
  leaked_rows: number;
  status: 'pass' | 'fail';
  message: string;
}

interface AuditRequest {
  tenant_id?: string;
  mode?: 'schema' | 'rls_test' | 'both';
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    
    // Auth check - platform admin only
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Create user-authenticated client for RLS testing
    const supabaseUser = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();
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
    const mode = body.mode || 'both';
    console.log(`[tenant-isolation-audit] Starting audit for tenant: ${requestedTenantId || "ALL"}, mode: ${mode}`);

    // Get all tenants for reference
    const { data: tenants } = await supabase.from("tenants").select("id, name");
    const tenantMap = new Map((tenants || []).map(t => [t.id, t.name]));

    const results: TableAudit[] = [];
    const rlsTestResults: RlsTestResult[] = [];

    // ========================================
    // MODE: SCHEMA AUDIT (service role - sees all)
    // ========================================
    if (mode === 'schema' || mode === 'both') {
      for (const tableName of TENANT_OWNED_TABLES) {
        console.log(`[tenant-isolation-audit] Schema audit: ${tableName}...`);
        
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
          // Get total count (service role)
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

            // Count for other tenants (this is EXPECTED in a shared DB)
            const { count: otherCount } = await supabase
              .from(tableName)
              .select("*", { count: "exact", head: true })
              .neq("tenant_id", requestedTenantId)
              .not("tenant_id", "is", null);
            
            audit.rows_for_other_tenants = otherCount || 0;
          }

          // Determine status - NULL tenant_id is a data issue, other tenant rows are NORMAL
          if (audit.rows_with_null_tenant_id > 0) {
            audit.status = 'yellow';
            audit.issues.push(`${audit.rows_with_null_tenant_id} rows have NULL tenant_id`);
          } else {
            audit.status = 'green';
          }

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
    }

    // ========================================
    // MODE: RLS ENFORCEMENT TEST (user client - RLS applies)
    // ========================================
    if ((mode === 'rls_test' || mode === 'both') && requestedTenantId) {
      console.log("[tenant-isolation-audit] Running RLS enforcement tests...");
      
      for (const tableName of TENANT_OWNED_TABLES) {
        console.log(`[tenant-isolation-audit] RLS test: ${tableName}...`);
        
        const rlsResult: RlsTestResult = {
          table_name: tableName,
          rls_enforced: true,
          rows_returned_via_rls: 0,
          rows_for_tenant: 0,
          leaked_rows: 0,
          status: 'pass',
          message: '',
        };

        try {
          // Query WITHOUT tenant_id filter - let RLS do the work
          const { data: rlsRows, count: rlsCount, error: rlsError } = await supabaseUser
            .from(tableName)
            .select("id, tenant_id", { count: "exact" })
            .limit(100);

          if (rlsError) {
            rlsResult.rls_enforced = false;
            rlsResult.status = 'fail';
            rlsResult.message = `Query error: ${rlsError.message}`;
            rlsTestResults.push(rlsResult);
            continue;
          }

          rlsResult.rows_returned_via_rls = rlsCount || 0;

          // Check if any returned rows belong to OTHER tenants (this would be a REAL leak)
          const leakedRows = (rlsRows || []).filter(r => 
            r.tenant_id && r.tenant_id !== requestedTenantId
          );
          rlsResult.leaked_rows = leakedRows.length;
          
          // Count rows for requested tenant
          rlsResult.rows_for_tenant = (rlsRows || []).filter(r => 
            r.tenant_id === requestedTenantId
          ).length;

          if (leakedRows.length > 0) {
            rlsResult.rls_enforced = false;
            rlsResult.status = 'fail';
            rlsResult.message = `RLS LEAK: ${leakedRows.length} rows from other tenants returned`;
          } else {
            rlsResult.status = 'pass';
            rlsResult.message = `RLS OK: ${rlsResult.rows_returned_via_rls} rows (all belong to current tenant)`;
          }

        } catch (err: unknown) {
          const errorMessage = err instanceof Error ? err.message : 'Unknown error';
          rlsResult.status = 'fail';
          rlsResult.message = `Test error: ${errorMessage}`;
        }

        rlsTestResults.push(rlsResult);
      }
    }

    console.log("[tenant-isolation-audit] Audit complete");

    // Schema summary
    const schemaSummary = {
      total_tables: results.length,
      green_tables: results.filter(r => r.status === 'green').length,
      yellow_tables: results.filter(r => r.status === 'yellow').length,
      red_tables: results.filter(r => r.status === 'red').length,
      total_null_rows: results.reduce((sum, r) => sum + r.rows_with_null_tenant_id, 0),
      total_other_tenant_rows: results.reduce((sum, r) => sum + r.rows_for_other_tenants, 0),
    };

    // RLS test summary
    const rlsSummary = {
      total_tables_tested: rlsTestResults.length,
      passed: rlsTestResults.filter(r => r.status === 'pass').length,
      failed: rlsTestResults.filter(r => r.status === 'fail').length,
      total_leaked_rows: rlsTestResults.reduce((sum, r) => sum + r.leaked_rows, 0),
    };

    return new Response(JSON.stringify({ 
      success: true,
      audited_at: new Date().toISOString(),
      mode,
      requested_tenant_id: requestedTenantId || null,
      requested_tenant_name: requestedTenantId ? tenantMap.get(requestedTenantId) : null,
      schema_audit: mode === 'schema' || mode === 'both' ? {
        results,
        summary: schemaSummary,
      } : null,
      rls_test: (mode === 'rls_test' || mode === 'both') && requestedTenantId ? {
        results: rlsTestResults,
        summary: rlsSummary,
      } : null,
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
