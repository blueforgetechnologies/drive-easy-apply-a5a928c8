# Current Feature Flags

**Generated:** 2026-01-11

---

## Feature Flag Tables

### `feature_flags` - Global Definitions
| Column | Purpose |
|--------|---------|
| `id` | Primary key |
| `key` | Unique identifier (used in code) |
| `name` | Display name |
| `description` | What the feature does |
| `default_enabled` | Global default value |
| `is_killswitch` | If true and disabled, blocks everywhere |

### `release_channel_feature_flags` - Channel Defaults
| Column | Purpose |
|--------|---------|
| `feature_flag_id` | FK to feature_flags |
| `release_channel` | internal/pilot/general |
| `enabled` | Default for this channel |

### `tenant_feature_flags` - Tenant Overrides
| Column | Purpose |
|--------|---------|
| `tenant_id` | FK to tenants |
| `feature_flag_id` | FK to feature_flags |
| `enabled` | Override value |

### `tenant_feature_access` - User Grants
| Column | Purpose |
|--------|---------|
| `tenant_id` | FK to tenants |
| `user_id` | FK to auth.users |
| `feature_key` | Feature key |
| `is_enabled` | Grant status |

---

## Current Feature Flags

| Key | Name | Default | Killswitch | Description |
|-----|------|---------|------------|-------------|
| `accounting_module` | Accounting Module | ✅ | ❌ | Invoicing and settlements |
| `ai_parsing_enabled` | AI Parsing | ❌ | ❌ | Enable AI-powered parsing |
| `analytics` | Analytics Dashboard | ❌ | ❌ | Load analytics with charts |
| `bid_automation` | Bid Automation | ❌ | ❌ | Automated bidding based on rules |
| `bid_automation_enabled` | Bid Automation | ❌ | ❌ | Enable automated bidding emails |
| `carrier_dashboard` | Carrier Dashboard | ✅ | ❌ | Carrier-specific view |
| `development_tools` | Development Tools | ❌ | ❌ | Development and debugging tools |
| `driver_settlements` | Driver Settlements | ✅ | ❌ | Driver payment settlement system |
| `fleet_financials` | Fleet Financials | ✅ | ❌ | Financial reporting and analytics |
| `geocoding_enabled` | Geocoding | ❌ | ❌ | Enable geocoding API calls |
| `inspector_tools` | Inspector Tools | ❌ | ❌ | Platform health inspector |
| `load_hunter` | Load Hunter | ❌ | ❌ | Email ingestion and matching |
| `load_hunter_ai_parsing` | AI-Powered Parsing | ❌ | ❌ | Use AI for enhanced parsing |
| `load_hunter_bidding` | Load Hunter Bidding | ✅ | ❌ | Enable bid submission |
| `load_hunter_enabled` | Load Hunter | ✅ | ❌ | Enable Load Hunter ingestion |
| `load_hunter_geocoding` | Geocoding | ❌ | ❌ | Enable location geocoding |
| `load_hunter_matching` | Load Hunter Matching | ✅ | ❌ | Enable automatic matching |
| `maintenance_module` | Maintenance Module | ✅ | ❌ | Vehicle maintenance tracking |
| `map_view` | Map View | ✅ | ❌ | Vehicle and load visualization |
| `multi_stop_loads` | Multi-Stop Loads | ✅ | ❌ | Support for multi-stop loads |
| `operations_module` | Operations Module | ✅ | ❌ | Customer, driver, vehicle mgmt |
| `realtime_notifications` | Realtime Notifications | ❌ | ❌ | Push notifications for matches |
| `usage_dashboard` | Usage Dashboard | ❌ | ❌ | API usage and cost tracking |

---

## Feature Flag Resolution

### Resolution Order (Highest to Lowest Priority)

```
1. Killswitch (if is_killswitch=true AND default_enabled=false → BLOCKED)
2. Tenant Override (tenant_feature_flags.enabled)
3. Channel Default (release_channel_feature_flags.enabled)
4. Global Default (feature_flags.default_enabled)
```

### Code Implementation

**Edge Functions:** `assertFeatureEnabled.ts`
```typescript
// Returns { allowed, response? }
const result = await assertFeatureEnabled({
  authHeader,
  featureKey: 'geocoding_enabled',
  tenantId: derived_or_provided
});
if (!result.allowed) return result.response;
```

**React UI:** `useFeatureGate.ts`
```typescript
const { isAccessible, isLoading } = useFeatureGate({
  featureKey: 'analytics',
  requiresUserGrant: true
});
```

---

## Channel Configuration

### Internal Channel (Development)
- All features enabled for testing
- Platform admin access to all tools
- Dev Lab uses this channel

### Pilot Channel (Early Adopters)
- Core features enabled
- Premium features disabled by default
- Talbi Logistics LLC uses this channel

### General Channel (Production)
- Only stable features enabled
- Premium features require subscription
- Future tenants will use this channel

---

## Feature Key Constants

```typescript
// From useFeatureGate.ts
export const FEATURE_KEYS = {
  ANALYTICS: 'analytics',
  LOAD_HUNTER: 'load_hunter_enabled',
  USAGE: 'usage_dashboard',
  DEVELOPMENT: 'development_tools',
  INSPECTOR: 'inspector_tools',
  AI_PARSING: 'ai_parsing_enabled',
  BID_AUTOMATION: 'bid_automation_enabled',
  GEOCODING: 'geocoding_enabled',
  FLEET_FINANCIALS: 'fleet_financials',
  DRIVER_SETTLEMENTS: 'driver_settlements',
  MULTI_STOP_LOADS: 'multi_stop_loads',
} as const;
```

---

## Adding a New Feature Flag

1. **Insert into feature_flags:**
```sql
INSERT INTO feature_flags (key, name, description, default_enabled, is_killswitch)
VALUES ('new_feature', 'New Feature', 'Description here', false, false);
```

2. **Set channel defaults:**
```sql
INSERT INTO release_channel_feature_flags (feature_flag_id, release_channel, enabled)
SELECT id, 'internal', true FROM feature_flags WHERE key = 'new_feature';
-- Repeat for pilot/general as needed
```

3. **Add to FEATURE_KEYS constant** (for type safety)

4. **Use in code:**
```typescript
const { isAccessible } = useFeatureGate({ featureKey: 'new_feature' });
```
