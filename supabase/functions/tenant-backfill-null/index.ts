import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Backfill rules per table
// Each rule defines how to derive tenant_id for rows with NULL
const BACKFILL_RULES: Record<string, {
  strategy: 'from_relation' | 'from_default' | 'manual';
  relation_table?: string;
  relation_column?: string;
  relation_tenant_column?: string;
  description: string;
}> = {
  loads: {
    strategy: 'from_relation',
    relation_table: 'vehicles',
    relation_column: 'assigned_vehicle_id',
    relation_tenant_column: 'tenant_id',
    description: 'Derive from assigned vehicle',
  },
  load_expenses: {
    strategy: 'from_relation',
    relation_table: 'loads',
    relation_column: 'load_id',
    relation_tenant_column: 'tenant_id',
    description: 'Derive from load',
  },
  load_documents: {
    strategy: 'from_relation',
    relation_table: 'loads',
    relation_column: 'load_id',
    relation_tenant_column: 'tenant_id',
    description: 'Derive from load',
  },
  hunt_plans: {
    strategy: 'from_relation',
    relation_table: 'vehicles',
    relation_column: 'vehicle_id',
    relation_tenant_column: 'tenant_id',
    description: 'Derive from vehicle',
  },
  applications: {
    strategy: 'from_relation',
    relation_table: 'driver_invites',
    relation_column: 'invite_id',
    relation_tenant_column: 'tenant_id',
    description: 'Derive from driver invite',
  },
  contacts: {
    strategy: 'manual',
    description: 'Contacts can belong to multiple entity types - requires manual review',
  },
  // Tables that might use default tenant
  vehicles: { strategy: 'from_default', description: 'Use default tenant' },
  dispatchers: { strategy: 'from_default', description: 'Use default tenant' },
  customers: { strategy: 'from_default', description: 'Use default tenant' },
  carriers: { strategy: 'from_default', description: 'Use default tenant' },
  payees: { strategy: 'from_default', description: 'Use default tenant' },
  locations: { strategy: 'from_default', description: 'Use default tenant' },
  driver_invites: { strategy: 'from_default', description: 'Use default tenant' },
  invoices: { strategy: 'from_default', description: 'Use default tenant' },
  settlements: { strategy: 'from_default', description: 'Use default tenant' },
  expenses: { strategy: 'from_default', description: 'Use default tenant' },
  // Newly tenant-scoped tables (Phase 1 migration)
  load_bids: {
    strategy: 'from_relation',
    relation_table: 'vehicles',
    relation_column: 'vehicle_id',
    relation_tenant_column: 'tenant_id',
    description: 'Derive from vehicle',
  },
  match_action_history: {
    strategy: 'from_relation',
    relation_table: 'load_hunt_matches',
    relation_column: 'match_id',
    relation_tenant_column: 'tenant_id',
    description: 'Derive from match -> hunt_plan',
  },
  map_load_tracking: {
    strategy: 'from_default',
    description: 'Use default tenant for historical tracking data',
  },
  audit_logs: {
    strategy: 'from_default',
    description: 'Use default tenant for historical audit logs',
  },
  load_emails: {
    strategy: 'from_default',
    description: 'Use default tenant for historical emails',
  },
};

interface BackfillRequest {
  confirm: boolean;
  default_tenant_id?: string;
  dry_run?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
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

    const body: BackfillRequest = await req.json();
    const dryRun = body.dry_run !== false; // Default to dry run for safety

    if (!body.confirm) {
      return new Response(JSON.stringify({ 
        error: "Confirmation required",
        message: "Set confirm: true to proceed. Set dry_run: false to actually update.",
        rules: BACKFILL_RULES,
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Get default tenant
    let defaultTenantId = body.default_tenant_id;
    if (!defaultTenantId) {
      const { data: defaultTenant } = await supabase
        .from("tenants")
        .select("id")
        .eq("slug", "default")
        .single();
      defaultTenantId = defaultTenant?.id;
    }

    if (!defaultTenantId) {
      return new Response(JSON.stringify({ 
        error: "No default tenant found. Please provide default_tenant_id.",
      }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log("[tenant-backfill-null] Starting backfill...");
    console.log("[tenant-backfill-null] Dry run:", dryRun);
    console.log("[tenant-backfill-null] Default tenant:", defaultTenantId);

    const results: { 
      table: string; 
      null_count: number;
      strategy: string;
      updated: number;
      skipped: number;
      error?: string;
    }[] = [];

    for (const [tableName, rule] of Object.entries(BACKFILL_RULES)) {
      try {
        // Count null rows
        const { count: nullCount } = await supabase
          .from(tableName)
          .select("*", { count: "exact", head: true })
          .is("tenant_id", null);

        if (!nullCount || nullCount === 0) {
          results.push({
            table: tableName,
            null_count: 0,
            strategy: rule.strategy,
            updated: 0,
            skipped: 0,
          });
          continue;
        }

        let updated = 0;
        let skipped = 0;

        if (rule.strategy === 'manual') {
          // Can't auto-backfill
          skipped = nullCount;
          results.push({
            table: tableName,
            null_count: nullCount,
            strategy: rule.strategy,
            updated: 0,
            skipped,
            error: rule.description,
          });
          continue;
        }

        if (rule.strategy === 'from_default') {
          if (!dryRun) {
            const { data, error } = await supabase
              .from(tableName)
              .update({ tenant_id: defaultTenantId })
              .is("tenant_id", null)
              .select("id");

            if (error) {
              results.push({
                table: tableName,
                null_count: nullCount,
                strategy: rule.strategy,
                updated: 0,
                skipped: nullCount,
                error: error.message,
              });
              continue;
            }
            updated = data?.length || 0;
          } else {
            updated = nullCount; // Would update this many
          }
        }

        if (rule.strategy === 'from_relation' && rule.relation_table && rule.relation_column) {
          // Get null rows with relation - use explicit any type for dynamic column access
          const { data: nullRows } = await supabase
            .from(tableName)
            .select("*")
            .is("tenant_id", null)
            .not(rule.relation_column, "is", null);

          if (nullRows && nullRows.length > 0) {
            for (const row of nullRows as unknown as Array<{ id: string; [key: string]: unknown }>) {
              const relId = row[rule.relation_column] as string | undefined;
              if (!relId) {
                skipped++;
                continue;
              }

              // Get tenant from relation
              const { data: relRow } = await supabase
                .from(rule.relation_table)
                .select("tenant_id")
                .eq("id", relId)
                .single();

              if (relRow?.tenant_id) {
                if (!dryRun) {
                  await supabase
                    .from(tableName)
                    .update({ tenant_id: relRow.tenant_id })
                    .eq("id", row.id);
                }
                updated++;
              } else {
                skipped++;
              }
            }
          }

          // Remaining nulls (no valid relation)
          const remaining = nullCount - updated - skipped;
          if (remaining > 0) {
            // Fall back to default tenant
            if (!dryRun) {
              await supabase
                .from(tableName)
                .update({ tenant_id: defaultTenantId })
                .is("tenant_id", null);
            }
            updated += remaining;
          }
        }

        results.push({
          table: tableName,
          null_count: nullCount,
          strategy: rule.strategy,
          updated,
          skipped,
        });

      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Unknown error';
        results.push({
          table: tableName,
          null_count: 0,
          strategy: rule.strategy,
          updated: 0,
          skipped: 0,
          error: errorMessage,
        });
      }
    }

    const totalUpdated = results.reduce((sum, r) => sum + r.updated, 0);
    const totalSkipped = results.reduce((sum, r) => sum + r.skipped, 0);

    console.log("[tenant-backfill-null] Complete. Updated:", totalUpdated, "Skipped:", totalSkipped);

    return new Response(JSON.stringify({ 
      success: true,
      dry_run: dryRun,
      backfilled_at: new Date().toISOString(),
      default_tenant_id: defaultTenantId,
      total_updated: totalUpdated,
      total_skipped: totalSkipped,
      results,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error("[tenant-backfill-null] Error:", error);
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
