/**
 * Hook for tenant-scoped Load Hunter counts
 * 
 * Provides match counts that:
 * - Reset to 0 immediately on tenant switch
 * - Include tenantId + epoch in query keys for proper cache invalidation
 * - Query the unreviewed_matches view with tenant filtering
 * 
 * SECURITY: Tenant filtering is ALWAYS ON. No bypass.
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
  const { tenantId, shouldFilter, tenantEpoch } = useTenantFilter();
  
  // Only ready when we have a tenant
  const isReady = !!tenantId;

  // Query key includes tenantId and epoch for cache invalidation on switch
  const queryKey = ["load-hunter-counts", tenantId, tenantEpoch];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!isReady || !tenantId) {
        return { unreviewedCount: 0, skippedCount: 0, bidCount: 0, bookedCount: 0, missedCount: 0 };
      }

      console.log(`[LoadHunterCounts] Fetching for tenant: ${tenantId}, epoch: ${tenantEpoch}`);

      // Query unreviewed matches with tenant filter - ALWAYS
      const { count: unreviewedCount } = await supabase
        .from("unreviewed_matches")
        .select("match_id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);

      // Skipped - join to hunt_plans for tenant_id
      const { count: skippedCount } = await supabase
        .from("load_hunt_matches")
        .select("id, hunt_plans!inner(tenant_id)", { count: "exact", head: true })
        .eq("match_status", "skipped")
        .eq("hunt_plans.tenant_id", tenantId);

      // Bid
      const { count: bidCount } = await supabase
        .from("load_hunt_matches")
        .select("id, hunt_plans!inner(tenant_id)", { count: "exact", head: true })
        .eq("match_status", "bid")
        .eq("hunt_plans.tenant_id", tenantId);

      // Booked
      const { count: bookedCount } = await supabase
        .from("load_hunt_matches")
        .select("id, hunt_plans!inner(tenant_id)", { count: "exact", head: true })
        .eq("match_status", "booked")
        .eq("hunt_plans.tenant_id", tenantId);

      // Missed
      const { count: missedCount } = await supabase
        .from("missed_loads_history")
        .select("id, hunt_plans!inner(tenant_id)", { count: "exact", head: true })
        .eq("hunt_plans.tenant_id", tenantId);

      console.log(`[LoadHunterCounts] Results: unreviewed=${unreviewedCount}, skipped=${skippedCount}, bid=${bidCount}, booked=${bookedCount}, missed=${missedCount}`);

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
    staleTime: 15_000, // Refresh frequently for real-time feel
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
