/**
 * Prefetch map for lazy-loaded dashboard pages.
 *
 * Each key matches a nav tab `value` in DashboardLayout.
 * Calling the function triggers the dynamic import so the browser
 * downloads the chunk in the background (idle priority).
 *
 * Once a chunk has been requested the browser caches it,
 * so subsequent `React.lazy(() => import(...))` calls resolve instantly.
 */

const chunkImporters: Record<string, () => Promise<unknown>> = {
  "map": () => import("@/pages/MapTab"),
  "load-hunter": () => import("@/pages/LoadHunterTab"),
  "loads": () => import("@/pages/LoadsTab"),
  "fleet-financials": () => import("@/pages/FleetFinancialsTab"),
  "carrier-dashboard": () => import("@/pages/CarrierDashboard"),
  "business": () => import("@/pages/BusinessManagerTab"),
  "accounting": () => import("@/pages/AccountingTab"),
  "analytics": () => import("@/pages/LoadAnalyticsTab"),
  "maintenance": () => import("@/pages/MaintenanceTab"),
  "usage": () => import("@/pages/UsageTab"),
  "development": () => import("@/pages/DevelopmentTab"),
  "settings": () => import("@/pages/SettingsTab"),
  "tools": () => import("@/pages/ToolsTab"),
};

const prefetched = new Set<string>();

/**
 * Prefetch a single tab's JS chunk (no-op if already prefetched).
 */
export function prefetchTab(tabValue: string) {
  if (prefetched.has(tabValue)) return;
  const importer = chunkImporters[tabValue];
  if (!importer) return;
  prefetched.add(tabValue);
  // Use requestIdleCallback so we don't block the main thread
  const schedule = typeof requestIdleCallback === "function" ? requestIdleCallback : setTimeout;
  schedule(() => {
    importer().catch(() => {
      // If prefetch fails (e.g. offline), allow retry later
      prefetched.delete(tabValue);
    });
  });
}

/**
 * Prefetch all tabs that are currently visible in the nav bar.
 * Called once after DashboardLayout mounts and gates resolve.
 */
export function prefetchVisibleTabs(tabValues: string[]) {
  for (const value of tabValues) {
    prefetchTab(value);
  }
}
