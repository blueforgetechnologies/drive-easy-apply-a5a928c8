# Multi-Tenant Architecture Audit Checklist

**Generated:** 2026-01-11

---

## 1. Tenant Isolation Checks

### Database Layer
- [ ] All 50 tenant-owned tables have `tenant_id` column
- [ ] All tables have RLS enabled (currently: ✅ 91/91)
- [ ] RLS policies use `can_access_tenant()` or `is_tenant_member()`
- [ ] No RLS policy uses `USING (true)` for INSERT/UPDATE/DELETE on tenant data
- [ ] Run `tenant-isolation-audit` function for schema + RLS test

### Edge Function Layer
- [ ] All functions validate JWT before using service role
- [ ] `assertTenantAccess()` called for all tenant_id accepting functions
- [ ] Scheduled jobs document their cross-tenant behavior
- [ ] Webhooks derive tenant from trusted source (not request body)

### Client Layer
- [ ] All queries use `useTenantId()` or `useTenantQuery()`
- [ ] Tenant context waits for `isReady` before queries
- [ ] Tenant switch invalidates all cached data

---

## 2. Admin vs Tenant Admin Boundaries

| Capability | Platform Admin | Tenant Admin |
|------------|----------------|--------------|
| Access any tenant | ✅ | ❌ |
| Impersonate tenants | ✅ | ❌ |
| Modify feature flags | ✅ | ❌ |
| Create tenants | ✅ | ❌ |
| Manage own users | ✅ | ✅ |
| Grant feature access | ✅ | ✅ (within tenant) |

---

## 3. Feature Flag Enforcement Points

| Layer | Mechanism | Verified |
|-------|-----------|----------|
| Database | `feature_flags` + `tenant_feature_flags` | ✅ |
| Edge Functions | `assertFeatureEnabled()` | ✅ |
| UI Navigation | `useFeatureGate()` in DashboardLayout | ✅ |
| UI Components | `useFeatureGate()` per feature | ✅ |

---

## 4. Rollout Verification Steps

### Internal → Pilot
1. [ ] Feature tested in Dev Lab (internal)
2. [ ] No console errors
3. [ ] Edge function logs clean
4. [ ] Add channel default: `pilot` → `enabled: true`
5. [ ] Notify pilot tenant users
6. [ ] Monitor for 1-2 weeks

### Pilot → General
1. [ ] 1+ week soak in pilot
2. [ ] No support issues
3. [ ] Performance acceptable
4. [ ] Add channel default: `general` → `enabled: true`
5. [ ] Monitor for 48 hours post-release

---

## 5. Quick Verification Queries

```sql
-- Tables without RLS
SELECT tablename FROM pg_tables 
WHERE schemaname = 'public' AND NOT rowsecurity;

-- NULL tenant_ids in critical tables
SELECT 'loads' t, COUNT(*) FROM loads WHERE tenant_id IS NULL
UNION ALL SELECT 'vehicles', COUNT(*) FROM vehicles WHERE tenant_id IS NULL;

-- Cross-tenant data check (run as authenticated user)
SELECT tenant_id, COUNT(*) FROM loads GROUP BY tenant_id;
-- Should return only user's tenant
```

---

## Export Pack Location

All documentation: `docs/export-pack/`

- `/00-ARCHITECTURE/` - System overview, rollout process, risks
- `/01-DATABASE/` - Tables inventory, isolation map
- `/02-EDGE_FUNCTIONS/` - Function index
- `/03-AUTH_AND_SECURITY/` - Auth setup, service role usage
- `/04-FEATURE_FLAGS_AND_PACKAGES/` - Flags, channels, package proposal
- `/05-FRONTEND_APP/` - Routes
- `/06-BILLING_AND_ANALYTICS/` - Billing status
- `/07-ENV_AND_CONFIG/` - Environment variables
