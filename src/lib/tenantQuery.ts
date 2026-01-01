/**
 * Centralized Tenant-Scoped Query Layer
 * 
 * This module provides a single source of truth for tenant filtering in the UI.
 * All queries to tenant-owned tables MUST use these utilities to ensure data isolation.
 */

import { supabase } from "@/integrations/supabase/client";

/**
 * List of all tables that contain tenant-scoped data.
 * Queries to these tables MUST include tenant_id filtering.
 */
export const TENANT_OWNED_TABLES = [
  "vehicles",
  "loads",
  "load_documents",
  "load_expenses",
  "customers",
  "carriers",
  "payees",
  "dispatchers",
  "drivers",
  "locations",
  "applications",
  "driver_invites",
  "invoices",
  "invoice_loads",
  "expenses",
  "settlements",
  "hunt_plans",
  "contacts",
] as const;

export type TenantOwnedTable = typeof TENANT_OWNED_TABLES[number];

/**
 * Check if a table is tenant-owned
 */
export function isTenantOwnedTable(tableName: string): tableName is TenantOwnedTable {
  return TENANT_OWNED_TABLES.includes(tableName as TenantOwnedTable);
}

/**
 * Options for tenant query
 */
export interface TenantQueryOptions {
  /** Bypass tenant filtering (ONLY for platform admin debug pages) */
  bypassTenantFilter?: boolean;
}

/**
 * Context for tenant filtering - must be passed by the calling component
 * This is the SINGLE SOURCE OF TRUTH for tenant filtering decisions.
 */
export interface TenantContext {
  tenantId: string | null;
  shouldFilter: boolean;
  /** Platform admin flag - if true AND showAllTenants is true, bypass filtering */
  isPlatformAdmin?: boolean;
  /** Show all tenants toggle - only effective for platform admins */
  showAllTenants?: boolean;
}

/**
 * Determines if tenant filtering should be applied.
 * This is the SINGLE SOURCE OF TRUTH for filtering logic.
 * 
 * Returns true (apply filter) when:
 * - shouldFilter is true AND
 * - tenantId exists AND
 * - NOT (isPlatformAdmin AND showAllTenants)
 */
export function shouldApplyTenantFilter(context: TenantContext): boolean {
  // Platform admin with "All Tenants" enabled bypasses filtering
  if (context.isPlatformAdmin && context.showAllTenants) {
    return false;
  }
  // Apply filter when shouldFilter is true and tenantId exists
  return context.shouldFilter && !!context.tenantId;
}

/**
 * Creates a tenant-scoped query builder.
 * 
 * For tenant-owned tables, this automatically applies the tenant_id filter
 * unless bypassTenantFilter is true (for platform admin debug pages).
 * 
 * @param tableName - The table to query
 * @param context - The tenant context from useTenantFilter()
 * @param options - Query options including bypass flag
 * @returns A Supabase query builder with tenant filtering applied
 * 
 * @example
 * const { tenantId, shouldFilter } = useTenantFilter();
 * const { data } = await tenantQuery("vehicles", { tenantId, shouldFilter }).select("*");
 */
export function tenantQuery<T extends string>(
  tableName: T,
  context: TenantContext,
  options: TenantQueryOptions = {}
) {
  const query = supabase.from(tableName as any);
  
  // Check if this is a tenant-owned table that needs filtering
  // Use shouldApplyTenantFilter as the SINGLE SOURCE OF TRUTH
  const applyFilter = isTenantOwnedTable(tableName) && 
                      !options.bypassTenantFilter && 
                      shouldApplyTenantFilter(context);
  
  if (applyFilter && context.tenantId) {
    // Return a query builder that will automatically have tenant filter applied
    return {
      select: (columns?: string, opts?: Parameters<typeof query.select>[1]) => 
        query.select(columns, opts).eq("tenant_id", context.tenantId!),
      insert: (values: any, opts?: any) => 
        query.insert(values, opts),
      update: (values: any, opts?: any) => 
        query.update(values, opts).eq("tenant_id", context.tenantId!),
      delete: (opts?: any) => 
        query.delete(opts).eq("tenant_id", context.tenantId!),
      upsert: (values: any, opts?: any) => 
        query.upsert(values, opts),
    };
  }
  
  // For non-tenant tables or when filtering is bypassed, return the raw query
  return {
    select: (columns?: string, options?: Parameters<typeof query.select>[1]) => 
      query.select(columns, options),
    insert: (values: any, options?: any) => 
      query.insert(values, options),
    update: (values: any, options?: any) => 
      query.update(values, options),
    delete: (options?: any) => 
      query.delete(options),
    upsert: (values: any, options?: any) => 
      query.upsert(values, options),
  };
}

/**
 * Apply tenant filter to an existing query builder.
 * Use this when you need more control over the query construction.
 * Uses shouldApplyTenantFilter as the SINGLE SOURCE OF TRUTH.
 * 
 * @param query - An existing Supabase query builder
 * @param context - The tenant context from useTenantFilter()
 * @returns The query with tenant filter applied (if applicable)
 * 
 * @example
 * const { tenantId, shouldFilter, isPlatformAdmin, showAllTenants } = useTenantFilter();
 * let query = supabase.from("vehicles").select("*").eq("status", "active");
 * query = applyTenantFilter(query, { tenantId, shouldFilter, isPlatformAdmin, showAllTenants });
 */
export function applyTenantFilter<T>(
  query: T,
  context: TenantContext
): T {
  if (shouldApplyTenantFilter(context) && context.tenantId) {
    return (query as any).eq("tenant_id", context.tenantId);
  }
  return query;
}

/**
 * Ensures tenant_id is included in insert data.
 * Use this when inserting records to tenant-owned tables.
 * 
 * @param data - The data to insert
 * @param tenantId - The current tenant ID
 * @returns The data with tenant_id added
 * @throws Error if tenantId is null
 * 
 * @example
 * const { tenantId } = useTenantFilter();
 * const insertData = withTenantId({ name: "New Vehicle" }, tenantId);
 * await supabase.from("vehicles").insert(insertData);
 */
export function withTenantId<T extends Record<string, any>>(
  data: T,
  tenantId: string | null
): T & { tenant_id: string } {
  if (!tenantId) {
    throw new Error("Cannot insert record: No tenant selected");
  }
  return { ...data, tenant_id: tenantId };
}

/**
 * DEV MODE ONLY: Regression guard to warn about direct supabase.from() calls
 * on tenant-owned tables. Call this once at app initialization.
 */
export function installTenantQueryGuard() {
  if (import.meta.env.PROD) return; // Only in development
  
  const originalFrom = supabase.from.bind(supabase);
  
  (supabase as any).from = function(tableName: string) {
    if (isTenantOwnedTable(tableName)) {
      // Check if called from tenantQuery by looking at stack
      const stack = new Error().stack || "";
      const isFromTenantQuery = stack.includes("tenantQuery.ts");
      
      if (!isFromTenantQuery) {
        console.warn(
          `⚠️ TENANT ISOLATION WARNING: Direct supabase.from("${tableName}") call detected!\n` +
          `Use tenantQuery("${tableName}", context) or applyTenantFilter() instead.\n` +
          `Stack trace:`,
          stack.split("\n").slice(2, 6).join("\n")
        );
      }
    }
    return originalFrom(tableName);
  };
  
  console.info("🔒 Tenant query guard installed (dev mode only)");
}
