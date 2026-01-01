import { useTenantContext } from "@/contexts/TenantContext";

/**
 * Simple hook to get the effective tenant ID for queries.
 * Returns the impersonated tenant ID if impersonating, otherwise the current tenant ID.
 * Returns null if no tenant is selected.
 * 
 * Usage in queries:
 * const tenantId = useTenantId();
 * const { data } = await supabase.from('loads').select().eq('tenant_id', tenantId);
 */
export function useTenantId(): string | null {
  const { effectiveTenant } = useTenantContext();
  return effectiveTenant?.id ?? null;
}

/**
 * Hook that returns effective tenant ID or throws if none selected.
 * Use this when you're inside a TenantRequired wrapper.
 */
export function useRequiredTenantId(): string {
  const { effectiveTenant } = useTenantContext();
  if (!effectiveTenant) {
    throw new Error('No tenant selected. This component must be wrapped in TenantRequired.');
  }
  return effectiveTenant.id;
}
