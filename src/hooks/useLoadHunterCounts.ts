/**
 * Hook for tenant-scoped Load Hunter counts
 * 
 * Provides match counts that:
 * - Reset to 0 immediately on tenant switch
 * - Include tenantId + epoch in query keys for proper cache invalidation
 * - Query the unreviewed_matches view with tenant filtering
 * - Filter by dispatcher's vehicles when in MY TRUCKS mode
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

interface UseLoadHunterCountsOptions {
  /** When 'dispatch', filter counts to only include the dispatcher's assigned vehicles */
  activeMode?: 'admin' | 'dispatch';
  /** List of vehicle IDs assigned to the current dispatcher */
  myVehicleIds?: string[];
}

/**
 * Get tenant-scoped Load Hunter match counts for badges
 * 
 * @param options - Optional filtering options for MY TRUCKS mode
 */
export function useLoadHunterCounts(options: UseLoadHunterCountsOptions = {}): LoadHunterCounts {
  const { activeMode = 'admin', myVehicleIds = [] } = options;
  const { tenantId, tenantEpoch } = useTenantFilter();
  
  // Only ready when we have a tenant
  const isReady = !!tenantId;
  
  // In dispatch mode, we also need vehicle IDs to be loaded
  const isDispatchMode = activeMode === 'dispatch';
  const hasVehicleFilter = isDispatchMode && myVehicleIds.length > 0;

  // Query key includes tenantId, epoch, and mode/vehicles for cache invalidation
  const queryKey = [
    "load-hunter-counts", 
    tenantId, 
    tenantEpoch, 
    activeMode, 
    isDispatchMode ? myVehicleIds.join(',') : 'all'
  ];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!isReady || !tenantId) {
        return { unreviewedCount: 0, skippedCount: 0, bidCount: 0, bookedCount: 0, missedCount: 0 };
      }

      // In dispatch mode with no vehicles, return zeros
      if (isDispatchMode && myVehicleIds.length === 0) {
        return { unreviewedCount: 0, skippedCount: 0, bidCount: 0, bookedCount: 0, missedCount: 0 };
      }

      console.log(`[LoadHunterCounts] Fetching for tenant: ${tenantId}, mode: ${activeMode}, vehicles: ${isDispatchMode ? myVehicleIds.length : 'all'}`);

      // Build base query with optional vehicle filter
      const buildQuery = (baseQuery: any) => {
        if (hasVehicleFilter) {
          return baseQuery.in("vehicle_id", myVehicleIds);
        }
        return baseQuery;
      };

      // Query unreviewed matches with tenant filter
      // NOTE: unreviewed_matches view uses `id` as the primary identifier (not `match_id`).
      let unreviewedQuery = supabase
        .from("unreviewed_matches")
        .select("id", { count: "exact", head: true })
        .eq("tenant_id", tenantId);
      if (hasVehicleFilter) {
        unreviewedQuery = unreviewedQuery.in("vehicle_id", myVehicleIds);
      }
      const { count: unreviewedCount } = await unreviewedQuery;

      // Skipped - uses direct tenant_id column
      let skippedQuery = supabase
        .from("load_hunt_matches")
        .select("id", { count: "exact", head: true })
        .eq("match_status", "skipped")
        .eq("tenant_id", tenantId);
      if (hasVehicleFilter) {
        skippedQuery = skippedQuery.in("vehicle_id", myVehicleIds);
      }
      const { count: skippedCount } = await skippedQuery;

      // Bid - uses direct tenant_id column
      let bidQuery = supabase
        .from("load_hunt_matches")
        .select("id", { count: "exact", head: true })
        .eq("match_status", "bid")
        .eq("tenant_id", tenantId);
      if (hasVehicleFilter) {
        bidQuery = bidQuery.in("vehicle_id", myVehicleIds);
      }
      const { count: bidCount } = await bidQuery;

      // Booked - uses direct tenant_id column
      let bookedQuery = supabase
        .from("load_hunt_matches")
        .select("id", { count: "exact", head: true })
        .eq("match_status", "booked")
        .eq("tenant_id", tenantId);
      if (hasVehicleFilter) {
        bookedQuery = bookedQuery.in("vehicle_id", myVehicleIds);
      }
      const { count: bookedCount } = await bookedQuery;

      // Missed - join to hunt_plans for tenant_id (missed_loads_history doesn't have tenant_id)
      let missedQuery = supabase
        .from("missed_loads_history")
        .select("id, vehicle_id, hunt_plans!inner(tenant_id)", { count: "exact", head: true })
        .eq("hunt_plans.tenant_id", tenantId);
      if (hasVehicleFilter) {
        missedQuery = missedQuery.in("vehicle_id", myVehicleIds);
      }
      const { count: missedCount } = await missedQuery;

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
