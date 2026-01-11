# Risks and Gaps Analysis

**Generated:** 2026-01-11  
**Risk Level Legend:** 🔴 Critical | 🟠 High | 🟡 Medium | 🟢 Low

---

## 1. Tenant Isolation Risks

### 🟠 Client-Side Tenant ID Trust

**Risk:** Some UI components use `useTenantId()` without waiting for `isReady` state.

**Impact:** Queries could execute with stale or incorrect tenant ID during context initialization.

**Current Mitigation:** RLS policies provide database-level enforcement.

**Recommendation:** Add `isReady` guard to all tenant-scoped queries.

---

### 🟡 Raw Supabase Queries

**Risk:** Several files bypass `useTenantQuery()` and use raw `supabase.from()` calls.

**Files Affected:**
- `LoadApprovalTab.tsx` - relies solely on RLS
- `LoadEmailDetail.tsx` - dispatcher/carrier lookups without tenant filter
- `LoadHunterTab.tsx` - relies on IDs from already-filtered data

**Impact:** Works due to RLS, but inconsistent pattern makes auditing harder.

**Recommendation:** Migrate all tenant-owned table queries to `useTenantQuery()`.

---

### 🟢 Impersonation Session Validation

**Status:** SECURE

**Implementation:**
- Sessions validated server-side every 30 seconds
- Stored in `admin_impersonation_sessions` table
- Platform admin check on session creation
- Auto-expiry after configured time

---

## 2. RLS Policy Risks

### 🟡 Overly Permissive Policies

**Tables with `USING (true)` for non-SELECT:**
- `ai_usage_tracking` (INSERT)
- Several internal tracking tables

**Impact:** Low - these are usage/tracking tables without PII.

**Recommendation:** Review and tighten if these tables grow to contain sensitive data.

---

### 🟢 Tenant-Owned Tables

**Status:** All 50 tenant-owned tables have:
- `tenant_id` column ✅
- RLS enabled ✅
- Tenant membership check policies ✅

---

## 3. Edge Function Risks

### 🟠 Service Role Usage

**Functions using service role for data operations:**
- All scheduled/cron jobs
- `gmail-webhook` (email ingestion)
- `fetch-gmail-loads` (email processing)
- `capture-vehicle-locations` (telematics sync)

**Mitigation:** These functions derive tenant_id from trusted sources (gmail_tokens, vehicle records).

**Risk:** If tenant mapping is wrong, data could land in wrong tenant.

**Recommendation:** Add logging and alerting for tenant_id mismatches.

---

### 🟡 Missing Feature Gates

**Edge functions without explicit feature gating:**
- `geocode` - relies on API key presence
- `get-weather` - open to authenticated users
- `optimize-route` - open to authenticated users

**Impact:** Users could incur API costs without feature being "enabled".

**Recommendation:** Add feature flag checks to all cost-incurring functions.

---

## 4. Authentication Risks

### 🟢 JWT Validation

**Status:** SECURE

- All edge functions validate JWT via anon-key client first
- Service role only used after validation
- No raw JWT parsing in edge functions

---

### 🟡 Session Persistence

**Risk:** `localStorage` stores tenant ID and impersonation session.

**Impact:** If localStorage is manipulated, UI could show wrong tenant.

**Mitigation:** RLS prevents actual data leakage. Impersonation validated server-side.

**Recommendation:** Consider using httpOnly cookies for session data.

---

## 5. Feature Flag Risks

### 🟡 Client-Side Caching

**Risk:** Feature flag cache TTL is 60 seconds. Changes take up to 1 minute to propagate.

**Impact:** Users might see features briefly after they're disabled.

**Recommendation:** Add `clearFeatureGateCache()` call on tenant switch.

---

### 🟢 Killswitch Mechanism

**Status:** WORKING

- `is_killswitch` flag immediately disables features globally
- Overrides all channel/tenant settings
- Useful for emergency shutoffs

---

## 6. Billing & Payment Risks

### 🟠 Incomplete Stripe Integration

**Current State:**
- Tables exist: `billing_customers`, `billing_subscriptions`, `plans`, `plan_features`
- Edge functions exist: `stripe-create-checkout-session`, `stripe-webhook`
- NOT ENFORCED: Feature access based on subscription status

**Risk:** Tenants could access premium features without valid subscription.

**Recommendation:** 
1. Complete plan enforcement in feature gate
2. Add subscription status checks to edge functions
3. Implement usage metering and limits

---

### 🔴 No Payment Required

**Current State:** All tenants are on "trial" status indefinitely.

**Impact:** No revenue collection; no limits on API usage.

**Recommendation:** Implement subscription enforcement before scaling beyond pilot.

---

## 7. Data Integrity Risks

### 🟡 Foreign Key Cascades

**Recent Fix:** Added `ON DELETE CASCADE` for missed_loads_history → vehicles.

**Remaining:** Need audit of all foreign keys for proper cascade behavior.

**Recommendation:** Generate FK cascade report and fix blocking deletes.

---

### 🟢 Unique Constraints

**Recent Fix:** VIN uniqueness is now tenant-scoped (not global).

**Principle:** All uniqueness constraints should be per-tenant where applicable.

---

## 8. Monitoring Gaps

### 🟠 No Alerting on Cross-Tenant Access

**Gap:** No automated detection of potential tenant isolation breaches.

**Recommendation:**
1. Log all RLS denials
2. Alert on unusual cross-tenant query patterns
3. Implement tenant isolation regression tests

---

### 🟡 Limited Edge Function Monitoring

**Current:** Logs available but no aggregated dashboards.

**Recommendation:** Set up log-based metrics for:
- 403/401 rates by function
- Processing times
- Error rates by tenant

---

## 9. Operational Risks

### 🟠 Single Developer Knowledge

**Risk:** System complexity requires deep knowledge of tenant isolation patterns.

**Recommendation:** 
- Keep this export pack updated
- Document all changes to tenant context flow
- Require PR review for tenant-related changes

---

### 🟡 No Staging Environment

**Current:** Development happens in "internal" channel on production data.

**Risk:** Bugs could affect production data.

**Recommendation:** Consider separate Supabase project for staging.

---

## 10. Summary Matrix

| Area | Risk Level | Status |
|------|------------|--------|
| RLS Enforcement | 🟢 Low | Policies in place |
| Edge Function Auth | 🟢 Low | JWT validation working |
| Tenant Context | 🟡 Medium | Some raw queries remain |
| Feature Flags | 🟢 Low | Working as designed |
| Billing | 🔴 Critical | Not enforced |
| Monitoring | 🟠 High | Gaps in alerting |
| FK Cascades | 🟡 Medium | Partially fixed |
| Documentation | 🟢 Low | This export pack |

---

## 11. Priority Action Items

### Immediate (Before Scaling)
1. 🔴 Implement billing enforcement
2. 🟠 Add cross-tenant access alerting
3. 🟠 Audit all service-role operations

### Short-Term (Next Sprint)
1. 🟡 Migrate raw queries to useTenantQuery
2. 🟡 Add feature gates to all cost-incurring functions
3. 🟡 Complete FK cascade audit

### Medium-Term
1. Consider staging environment
2. Add automated tenant isolation tests
3. Implement log-based monitoring dashboards
