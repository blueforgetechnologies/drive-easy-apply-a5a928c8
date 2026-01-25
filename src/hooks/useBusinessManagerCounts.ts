/**
 * Hook for tenant-scoped Business Manager entity counts
 */

import { useQuery } from "@tanstack/react-query";
import { useTenantQuery } from "./useTenantQuery";

interface BusinessManagerCounts {
  assets: number;
  carriers: number;
  payees: number;
  drivers: number;
  dispatchers: number;
  customers: number;
  isLoading: boolean;
}

export function useBusinessManagerCounts(): BusinessManagerCounts {
  const { query, tenantId, isReady } = useTenantQuery();

  const queryKey = ["business-manager-counts", tenantId];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      if (!isReady) {
        return { assets: 0, carriers: 0, payees: 0, drivers: 0, dispatchers: 0, customers: 0 };
      }

      // Fetch counts for all entity types in parallel
      const [vehiclesResult, carriersResult, payeesResult, driversResult, dispatchersResult, customersResult] = await Promise.all([
        query("vehicles").select("id", { count: "exact", head: true }),
        query("carriers").select("id", { count: "exact", head: true }),
        query("payees").select("id", { count: "exact", head: true }),
        query("applications").select("id", { count: "exact", head: true }).eq("driver_status", "active"),
        query("dispatchers").select("id", { count: "exact", head: true }),
        query("customers").select("id", { count: "exact", head: true }),
      ]);

      return {
        assets: vehiclesResult.count ?? 0,
        carriers: carriersResult.count ?? 0,
        payees: payeesResult.count ?? 0,
        drivers: driversResult.count ?? 0,
        dispatchers: dispatchersResult.count ?? 0,
        customers: customersResult.count ?? 0,
      };
    },
    enabled: isReady,
    placeholderData: { assets: 0, carriers: 0, payees: 0, drivers: 0, dispatchers: 0, customers: 0 },
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  return {
    assets: data?.assets ?? 0,
    carriers: data?.carriers ?? 0,
    payees: data?.payees ?? 0,
    drivers: data?.drivers ?? 0,
    dispatchers: data?.dispatchers ?? 0,
    customers: data?.customers ?? 0,
    isLoading,
  };
}
