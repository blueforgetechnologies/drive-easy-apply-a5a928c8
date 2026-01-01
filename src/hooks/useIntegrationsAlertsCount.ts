/**
 * Hook for tenant-scoped integrations alerts count
 * 
 * Provides integration status counts that:
 * - Reset to 0 immediately on tenant switch
 * - Include tenantId in query keys for proper cache invalidation
 * - Query tenant_integrations with tenant filtering
 */

import { useQuery } from "@tanstack/react-query";
import { useTenantQuery } from "./useTenantQuery";

interface IntegrationsAlertsCounts {
  failedIntegrations: number;
  degradedIntegrations: number;
  totalAlerts: number;
  isLoading: boolean;
}

/**
 * Get tenant-scoped integration alerts count for badges
 */
export function useIntegrationsAlertsCount(): IntegrationsAlertsCounts {
  const { query, tenantId, shouldFilter, isPlatformAdmin, showAllTenants, isReady } = useTenantQuery();

  const queryKey = [
    "tenant-integrations-alerts",
    tenantId,
    shouldFilter,
    isPlatformAdmin,
    showAllTenants,
  ];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!isReady) {
        return { failedIntegrations: 0, degradedIntegrations: 0, totalAlerts: 0 };
      }

      // Query tenant_integrations for failed/degraded status
      const { data: integrations } = await query("tenant_integrations")
        .select("sync_status, error_message");

      if (!integrations) {
        return { failedIntegrations: 0, degradedIntegrations: 0, totalAlerts: 0 };
      }

      const failedIntegrations = integrations.filter((i: any) => 
        i.sync_status === 'failed' || i.error_message
      ).length;
      
      const degradedIntegrations = integrations.filter((i: any) => 
        i.sync_status === 'partial'
      ).length;

      return {
        failedIntegrations,
        degradedIntegrations,
        totalAlerts: failedIntegrations + degradedIntegrations,
      };
    },
    enabled: isReady,
    placeholderData: { failedIntegrations: 0, degradedIntegrations: 0, totalAlerts: 0 },
    staleTime: 60_000, // Check less frequently
    refetchOnWindowFocus: true,
  });

  return {
    failedIntegrations: data?.failedIntegrations ?? 0,
    degradedIntegrations: data?.degradedIntegrations ?? 0,
    totalAlerts: data?.totalAlerts ?? 0,
    isLoading,
  };
}
