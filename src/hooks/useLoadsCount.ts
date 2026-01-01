/**
 * Hook for tenant-scoped loads count
 * 
 * Provides load counts that:
 * - Reset to 0 immediately on tenant switch
 * - Include tenantId in query keys for proper cache invalidation
 * - Use tenantQuery for proper tenant isolation
 */

import { useQuery } from "@tanstack/react-query";
import { useTenantQuery } from "./useTenantQuery";

interface LoadsCounts {
  activeLoads: number;
  pendingLoads: number;
  deliveredLoads: number;
  totalLoads: number;
  isLoading: boolean;
}

/**
 * Get tenant-scoped loads counts for badges
 */
export function useLoadsCount(): LoadsCounts {
  const { query, tenantId, shouldFilter, isPlatformAdmin, showAllTenants, isReady } = useTenantQuery();

  const queryKey = [
    "tenant-loads-count",
    tenantId,
    shouldFilter,
    isPlatformAdmin,
    showAllTenants,
  ];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!isReady) {
        return { activeLoads: 0, pendingLoads: 0, deliveredLoads: 0, totalLoads: 0 };
      }

      // Get loads with different statuses
      const { data: loads } = await query("loads")
        .select("status");

      if (!loads) {
        return { activeLoads: 0, pendingLoads: 0, deliveredLoads: 0, totalLoads: 0 };
      }

      const activeLoads = loads.filter((l: any) => 
        ['dispatched', 'in_transit', 'at_pickup', 'at_delivery'].includes(l.status)
      ).length;
      
      const pendingLoads = loads.filter((l: any) => 
        ['pending', 'quoted', 'booked'].includes(l.status)
      ).length;
      
      const deliveredLoads = loads.filter((l: any) => 
        l.status === 'delivered'
      ).length;

      return {
        activeLoads,
        pendingLoads,
        deliveredLoads,
        totalLoads: loads.length,
      };
    },
    enabled: isReady,
    placeholderData: { activeLoads: 0, pendingLoads: 0, deliveredLoads: 0, totalLoads: 0 },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  return {
    activeLoads: data?.activeLoads ?? 0,
    pendingLoads: data?.pendingLoads ?? 0,
    deliveredLoads: data?.deliveredLoads ?? 0,
    totalLoads: data?.totalLoads ?? 0,
    isLoading,
  };
}
