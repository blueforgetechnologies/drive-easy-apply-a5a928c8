/**
 * Hook for tenant-scoped queries
 * 
 * Provides a convenient way to get tenant-scoped query builders
 * that automatically apply tenant_id filtering.
 * 
 * SECURITY: Tenant filtering is ALWAYS ON for normal screens.
 * There is no bypass capability in this hook.
 */

import { useTenantFilter } from "./useTenantFilter";
import { tenantQuery, applyTenantFilter, withTenantId, isTenantOwnedTable, TENANT_OWNED_TABLES } from "@/lib/tenantQuery";
import type { TenantOwnedTable } from "@/lib/tenantQuery";

interface UseTenantQueryResult {
  /**
   * Create a tenant-scoped query for a table.
   * Automatically applies tenant_id filter for tenant-owned tables.
   */
  query: <T extends string>(tableName: T) => ReturnType<typeof tenantQuery>;
  
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
   * Whether queries should filter by tenant (always true when tenantId exists).
   */
  shouldFilter: boolean;
  
  /**
   * Whether current user is a platform admin.
   */
  isPlatformAdmin: boolean;
  
  /**
   * Tenant epoch for cache invalidation.
   */
  tenantEpoch: number;
  
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
  const { tenantId, shouldFilter, isPlatformAdmin, isInternalChannel, tenantEpoch } = useTenantFilter();
  
  // Full context passed to all tenant query utilities - SINGLE SOURCE OF TRUTH
  // SECURITY: No bypass options - tenant filtering is always on
  const context = { 
    tenantId, 
    shouldFilter, 
    isPlatformAdmin, 
    isInternalChannel,
  };
  
  return {
    query: (tableName) => tenantQuery(tableName, context),
    filter: (query) => applyTenantFilter(query, context),
    withTenant: (data) => withTenantId(data, tenantId),
    tenantId,
    shouldFilter,
    isPlatformAdmin,
    tenantEpoch,
    isReady: !shouldFilter || !!tenantId,
  };
}

// Re-export for convenience
export { TENANT_OWNED_TABLES, isTenantOwnedTable };
export type { TenantOwnedTable };
