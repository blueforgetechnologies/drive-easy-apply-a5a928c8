/**
 * Hook for tenant-scoped Load Hunter counts
 * 
 * Provides match counts that:
 * - Reset to 0 immediately on tenant switch
 * - Include tenantId in query keys for proper cache invalidation
 * - Query the unreviewed_matches view with tenant filtering
 */

import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "./useTenantFilter";

interface LoadHunterCounts {
  unreviewedCount: number;
  skippedCount: number;
  bidCount: number;
  bookedCount: number;
  missedCount: number;
  isLoading: boolean;
}

/**
 * Get tenant-scoped Load Hunter match counts for badges
 */
export function useLoadHunterCounts(): LoadHunterCounts {
  const { tenantId, shouldFilter, isPlatformAdmin, showAllTenants } = useTenantFilter();
  
  const isReady = !shouldFilter || !!tenantId;

  const queryKey = [
    "tenant-load-hunter-counts",
    tenantId,
    shouldFilter,
    isPlatformAdmin,
    showAllTenants,
  ];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!isReady) {
        return { unreviewedCount: 0, skippedCount: 0, bidCount: 0, bookedCount: 0, missedCount: 0 };
      }

      // Query unreviewed matches with tenant filter
      // The view now includes tenant_id from hunt_plans
      let unreviewedQuery = supabase
        .from("unreviewed_matches")
        .select("match_id", { count: "exact", head: true });
      
      if (shouldFilter && tenantId) {
        unreviewedQuery = unreviewedQuery.eq("tenant_id", tenantId);
      }
      
      const { count: unreviewedCount } = await unreviewedQuery;

      // Query other match statuses from load_hunt_matches
      // Join to hunt_plans for tenant_id
      let baseQuery = supabase.from("load_hunt_matches");
      
      // Skipped
      let skippedQuery = baseQuery
        .select("id, hunt_plans!inner(tenant_id)", { count: "exact", head: true })
        .eq("match_status", "skipped");
      if (shouldFilter && tenantId) {
        skippedQuery = skippedQuery.eq("hunt_plans.tenant_id", tenantId);
      }
      const { count: skippedCount } = await skippedQuery;

      // Bid
      let bidQuery = supabase.from("load_hunt_matches")
        .select("id, hunt_plans!inner(tenant_id)", { count: "exact", head: true })
        .eq("match_status", "bid");
      if (shouldFilter && tenantId) {
        bidQuery = bidQuery.eq("hunt_plans.tenant_id", tenantId);
      }
      const { count: bidCount } = await bidQuery;

      // Booked
      let bookedQuery = supabase.from("load_hunt_matches")
        .select("id, hunt_plans!inner(tenant_id)", { count: "exact", head: true })
        .eq("match_status", "booked");
      if (shouldFilter && tenantId) {
        bookedQuery = bookedQuery.eq("hunt_plans.tenant_id", tenantId);
      }
      const { count: bookedCount } = await bookedQuery;

      // Missed - query missed_loads_history with hunt_plans join
      let missedQuery = supabase.from("missed_loads_history")
        .select("id, hunt_plans!inner(tenant_id)", { count: "exact", head: true });
      if (shouldFilter && tenantId) {
        missedQuery = missedQuery.eq("hunt_plans.tenant_id", tenantId);
      }
      const { count: missedCount } = await missedQuery;

      return {
        unreviewedCount: unreviewedCount ?? 0,
        skippedCount: skippedCount ?? 0,
        bidCount: bidCount ?? 0,
        bookedCount: bookedCount ?? 0,
        missedCount: missedCount ?? 0,
      };
    },
    enabled: isReady,
    placeholderData: { unreviewedCount: 0, skippedCount: 0, bidCount: 0, bookedCount: 0, missedCount: 0 },
    staleTime: 15_000, // Refresh more frequently for real-time feel
    refetchOnWindowFocus: true,
  });

  return {
    unreviewedCount: data?.unreviewedCount ?? 0,
    skippedCount: data?.skippedCount ?? 0,
    bidCount: data?.bidCount ?? 0,
    bookedCount: data?.bookedCount ?? 0,
    missedCount: data?.missedCount ?? 0,
    isLoading,
  };
}
