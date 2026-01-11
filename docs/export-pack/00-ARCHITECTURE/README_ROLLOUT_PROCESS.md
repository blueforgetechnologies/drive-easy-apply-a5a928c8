# Feature Rollout Process

**Generated:** 2026-01-11

---

## 1. Rollout Philosophy

Features flow through release channels:

```
Internal → Pilot → General
  (dev)   (test)   (prod)
```

Each stage has verification gates before promotion.

---

## 2. Release Channels Explained

| Channel | Purpose | Soak Time | Tenants |
|---------|---------|-----------|---------|
| **internal** | Development & debugging | Immediate | Default Tenant |
| **pilot** | Early adopter testing | 1-2 weeks | Talbi Logistics LLC |
| **general** | Production release | After pilot success | All new tenants |

---

## 3. Where Feature Flags Live

### Database Tables

```sql
-- Global feature definitions
feature_flags (
  id, key, name, description,
  default_enabled,  -- Global default
  is_killswitch     -- If true & disabled, blocks everywhere
)

-- Per-channel defaults
release_channel_feature_flags (
  feature_flag_id, release_channel, enabled
)

-- Per-tenant overrides (highest priority)
tenant_feature_flags (
  tenant_id, feature_flag_id, enabled
)

-- Per-user grants (for premium features)
tenant_feature_access (
  tenant_id, user_id, feature_key, is_enabled
)
```

### Resolution Order (Edge Functions)

```typescript
// In assertFeatureEnabled.ts:
1. Check killswitch (if globally disabled → BLOCKED)
2. Check tenant override (tenant_feature_flags)
3. Check channel default (release_channel_feature_flags)
4. Fall back to global default (feature_flags.default_enabled)
```

### Resolution Order (UI)

```typescript
// In useFeatureGate.ts:
1. Same as above for tenant enablement
2. THEN check user-level access:
   - Platform admin → always allowed
   - User grant in tenant_feature_access → allowed
   - Otherwise → blocked
```

---

## 4. Step-by-Step Rollout Process

### Step 1: Build in Internal

1. Develop feature in codebase
2. Create feature flag in `feature_flags` table
3. Add to `release_channel_feature_flags`:
   - `internal` → `enabled: true`
   - `pilot` → `enabled: false`
   - `general` → `enabled: false`
4. Deploy to Lovable preview
5. Test as Default Tenant (internal channel)

### Step 2: Verify in Internal

```sql
-- Verification query
SELECT 
  t.name AS tenant,
  t.release_channel,
  ff.key AS feature,
  COALESCE(tff.enabled, rcff.enabled, ff.default_enabled) AS enabled
FROM tenants t
CROSS JOIN feature_flags ff
LEFT JOIN tenant_feature_flags tff 
  ON tff.tenant_id = t.id AND tff.feature_flag_id = ff.id
LEFT JOIN release_channel_feature_flags rcff 
  ON rcff.feature_flag_id = ff.id AND rcff.release_channel = t.release_channel
WHERE ff.key = 'your_feature_key';
```

### Step 3: Promote to Pilot

1. Update `release_channel_feature_flags`:
   ```sql
   INSERT INTO release_channel_feature_flags (feature_flag_id, release_channel, enabled)
   SELECT id, 'pilot', true FROM feature_flags WHERE key = 'your_feature_key'
   ON CONFLICT (feature_flag_id, release_channel) 
   DO UPDATE SET enabled = true;
   ```
2. Notify pilot tenant users
3. Monitor for issues (1-2 week soak)

### Step 4: Verify Pilot Soak

**Check for:**
- No console errors specific to feature
- No support tickets from pilot tenant
- Edge function logs show no 500s
- Feature usage metrics are healthy

### Step 5: Promote to General

1. Update `release_channel_feature_flags`:
   ```sql
   UPDATE release_channel_feature_flags 
   SET enabled = true 
   WHERE feature_flag_id = (SELECT id FROM feature_flags WHERE key = 'your_feature_key')
   AND release_channel = 'general';
   ```
2. Or set global default:
   ```sql
   UPDATE feature_flags SET default_enabled = true WHERE key = 'your_feature_key';
   ```

---

## 5. Verification Gates

### Gate 1: Internal → Pilot

| Check | How |
|-------|-----|
| Feature works in Internal tenant | Manual testing |
| No console errors | Browser dev tools |
| Edge function logs clean | `supabase--edge-function-logs` |
| RLS policies correct | Run isolation audit |

### Gate 2: Pilot → General

| Check | How |
|-------|-----|
| 1+ week soak in Pilot | Calendar |
| No support issues from Pilot tenant | Check tickets |
| Performance acceptable | Check analytics |
| Tenant isolation verified | Run tenant-isolation-audit |

---

## 6. Emergency Rollback

### Kill a Feature Immediately

**Option 1: Killswitch**
```sql
UPDATE feature_flags 
SET is_killswitch = true, default_enabled = false 
WHERE key = 'broken_feature';
```

**Option 2: Channel Rollback**
```sql
UPDATE release_channel_feature_flags 
SET enabled = false 
WHERE feature_flag_id = (SELECT id FROM feature_flags WHERE key = 'broken_feature');
```

**Option 3: Tenant Override**
```sql
INSERT INTO tenant_feature_flags (tenant_id, feature_flag_id, enabled)
SELECT t.id, ff.id, false 
FROM tenants t, feature_flags ff 
WHERE ff.key = 'broken_feature'
ON CONFLICT (tenant_id, feature_flag_id) DO UPDATE SET enabled = false;
```

---

## 7. Tenant Isolation Verification

### After Every Rollout

1. **Run Schema Audit:**
   ```
   POST /functions/v1/tenant-isolation-audit
   { "mode": "both", "tenant_id": "<test_tenant_id>" }
   ```

2. **Check for NULL tenant_ids:**
   ```sql
   SELECT table_name, COUNT(*) 
   FROM (
     SELECT 'vehicles' AS table_name FROM vehicles WHERE tenant_id IS NULL
     UNION ALL
     SELECT 'loads' FROM loads WHERE tenant_id IS NULL
     UNION ALL
     SELECT 'customers' FROM customers WHERE tenant_id IS NULL
     -- ... add all tenant-owned tables
   ) nulls
   GROUP BY table_name;
   ```

3. **Cross-tenant Read Test:**
   - Log in as Tenant A user
   - Query loads/vehicles without filter
   - Verify only Tenant A data returned

---

## 8. Inspector Tools

Platform admins can use Inspector (internal channel only):

### Release Control Tab
- View all feature flags
- See channel defaults
- Test feature gate behavior per tenant

### Tenant Isolation Tests Tab
- Run automated isolation checks
- View RLS policy analysis
- Check for tenant_id gaps

---

## 9. Best Practices

1. **Always start disabled** - New features default to `false`
2. **Document breaking changes** - Update CHANGELOG
3. **Soak for 1+ weeks** - Don't rush to general
4. **Monitor after promotion** - Watch logs for 48 hours
5. **Communicate with pilot users** - They're your testers
6. **Have rollback ready** - Know the SQL before promoting
