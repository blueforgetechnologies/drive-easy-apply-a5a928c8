/**
 * Global Realtime Count Updates Hook
 * 
 * Subscribes to all relevant database tables and automatically invalidates
 * React Query caches when data changes, enabling live count updates across
 * the entire application.
 * 
 * Tables monitored:
 * - applications: Driver recruitment counts
 * - loads: Load status counts
 * - vehicles: Asset counts
 * - carriers: Carrier counts
 * - payees: Payee counts
 * - dispatchers: Dispatcher counts
 * - customers: Customer counts
 * - invoices: Invoice counts
 * - settlements: Settlement counts
 * - load_hunt_matches: Load hunter counts
 * - driver_invites: Invitation counts
 */

import { useEffect, useRef } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useTenantFilter } from "./useTenantFilter";

interface RealtimeCountsOptions {
  /** Enable/disable the hook */
  enabled?: boolean;
}

// Map of tables to the query keys they should invalidate
const TABLE_QUERY_KEY_MAP: Record<string, string[]> = {
  applications: [
    "business-manager-counts", // Only invalidate counts, not the main applications list
    // Note: "applications" list is handled by ApplicationsManager's own realtime subscription
  ],
  loads: [
    "tenant-loads-count",
    "tenant-accounting-counts-v3",
    "load-hunter-counts",
  ],
  vehicles: [
    "business-manager-counts",
    "tenant-alert-counts",
    "load-hunter-counts",
  ],
  carriers: [
    "business-manager-counts",
    "tenant-alert-counts",
  ],
  payees: [
    "business-manager-counts",
  ],
  dispatchers: [
    "business-manager-counts",
  ],
  customers: [
    "business-manager-counts",
  ],
  invoices: [
    "tenant-accounting-counts-v3",
  ],
  settlements: [
    "tenant-accounting-counts-v3",
  ],
  load_hunt_matches: [
    "load-hunter-counts",
    "load-hunter-data",
  ],
  driver_invites: [
    "driver-invites",
    "pending-invites",
  ],
  // load_emails removed from realtime — uses 30s polling instead
};

// All tables to subscribe to
const MONITORED_TABLES = Object.keys(TABLE_QUERY_KEY_MAP);

/**
 * Hook that subscribes to realtime database changes and invalidates
 * relevant React Query caches for live count updates.
 * 
 * Usage: Call this once in a top-level component (e.g., DashboardLayout)
 */
export function useRealtimeCounts(options: RealtimeCountsOptions = {}) {
  const { enabled = true } = options;
  const queryClient = useQueryClient();
  const { tenantId } = useTenantFilter();
  const channelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);

  useEffect(() => {
    if (!enabled || !tenantId) return;

    // Create a single channel for all table subscriptions
    const channelName = `realtime-counts-${tenantId}`;
    
    // Remove existing channel if any
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }

    const channel = supabase.channel(channelName);

    // Subscribe to each monitored table
    MONITORED_TABLES.forEach((table) => {
      channel.on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table,
          // Filter by tenant where possible (most tables have tenant_id)
          ...(table !== 'load_emails' ? { filter: `tenant_id=eq.${tenantId}` } : {}),
        },
        (payload) => {
          console.log(`[Realtime] ${table} ${payload.eventType}:`, payload.new || payload.old);
          
          // Get the query keys to invalidate for this table
          const queryKeys = TABLE_QUERY_KEY_MAP[table] || [];
          
          // Invalidate all related queries
          queryKeys.forEach((keyPrefix) => {
            queryClient.invalidateQueries({
              predicate: (query) => {
                const key = query.queryKey;
                // Match queries that start with the prefix and include our tenant
                return Array.isArray(key) && 
                  key[0] === keyPrefix && 
                  (key.includes(tenantId) || !key[1]); // Include tenant-scoped or global queries
              },
            });
          });
        }
      );
    });

    // Subscribe to the channel
    channel.subscribe((status) => {
      console.log(`[Realtime] Counts subscription status:`, status);
      if (status === 'SUBSCRIBED') {
        console.log(`[Realtime] Now monitoring ${MONITORED_TABLES.length} tables for live count updates`);
      }
    });

    channelRef.current = channel;

    return () => {
      if (channelRef.current) {
        console.log('[Realtime] Cleaning up counts subscription');
        supabase.removeChannel(channelRef.current);
        channelRef.current = null;
      }
    };
  }, [enabled, tenantId, queryClient]);

  return null; // This hook doesn't return any data
}

/**
 * Convenience hook to get query invalidation function for manual triggers
 */
export function useInvalidateCounts() {
  const queryClient = useQueryClient();
  const { tenantId } = useTenantFilter();

  const invalidateAll = () => {
    // Invalidate all count-related queries
    const allQueryKeys = [
      "business-manager-counts",
      "tenant-loads-count",
      "tenant-accounting-counts-v3",
      "load-hunter-counts",
      "tenant-alert-counts",
      "applications",
    ];

    allQueryKeys.forEach((keyPrefix) => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === keyPrefix;
        },
      });
    });
  };

  const invalidateTable = (table: keyof typeof TABLE_QUERY_KEY_MAP) => {
    const queryKeys = TABLE_QUERY_KEY_MAP[table] || [];
    queryKeys.forEach((keyPrefix) => {
      queryClient.invalidateQueries({
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === keyPrefix;
        },
      });
    });
  };

  return { invalidateAll, invalidateTable };
}
