import { useTenantContext } from "@/contexts/TenantContext";

/**
 * Simple hook to get the current tenant ID for queries.
 * Returns null if no tenant is selected.
 * 
 * Usage in queries:
 * const tenantId = useTenantId();
 * const { data } = await supabase.from('loads').select().eq('tenant_id', tenantId);
 */
export function useTenantId(): string | null {
  const { currentTenant } = useTenantContext();
  return currentTenant?.id ?? null;
}

/**
 * Hook that returns tenant ID or throws if none selected.
 * Use this when you're inside a TenantRequired wrapper.
 */
export function useRequiredTenantId(): string {
  const { currentTenant } = useTenantContext();
  if (!currentTenant) {
    throw new Error('No tenant selected. This component must be wrapped in TenantRequired.');
  }
  return currentTenant.id;
}
