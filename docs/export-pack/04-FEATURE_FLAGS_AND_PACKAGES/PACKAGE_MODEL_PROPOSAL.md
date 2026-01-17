# Package Model Proposal

**Generated:** 2026-01-11  
**Status:** PROPOSAL ONLY - No Implementation Changes

---

## Overview

This document proposes a tiered package/subscription model for the TMS platform. This is designed to work with the existing feature flag infrastructure.

---

## Proposed Package Tiers

### Tier 1: Starter (Free/Trial)
**Target:** Small fleets trying the platform

| Feature | Included |
|---------|----------|
| Loads Management | ✅ 50/month |
| Vehicles | ✅ 5 max |
| Drivers | ✅ 5 max |
| Basic Invoicing | ✅ |
| Map View | ✅ |
| Email Support | ✅ |

### Tier 2: Professional ($99/mo)
**Target:** Growing fleets

| Feature | Included |
|---------|----------|
| Loads Management | ✅ Unlimited |
| Vehicles | ✅ 25 max |
| Drivers | ✅ 25 max |
| Load Hunter (Email Ingestion) | ✅ |
| Basic Analytics | ✅ |
| Fleet Financials | ✅ |
| Driver Settlements | ✅ |
| Multi-Stop Loads | ✅ |
| Priority Support | ✅ |

### Tier 3: Enterprise ($299/mo)
**Target:** Large fleets, carriers

| Feature | Included |
|---------|----------|
| Everything in Professional | ✅ |
| Vehicles | ✅ Unlimited |
| Drivers | ✅ Unlimited |
| AI Parsing | ✅ |
| Bid Automation | ✅ |
| Advanced Analytics | ✅ |
| API Access | ✅ |
| Custom Integrations | ✅ |
| Dedicated Support | ✅ |

---

## Database Schema (Existing)

### `plans` Table
```sql
plans (
  id UUID PRIMARY KEY,
  name TEXT,                    -- "Starter", "Professional", "Enterprise"
  stripe_price_id TEXT,         -- Stripe price ID
  price_monthly DECIMAL,        -- Monthly price
  features JSONB,               -- Feature list for display
  is_active BOOLEAN,
  sort_order INTEGER
)
```

### `plan_features` Table
```sql
plan_features (
  id UUID PRIMARY KEY,
  plan_id UUID REFERENCES plans,
  feature_key TEXT,             -- Matches feature_flags.key
  allowed BOOLEAN,              -- Whether feature is included
  limit_value INTEGER           -- Usage limit (e.g., 50 loads)
)
```

### `billing_subscriptions` Table
```sql
billing_subscriptions (
  id UUID PRIMARY KEY,
  tenant_id UUID REFERENCES tenants,
  plan_id UUID REFERENCES plans,
  stripe_subscription_id TEXT,
  status TEXT,                  -- active, canceled, past_due
  current_period_start TIMESTAMP,
  current_period_end TIMESTAMP
)
```

---

## Enforcement Points

### 1. Feature Access (Existing)
Feature flags already support this via `plan_features` + `check_plan_feature_access()` function.

### 2. Usage Limits (Proposed)
Add limit checks to:
- Load creation → check monthly load count
- Vehicle creation → check vehicle count
- Driver creation → check driver count

### 3. Overage Handling (Proposed)
Options:
- Hard block (recommended for trial)
- Soft warning with grace period
- Automatic upgrade prompt

---

## Tenant Admin Controls

### What Tenant Admins Can Manage

| Control | Scope |
|---------|-------|
| Enable/disable features for users | Within their plan limits |
| Assign feature access to users | Via `tenant_feature_access` |
| View usage metrics | Their tenant only |
| Upgrade/downgrade plan | Via Stripe portal |

### What Tenant Admins Cannot Do

| Control | Reason |
|---------|--------|
| Access other tenants | Tenant isolation |
| Bypass plan limits | Requires upgrade |
| Access platform tools | Platform admin only |

---

## Per-User Role Permissions

### Existing Infrastructure
- `custom_roles` - Tenant-defined roles
- `role_permissions` - Role-permission mapping
- `user_custom_roles` - User-role assignments
- `permissions` - Permission definitions

### Proposed Standard Permissions

| Permission Code | Description |
|-----------------|-------------|
| `manage_loads` | Create, edit, delete loads |
| `view_loads` | View load list |
| `manage_vehicles` | Vehicle management |
| `manage_drivers` | Driver management |
| `view_analytics` | Access analytics |
| `manage_invoices` | Invoice management |
| `manage_settlements` | Settlement management |
| `admin_settings` | Tenant settings |
| `manage_users` | User invitations |

---

## Implementation Roadmap

### Phase 1: Foundation (Existing)
- ✅ Plans table exists
- ✅ Plan features table exists
- ✅ Billing subscriptions table exists
- ✅ Feature flag infrastructure
- ✅ Stripe webhook handling

### Phase 2: Enforcement (TODO)
- [ ] Add `check_plan_feature_access()` to feature gate
- [ ] Add usage limit checks to mutations
- [ ] Add plan selection to onboarding
- [ ] Add upgrade prompts when limits hit

### Phase 3: Self-Service (TODO)
- [ ] Tenant admin billing portal
- [ ] Usage dashboard for tenants
- [ ] Plan comparison page
- [ ] Automated trial expiration

### Phase 4: Analytics (TODO)
- [ ] Revenue dashboard (platform admin)
- [ ] Churn tracking
- [ ] Feature adoption metrics
- [ ] Usage-based billing support

---

## Migration Strategy

### Existing Tenants
1. Dev Lab → Internal (free, all features)
2. Talbi Logistics LLC → Pilot (free trial of Professional)
3. New tenants → Starter (free trial, upgrade prompt)

### Trial Period
- 14 days free trial on Professional
- Soft block after trial (read-only, no new loads)
- Clear upgrade path

---

## Revenue Projections (Illustrative)

| Tier | Est. Tenants | Monthly | Annual |
|------|--------------|---------|--------|
| Starter | 100 | $0 | $0 |
| Professional | 50 | $4,950 | $59,400 |
| Enterprise | 10 | $2,990 | $35,880 |
| **Total** | 160 | **$7,940** | **$95,280** |

---

## Questions to Resolve

1. **Trial Length:** 14 days or 30 days?
2. **Overage Policy:** Hard block or grace period?
3. **Annual Discount:** Offer 2 months free for annual?
4. **Add-Ons:** Sell features separately?
5. **Usage-Based:** Charge per load for high-volume?
