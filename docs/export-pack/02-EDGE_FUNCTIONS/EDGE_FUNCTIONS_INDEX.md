# Edge Functions Index

**Generated:** 2026-01-11  
**Total Functions:** 68

---

## Categories

- 🔒 **Admin Only** - Requires platform admin
- 🎫 **Tenant Gated** - Uses assertTenantAccess
- 🏷️ **Feature Gated** - Uses assertFeatureEnabled
- ⏰ **Scheduled** - Runs via cron/service role
- 🌐 **Public** - No auth required (webhooks)

---

## Core Business Functions

| Function | Purpose | Auth | Tenant Source |
|----------|---------|------|---------------|
| `fetch-gmail-loads` | Process Gmail messages into load_emails | 🎫 | gmail_tokens.tenant_id |
| `geocode` | Geocode addresses via Mapbox | 🏷️ | JWT → deriveTenantFromJWT |
| `get-mapbox-token` | Return Mapbox public token | 🎫 | Any authenticated |
| `get-vehicle-stats` | Fetch Samsara vehicle data | 🎫 | Request body |
| `get-weather` | Weather API lookup | 🎫 | Any authenticated |
| `optimize-route` | Route optimization | 🎫 | Any authenticated |
| `parse-freight-dimensions` | AI dimension parsing | 🏷️ | JWT |
| `parse-rate-confirmation` | Rate con PDF parsing | 🎫 | JWT |

---

## Email & Communication

| Function | Purpose | Auth | Tenant Source |
|----------|---------|------|---------------|
| `gmail-auth` | Gmail OAuth flow | 🎫 | JWT |
| `gmail-tenant-mapping` | Map Gmail to tenant | 🔒 | Request body |
| `gmail-webhook` | Gmail Pub/Sub receiver | 🌐 | gmail_tokens lookup |
| `process-email-queue` | Process queued emails | ⏰ | email_queue.tenant_id |
| `send-application` | Email driver application | 🎫 | tenant from application |
| `send-bid-email` | Send load bid | 🏷️ | JWT |
| `send-dispatcher-login` | Dispatcher login email | 🎫 | Request body |
| `send-driver-invite` | Driver invite email | 🎫 | Request body |
| `send-invite` | User invite email | 🎫 | Request body |
| `send-spend-alert` | Spending alert email | 🎫 | spend_alerts.tenant_id |
| `send-user-login` | User login email | 🎫 | Request body |

---

## Admin Functions

| Function | Purpose | Auth | Notes |
|----------|---------|------|-------|
| `admin-get-impersonation-session` | Get active session | 🔒 | Platform admin only |
| `admin-start-impersonation` | Start impersonation | 🔒 | Creates session |
| `admin-stop-impersonation` | End impersonation | 🔒 | Revokes session |
| `admin-tenant-create` | Create new tenant | 🔒 | Platform admin only |
| `admin-tenant-suspend` | Suspend tenant | 🔒 | Platform admin only |
| `admin-tenant-update` | Update tenant config | 🔒 | Platform admin only |
| `debug-tenant-data` | View tenant data | 🔒 | Platform admin only |
| `tenant-backfill-null` | Fix NULL tenant_ids | 🔒 | Data migration |
| `tenant-counts` | Get tenant stats | 🔒 | Platform admin only |
| `tenant-isolation-audit` | Run isolation audit | 🔒 | Platform admin only |
| `tenant-seed-data` | Seed demo data | 🔒 | Platform admin only |
| `tenant-wipe-test-data` | Clear test data | 🔒 | Platform admin only |

---

## Inspector Functions

| Function | Purpose | Auth | Notes |
|----------|---------|------|-------|
| `inspector-billing` | Billing dashboard data | 🔒 | Internal only |
| `inspector-feature-flags` | Feature flag management | 🔒 | Internal only |
| `inspector-invoke-proxy` | Safe function invocation | 🔒 | For testing |
| `inspector-load-hunter-health` | Load Hunter health | 🔒 | Internal only |
| `inspector-release-control` | Release management | 🔒 | Internal only |
| `inspector-tenants` | Tenant listing | 🔒 | Platform admin only |
| `inspector-ui-actions` | UI action registry | 🔒 | Internal only |
| `platform-rollout-control` | Rollout management | 🔒 | Platform admin only |

---

## Integration Functions

| Function | Purpose | Auth | Tenant Source |
|----------|---------|------|---------------|
| `check-broker-credit` | OTR credit check | 🎫 | Request body |
| `check-integrations` | Check all integrations | 🎫 | Request body |
| `check-tenant-integrations` | Check tenant integrations | 🎫 | Request body |
| `fetch-carrier-data` | FMCSA carrier lookup | 🎫 | Any authenticated |
| `fetch-highway-data` | Highway API lookup | 🎫 | Any authenticated |
| `samsara-webhook` | Samsara events receiver | 🌐 | vehicle lookup |
| `set-tenant-integration` | Configure integration | 🎫 | Request body |
| `sync-carriers-fmcsa` | Sync carrier data | ⏰ | Iterates all |
| `sync-vehicles-samsara` | Sync Samsara vehicles | 🎫 | Request body |
| `test-tenant-integration` | Test integration | 🎫 | Request body |

---

## Scheduled/Cron Functions

| Function | Schedule | Purpose |
|----------|----------|---------|
| `archive-old-emails` | Daily | Archive old load_emails |
| `capture-vehicle-locations` | 5 min | Samsara GPS sync |
| `check-email-health` | 15 min | Monitor email flow |
| `cleanup-stale-data` | Daily | Clean old records |
| `reset-missed-loads` | Daily | Reset missed load flags |
| `snapshot-email-volume` | Hourly | Email volume stats |
| `snapshot-geocode-stats` | Daily | Geocode cache stats |
| `snapshot-monthly-usage` | Monthly | Usage aggregation |

---

## Billing Functions

| Function | Purpose | Auth | Notes |
|----------|---------|------|-------|
| `stripe-create-checkout-session` | Start Stripe checkout | 🎫 | Creates session |
| `stripe-customer-portal` | Stripe portal link | 🎫 | Returns URL |
| `stripe-webhook` | Stripe event handler | 🌐 | Signature verified |

---

## Utility Functions

| Function | Purpose | Auth |
|----------|---------|------|
| `ai-update-customers` | AI customer data update | 🎫 |
| `backfill-customers` | Backfill customer data | 🔒 |
| `elevenlabs-sfx` | Sound effect generation | 🎫 |
| `reparse-fullcircle-emails` | Reparse emails | 🔒 |
| `reparse-load-emails` | Reparse load emails | 🔒 |
| `test-ai` | Test AI integration | 🎫 |
| `track-invite-open` | Track invite opens | 🌐 |

---

## Shared Helpers

| File | Purpose |
|------|---------|
| `_shared/assertTenantAccess.ts` | Validate tenant membership |
| `_shared/assertFeatureEnabled.ts` | Feature flag gating |
| `_shared/deriveTenantFromJWT.ts` | Extract tenant from JWT |

---

## Tenant Context Methods

### Method 1: assertTenantAccess (Preferred)
```typescript
const accessResult = await assertTenantAccess(authHeader, tenant_id);
if (!accessResult.allowed) {
  return accessResult.response;
}
// User verified as tenant member or platform admin
```

### Method 2: deriveTenantFromJWT (Fallback)
```typescript
const { tenant_id, user_id, error } = await deriveTenantFromJWT(authHeader);
if (error) return error;
// tenant_id derived from user's first active membership
```

### Method 3: Service Role (Scheduled Jobs)
```typescript
// Only for cron jobs - iterates all data
const serviceClient = createClient(url, serviceKey);
// Must explicitly filter by tenant_id or process all intentionally
```
