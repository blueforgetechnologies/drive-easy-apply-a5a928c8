# Current Release Channels

**Generated:** 2026-01-11

---

## Release Channel Overview

| Channel | Purpose | Current Tenants |
|---------|---------|-----------------|
| `internal` | Development, debugging, all features | Dev Lab |
| `pilot` | Early adopter testing, stable features | Talbi Logistics LLC |
| `general` | Production release, proven features | (None yet) |

---

## Channel Storage

### Tenant Table
```sql
tenants (
  id UUID,
  name TEXT,
  slug TEXT,
  release_channel TEXT DEFAULT 'general',
  status TEXT DEFAULT 'trial',
  ...
)
```

### Current Tenants
```
| Tenant Name          | Slug                 | Channel  | Status |
|---------------------|----------------------|----------|--------|
| Dev Lab              | default              | internal | trial  |
| Talbi Logistics LLC  | talbi-logistics-llc  | pilot    | trial  |
```

---

## How Channels Are Enforced

### 1. UI Navigation Gating

```typescript
// DashboardLayout.tsx
const { isAccessible: analyticsAccessible } = useFeatureGate({
  featureKey: 'analytics',
  requiresUserGrant: true,
});

// Only show nav item if accessible
{analyticsAccessible && <NavItem to="/analytics" />}
```

### 2. Feature Component Gating

```typescript
// Inside a component
const { isAccessible, isLoading } = useFeatureGate({
  featureKey: 'load_hunter_enabled',
});

if (isLoading) return <Skeleton />;
if (!isAccessible) return <FeatureLockedMessage />;
```

### 3. Edge Function Gating

```typescript
// In Edge Function
const featureCheck = await assertFeatureEnabled({
  authHeader,
  featureKey: 'geocoding_enabled',
});
if (!featureCheck.allowed) return featureCheck.response; // 403
```

---

## Channel Default Matrix

| Feature | internal | pilot | general |
|---------|----------|-------|---------|
| load_hunter_enabled | ✅ | ✅ | ❌ |
| analytics | ✅ | ❌ | ❌ |
| ai_parsing_enabled | ✅ | ❌ | ❌ |
| geocoding_enabled | ✅ | ❌ | ❌ |
| usage_dashboard | ✅ | ❌ | ❌ |
| development_tools | ✅ | ❌ | ❌ |
| inspector_tools | ✅ | ❌ | ❌ |
| fleet_financials | ✅ | ✅ | ✅ |
| driver_settlements | ✅ | ✅ | ✅ |

---

## Changing a Tenant's Channel

### Via SQL (Admin)
```sql
UPDATE tenants 
SET release_channel = 'pilot' 
WHERE slug = 'some-tenant';
```

### Via Edge Function
```typescript
// admin-tenant-update
await supabase
  .from('tenants')
  .update({ release_channel: 'pilot' })
  .eq('id', tenantId);
```

### Via Inspector UI
1. Go to Inspector → Tenants
2. Select tenant
3. Change release_channel dropdown
4. Save

---

## Channel Rollout Workflow

### Step 1: Internal Development
- Feature developed with flag set to `default_enabled: false`
- `release_channel_feature_flags` entry for `internal` → `enabled: true`
- Test in Default Tenant

### Step 2: Pilot Promotion
```sql
INSERT INTO release_channel_feature_flags (feature_flag_id, release_channel, enabled)
SELECT id, 'pilot', true FROM feature_flags WHERE key = 'new_feature';
```
- Notify pilot tenant users
- Monitor for 1-2 weeks

### Step 3: General Release
```sql
INSERT INTO release_channel_feature_flags (feature_flag_id, release_channel, enabled)
SELECT id, 'general', true FROM feature_flags WHERE key = 'new_feature';
```
- Or update global default if feature is proven stable

---

## Emergency Channel Bypass

### Disable for All Channels (Killswitch)
```sql
UPDATE feature_flags 
SET is_killswitch = true, default_enabled = false 
WHERE key = 'broken_feature';
```

### Disable for Specific Tenant
```sql
INSERT INTO tenant_feature_flags (tenant_id, feature_flag_id, enabled)
SELECT t.id, ff.id, false 
FROM tenants t, feature_flags ff 
WHERE t.slug = 'affected-tenant' AND ff.key = 'broken_feature'
ON CONFLICT (tenant_id, feature_flag_id) DO UPDATE SET enabled = false;
```

---

## Monitoring Channel Status

### Query: All Tenants with Channels
```sql
SELECT name, slug, release_channel, status 
FROM tenants 
ORDER BY release_channel, name;
```

### Query: Feature Status by Channel
```sql
SELECT 
  ff.key,
  ff.default_enabled,
  rcff.release_channel,
  rcff.enabled as channel_enabled
FROM feature_flags ff
LEFT JOIN release_channel_feature_flags rcff ON rcff.feature_flag_id = ff.id
ORDER BY ff.key, rcff.release_channel;
```

### Query: Tenant Override Status
```sql
SELECT 
  t.name as tenant,
  ff.key as feature,
  tff.enabled as override_value
FROM tenant_feature_flags tff
JOIN tenants t ON t.id = tff.tenant_id
JOIN feature_flags ff ON ff.id = tff.feature_flag_id
ORDER BY t.name, ff.key;
```
