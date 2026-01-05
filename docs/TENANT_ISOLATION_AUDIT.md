# Tenant Isolation Audit Report

**Date:** 2026-01-05  
**Auditor:** Lovable AI Security Analysis

---

## Executive Summary

This audit examines tenant data isolation across the application's Edge Functions and client-side code. The goal is to ensure no cross-tenant data leakage is possible, even with client-side tampering.

---

## 1. Edge Function Inventory

### ✅ SECURE - Properly Gated Functions

These functions correctly implement tenant isolation:

| Function | Gate Method | Notes |
|----------|-------------|-------|
| `sync-vehicles-samsara` | `assertTenantAccess()` | Validates membership before any query |
| `inspector-tenants` | `assertPlatformAdmin()` | Admin-only, returns aggregate data |
| `inspector-feature-flags` | `assertFeatureEnabled()` | Feature-gated |
| `send-bid-email` | `assertFeatureEnabled()` | Derives tenant from JWT |
| `parse-freight-dimensions` | `assertFeatureEnabled()` | Feature-gated with tenant context |
| `debug-tenant-data` | Platform admin check | Validates `is_platform_admin` before queries |

### ⚠️ SCHEDULED JOBS - Intentionally Global

These run via cron with service role and process all tenants by design:

| Function | Tables Accessed | Risk Level | Notes |
|----------|-----------------|------------|-------|
| `capture-vehicle-locations` | `vehicles`, `vehicle_location_history` | LOW | Writes only, no cross-tenant reads |
| `archive-old-emails` | `load_emails`, `load_emails_archive` | LOW | Time-based cleanup |
| `reset-missed-loads` | `load_hunt_matches`, `load_emails` | LOW | Resets status flags only |
| `snapshot-email-volume` | `email_volume_stats` | LOW | Analytics aggregation |
| `cleanup-stale-data` | Various | LOW | Maintenance job |

### 🔴 RISKY - Needs Review

These functions access tenant data without proper scoping:

| Function | Risk | Issue |
|----------|------|-------|
| `ai-update-customers` | HIGH | Fetches 100 most recent `load_emails` globally, creates/updates `customers` without tenant_id |
| `send-spend-alert` | MEDIUM | Fetches all `spend_alerts` globally |
| `fetch-gmail-loads` | MEDIUM | Processes emails globally, though writes include tenant context |

---

## 2. Client-Side Raw Queries

### 🔴 Files Bypassing `useTenantQuery`

These files use raw `supabase.from()` on tenant-owned tables instead of the centralized query helper:

| File | Line | Table(s) | Manual Filter? |
|------|------|----------|----------------|
| `src/pages/VehiclesTab.tsx` | 146 | `vehicles` | ✅ Yes |
| `src/pages/LoadApprovalTab.tsx` | 712 | `loads` | ❌ No (relies on RLS) |
| `src/pages/MaintenanceTab.tsx` | 161 | `maintenance_records` | ✅ Yes |
| `src/pages/PayeesTab.tsx` | 131-145 | `dispatchers`, `applications`, `carriers` | ✅ Yes |
| `src/pages/FleetFinancialsTab.tsx` | 282-299 | `vehicles`, `carriers`, `dispatchers`, `customers` | ✅ Yes |
| `src/pages/LocationsTab.tsx` | 45-104 | `locations` | ✅ Yes |
| `src/hooks/useLoadHunterCounts.ts` | 60-91 | `load_hunt_matches`, `missed_loads_history` | ✅ Via join |
| `src/components/LoadEmailDetail.tsx` | 316, 566 | `dispatchers`, `carriers` | ❌ No |
| `src/pages/LoadHunterTab.tsx` | 801-804 | `load_emails`, `vehicles` | ❌ Relies on IDs |

### ✅ Files Using Proper Pattern

| File | Notes |
|------|-------|
| `src/pages/LoadsTab.tsx` | Uses `query()` from `useTenantQuery` |

---

## 3. Shared Helpers Assessment

### `_shared/assertTenantAccess.ts` - ✅ SECURE

- Validates JWT via anon-key client
- Checks tenant membership via service role
- Platform admins can access any tenant
- Returns pre-built 401/403 responses

### `_shared/assertFeatureEnabled.ts` - ✅ SECURE

- Derives tenant_id from JWT (never trusts client)
- Checks feature flags, plan constraints, release channel
- Platform admin can override tenant for testing only

### `_shared/deriveTenantFromJWT.ts` - ✅ SECURE

- Extracts user from JWT
- Looks up first active tenant membership
- Returns server-derived tenant_id

---

## 4. Tenant Isolation Checklist

Use this checklist to verify tenant isolation after deployment:

### Edge Functions

- [ ] **1.** Every Edge Function that accepts `tenant_id` calls `assertTenantAccess()` first
- [ ] **2.** Tenant ID is derived server-side via `deriveTenantFromJWT()` when not provided
- [ ] **3.** No service-role query omits `.eq('tenant_id', ...)` on tenant-owned tables
- [ ] **4.** Scheduled jobs that process all tenants are documented and intentional
- [ ] **5.** `ai-update-customers` is tenant-scoped or disabled for multi-tenant

### Client-Side

- [ ] **6.** All client queries for tenant-owned tables use `useTenantQuery().query()` or `tenantQuery()`
- [ ] **7.** `installTenantQueryGuard()` is called in `main.tsx` to warn on violations in dev
- [ ] **8.** Raw `supabase.from()` calls on `TENANT_OWNED_TABLES` have been migrated
- [ ] **9.** Queries wait for `isReady` (tenant context resolved) before executing
- [ ] **10.** Tenant switch clears all local state (lists, maps, cached data)

### RLS Verification

- [ ] **11.** All tables in `TENANT_OWNED_TABLES` have RLS enabled
- [ ] **12.** RLS policies include `tenant_id = auth.jwt()->>'tenant_id'` or membership check
- [ ] **13.** No RLS policy uses `true` for SELECT without additional constraints
- [ ] **14.** Test: Insert row with wrong tenant_id via service role, verify RLS blocks anon read

### All Tenants Mode

- [ ] **15.** "All Tenants" toggle only visible for platform admins in internal channel
- [ ] **16.** `showAllTenants` state resets on tenant switch
- [ ] **17.** Backend never accepts client-provided bypass flag

---

## 5. Recommendations

### Immediate Actions

1. **Migrate raw queries**: Convert all files in Section 2 to use `useTenantQuery()`
2. **Fix ai-update-customers**: Add tenant_id to customer inserts/updates
3. **Audit LoadEmailDetail**: Add tenant context to dispatcher/carrier lookups

### Medium-Term

1. Add integration tests that attempt cross-tenant access
2. Enable RLS audit logging for 403 events
3. Add server-side tenant_id validation to all write operations

### Long-Term

1. Implement tenant_id as a database default via RLS policy
2. Consider database-level row security events for monitoring
3. Add automated tenant isolation regression tests to CI

---

## 6. Dev Debug Banner

The `TenantDebugBanner` component now displays:

- **effectiveTenant**: Current tenant name/slug
- **shouldFilter**: Whether tenant filtering is active
- **showAllTenants**: Whether bypass mode is enabled (admin only)
- **isPlatformAdmin**: Platform admin status
- **isImpersonating**: Whether viewing via impersonation
- **release_channel**: Current tenant's release channel

This provides full visibility into tenant context for debugging isolation issues.

---

## Appendix: TENANT_OWNED_TABLES

From `src/lib/tenantQuery.ts`:

```typescript
export const TENANT_OWNED_TABLES = [
  "vehicles", "loads", "load_documents", "load_expenses", "load_stops",
  "load_hunt_matches", "load_emails", "customers", "carriers", "payees",
  "dispatchers", "drivers", "locations", "applications", "driver_invites",
  "invoices", "invoice_loads", "expenses", "settlements", "hunt_plans",
  "contacts", "maintenance_records", "company_profile", "invites",
  "custom_roles", "role_permissions", "user_custom_roles",
  "tenant_integrations", "vehicle_integrations", "tenant_preferences",
  "load_bids", "match_action_history", "map_load_tracking", "audit_logs",
  "tenant_feature_access"
] as const;
```
