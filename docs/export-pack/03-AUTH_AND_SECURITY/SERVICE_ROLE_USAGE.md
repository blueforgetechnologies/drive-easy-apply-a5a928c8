# Service Role Usage

**Generated:** 2026-01-11

---

## Purpose

This document identifies all Edge Functions that use the Supabase service role key, which bypasses RLS.

**CRITICAL:** Service role should only be used AFTER user authentication is verified.

---

## Service Role Pattern

### Correct Usage
```typescript
// 1. First validate user JWT with anon key
const anonClient = createClient(url, anonKey, {
  global: { headers: { Authorization: authHeader } }
});
const { data: { user } } = await anonClient.auth.getUser();

// 2. Only then use service role for privileged operations
const serviceClient = createClient(url, serviceKey);
```

### ❌ Dangerous Pattern (Never Do This)
```typescript
// Using service role without validating user first
const serviceClient = createClient(url, serviceKey);
// Now all RLS is bypassed with no auth check!
```

---

## Functions Using Service Role

### After User Validation ✅

| Function | Purpose | Validation Method |
|----------|---------|-------------------|
| `assertTenantAccess.ts` | Tenant membership lookup | JWT validated first |
| `assertFeatureEnabled.ts` | Feature flag resolution | JWT validated first |
| `deriveTenantFromJWT.ts` | Tenant ID lookup | JWT validated first |
| `admin-start-impersonation` | Create session | Platform admin verified |
| `admin-stop-impersonation` | Revoke session | Platform admin verified |
| `admin-tenant-create` | Create tenant | Platform admin verified |
| `debug-tenant-data` | View tenant data | Platform admin verified |
| `set-tenant-integration` | Store credentials | Tenant access verified |
| `get-tenant-integrations-safe` | Read credentials | Tenant access verified |

### Scheduled Jobs (No User Context) ⏰

| Function | Data Scope | Isolation Mechanism |
|----------|------------|---------------------|
| `capture-vehicle-locations` | All vehicles | Writes to correct tenant via FK |
| `archive-old-emails` | All emails | Time-based, tenant preserved |
| `process-email-queue` | Queued items | tenant_id from queue record |
| `cleanup-stale-data` | Old records | Deletes only, no cross-read |
| `snapshot-email-volume` | Aggregate stats | No tenant data exposed |
| `check-email-health` | Email metrics | Alert per-tenant |
| `sync-carriers-fmcsa` | Carrier lookup | External API, no tenant data |

### Webhooks (External Callers) 🌐

| Function | Validation | Isolation |
|----------|------------|-----------|
| `gmail-webhook` | Pub/Sub signature | tenant_id from gmail_tokens |
| `stripe-webhook` | Stripe signature | tenant_id from subscription |
| `samsara-webhook` | API signature | tenant_id from vehicle |

---

## High-Risk Service Role Operations

### 1. `fetch-gmail-loads`
**Risk:** Creates load_emails records  
**Mitigation:** tenant_id derived from gmail_tokens.tenant_id (trusted)

### 2. `process-email-queue`
**Risk:** Reads/processes queued emails  
**Mitigation:** Only processes records in email_queue (already tenant-scoped)

### 3. `gmail-webhook`
**Risk:** Entry point for external data  
**Mitigation:** Validates Pub/Sub format, maps email to tenant via gmail_tokens

### 4. `tenant-backfill-null`
**Risk:** Modifies tenant_id on existing records  
**Mitigation:** Platform admin only, explicit confirmation required

---

## Service Role Protection Measures

### 1. Never Expose in Client
- Service role key is only in Edge Functions
- Client uses anon key only
- `.env` file never contains service key

### 2. Validate Before Use
- All admin functions check `is_platform_admin`
- All tenant functions check membership via `assertTenantAccess`

### 3. Scope Data Access
- Even with service role, most functions filter by tenant_id
- Only scheduled jobs intentionally process all data

### 4. Audit Logging
- Admin operations logged to `tenant_audit_log`
- Impersonation logged to `admin_impersonation_sessions`

---

## Verification Checklist

### Before Deploying New Edge Function

- [ ] Does it use service role? If yes:
  - [ ] Is user JWT validated FIRST?
  - [ ] Is tenant membership verified?
  - [ ] Are all queries scoped to validated tenant_id?
  - [ ] Is there audit logging for sensitive operations?
- [ ] If scheduled job:
  - [ ] Is cross-tenant processing intentional and documented?
  - [ ] Are writes scoped correctly (FK relationships)?
- [ ] If webhook:
  - [ ] Is signature validated?
  - [ ] Is tenant derived from trusted source (not request body)?

---

## RLS Bypass Scenarios

### Intentional (Documented)
1. Scheduled jobs processing all tenants
2. Platform admin cross-tenant access
3. Service-to-service internal calls

### Dangerous (Must Avoid)
1. ❌ Service client created before auth validation
2. ❌ tenant_id taken from request body without verification
3. ❌ Platform admin check skipped for "convenience"
