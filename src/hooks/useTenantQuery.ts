/**
 * Hook for tenant-scoped queries
 * 
 * Provides a convenient way to get tenant-scoped query builders
 * that automatically apply tenant_id filtering.
 */

import { useTenantFilter } from "./useTenantFilter";
import { tenantQuery, applyTenantFilter, withTenantId, isTenantOwnedTable, TENANT_OWNED_TABLES } from "@/lib/tenantQuery";
import type { TenantOwnedTable } from "@/lib/tenantQuery";

interface UseTenantQueryResult {
  /**
   * Create a tenant-scoped query for a table.
   * Automatically applies tenant_id filter for tenant-owned tables.
   */
  query: <T extends string>(tableName: T, options?: { bypassTenantFilter?: boolean }) => ReturnType<typeof tenantQuery>;
  
  /**
   * Apply tenant filter to an existing query builder.
   */
  filter: <T>(query: T) => T;
  
  /**
   * Add tenant_id to insert data.
   */
  withTenant: <T extends Record<string, any>>(data: T) => T & { tenant_id: string };
  
  /**
   * The current tenant ID (null if none selected).
   */
  tenantId: string | null;
  
  /**
   * Whether queries should filter by tenant.
   */
  shouldFilter: boolean;
  
  /**
   * Whether current user is a platform admin.
   */
  isPlatformAdmin: boolean;
  
  /**
   * Whether "show all tenants" is enabled (platform admin only).
   */
  showAllTenants: boolean;
  
  /**
   * Whether tenant is ready (has ID and should filter, or bypass is allowed).
   */
  isReady: boolean;
}

/**
 * Hook that provides tenant-scoped query utilities.
 * 
 * @example
 * const { query, withTenant, tenantId, isReady } = useTenantQuery();
 * 
 * // Wait for tenant to be ready before querying
 * if (!isReady) return <Loading />;
 * 
 * // Query with automatic tenant filtering
 * const { data } = await query("vehicles").select("*").eq("status", "active");
 * 
 * // Insert with tenant_id
 * await supabase.from("vehicles").insert(withTenant({ vehicle_number: "123" }));
 */
export function useTenantQuery(): UseTenantQueryResult {
  const { tenantId, shouldFilter, isPlatformAdmin, showAllTenants } = useTenantFilter();
  
  const context = { tenantId, shouldFilter };
  
  return {
    query: (tableName, options) => tenantQuery(tableName, context, options),
    filter: (query) => applyTenantFilter(query, context),
    withTenant: (data) => withTenantId(data, tenantId),
    tenantId,
    shouldFilter,
    isPlatformAdmin,
    showAllTenants,
    isReady: !shouldFilter || !!tenantId,
  };
}

// Re-export for convenience
export { TENANT_OWNED_TABLES, isTenantOwnedTable };
export type { TenantOwnedTable };
