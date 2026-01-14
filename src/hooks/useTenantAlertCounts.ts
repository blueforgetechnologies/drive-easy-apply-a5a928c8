/**
 * Hook for tenant-scoped alert counts (badges)
 * 
 * Provides centralized, tenant-aware alert counts that:
 * - Reset to 0 immediately on tenant switch
 * - Include tenantId in query keys for proper cache invalidation
 * - Use tenantQuery for proper tenant isolation
 */

import { useQuery } from "@tanstack/react-query";
import { useTenantQuery } from "./useTenantQuery";

interface AlertCounts {
  vehicleAlerts: number;
  carrierAlerts: number;
  totalBusinessAlerts: number;
  isLoading: boolean;
}

/**
 * Get tenant-scoped alert counts for badges
 * 
 * @example
 * const { vehicleAlerts, carrierAlerts, totalBusinessAlerts, isLoading } = useTenantAlertCounts();
 */
export function useTenantAlertCounts(): AlertCounts {
  const { query, tenantId, shouldFilter, isPlatformAdmin, isReady } = useTenantQuery();

  // Create a stable query key that includes all tenant context
  const queryKey = [
    "tenant-alert-counts",
    tenantId,
    shouldFilter,
    isPlatformAdmin,
  ];

  const { data, isLoading } = useQuery({
    queryKey,
    queryFn: async () => {
      // If not ready (no tenant selected and should filter), return zeros
      if (!isReady) {
        return { vehicleAlerts: 0, carrierAlerts: 0 };
      }

      // Load vehicle alerts with tenant scoping
      const { data: vehicles } = await query("vehicles")
        .select("oil_change_remaining, insurance_expiry, registration_expiry")
        .eq("status", "active");

      let vehicleCount = 0;
      if (vehicles) {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        vehicles.forEach((vehicle: any) => {
          // Oil change due or overdue
          if (vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining <= 0) {
            vehicleCount++;
          }
          // Insurance expired
          if (vehicle.insurance_expiry) {
            const insuranceDate = new Date(vehicle.insurance_expiry);
            insuranceDate.setHours(0, 0, 0, 0);
            if (insuranceDate < today) {
              vehicleCount++;
            }
          }
          // Registration expired
          if (vehicle.registration_expiry) {
            const registrationDate = new Date(vehicle.registration_expiry);
            registrationDate.setHours(0, 0, 0, 0);
            if (registrationDate < today) {
              vehicleCount++;
            }
          }
        });
      }

      // Load carrier alerts (NOT AUTHORIZED status for active/pending carriers)
      const { data: carriers } = await query("carriers")
        .select("safer_status, status")
        .in("status", ["active", "pending"]);

      let carrierCount = 0;
      if (carriers) {
        carrierCount = carriers.filter(
          (carrier: any) => carrier.safer_status?.toUpperCase().includes("NOT AUTHORIZED")
        ).length;
      }

      return { vehicleAlerts: vehicleCount, carrierAlerts: carrierCount };
    },
    enabled: isReady,
    // Reset to zeros while loading/refetching after tenant switch
    placeholderData: { vehicleAlerts: 0, carrierAlerts: 0 },
    staleTime: 30_000, // Consider fresh for 30 seconds
    refetchOnWindowFocus: true,
  });

  return {
    vehicleAlerts: data?.vehicleAlerts ?? 0,
    carrierAlerts: data?.carrierAlerts ?? 0,
    totalBusinessAlerts: (data?.vehicleAlerts ?? 0) + (data?.carrierAlerts ?? 0),
    isLoading,
  };
}
