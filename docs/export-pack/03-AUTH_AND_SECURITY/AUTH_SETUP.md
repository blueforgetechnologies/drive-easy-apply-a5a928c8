# Authentication & Security Setup

**Generated:** 2026-01-11

---

## 1. Authentication Provider

**Provider:** Supabase Auth (built-in)

**Methods Enabled:**
- Email/Password ✅
- Magic Link (disabled)
- OAuth (disabled)
- Anonymous (disabled)

**Configuration:**
- Auto-confirm email: Enabled (for development)
- Disable signup: No
- JWT expiry: Default (1 hour)

---

## 2. User Registration Flow

```
1. User submits email/password on Auth page
2. Supabase creates auth.users record
3. Trigger `handle_new_user()` fires:
   - Creates profiles record
   - Checks for pending invite
   - If invited: assigns admin role, marks invite accepted
4. User redirected to Dashboard
5. TenantContext loads memberships
```

---

## 3. Roles Architecture

### App-Level Roles (`user_roles` table)

| Role | Purpose |
|------|---------|
| `admin` | Full tenant access |
| `dispatcher` | Load management |
| `driver` | Limited mobile access |

### Tenant-Level Roles (`tenant_users.role`)

| Role | Purpose |
|------|---------|
| `owner` | Tenant owner, full access |
| `admin` | Tenant admin |
| `member` | Standard member |

### Platform-Level (`profiles.is_platform_admin`)

| Flag | Purpose |
|------|---------|
| `true` | Cross-tenant access, system admin |
| `false` | Normal user |

---

## 4. Authorization Functions

### `is_platform_admin(user_id)`
```sql
SELECT COALESCE(
  (SELECT is_platform_admin FROM profiles WHERE id = _user_id),
  false
)
```
Used for: Platform admin checks in RLS policies

### `is_tenant_member(user_id, tenant_id)`
```sql
SELECT EXISTS (
  SELECT 1 FROM tenant_users 
  WHERE user_id = _user_id 
    AND tenant_id = _tenant_id 
    AND is_active = true
)
```
Used for: Tenant membership validation

### `can_access_tenant(user_id, tenant_id)`
```sql
SELECT 
  is_platform_admin(_user_id) 
  OR is_tenant_member(_user_id, _tenant_id)
```
Used for: Combined access check (most common)

### `has_role(user_id, role)`
```sql
SELECT EXISTS (
  SELECT 1 FROM user_roles
  WHERE user_id = _user_id AND role = _role
)
```
Used for: App role checks

### `has_permission(user_id, permission_code)`
```sql
SELECT 
  has_role(_user_id, 'admin')
  OR EXISTS (
    SELECT 1 FROM user_custom_roles ucr
    JOIN role_permissions rp ON rp.role_id = ucr.role_id
    JOIN permissions p ON p.id = rp.permission_id
    WHERE ucr.user_id = _user_id AND p.code = _permission_code
  )
```
Used for: Fine-grained permission checks

---

## 5. JWT Claims

### Standard Claims
```json
{
  "aud": "authenticated",
  "exp": 1768093923,
  "sub": "187b7621-71c5-412f-95c5-b303415fa088",
  "email": "user@example.com",
  "role": "authenticated"
}
```

### Custom Claims (Not Currently Used)
The system does NOT use custom JWT claims for tenant_id. Instead:
- Tenant context is looked up from `tenant_users` table
- This ensures fresh membership data on every request
- Trade-off: Extra DB query vs stale claims

---

## 6. Session Management

### Client-Side Storage

| Key | Storage | Purpose |
|-----|---------|---------|
| `sb-vvbdmjjovzcfmfqywoty-auth-token` | localStorage | Supabase auth token |
| `tms.currentTenantId` | localStorage | Last selected tenant |
| `tms.adminImpersonationSession` | localStorage | Active impersonation |

### Session Validation
- Supabase handles JWT validation automatically
- Impersonation sessions validated server-side every 30 seconds
- Tenant context refreshed on auth state change

---

## 7. RLS Policy Patterns

### Pattern 1: Tenant Membership
```sql
CREATE POLICY "Users can view their tenant's loads"
ON loads FOR SELECT
USING (can_access_tenant(auth.uid(), tenant_id));
```

### Pattern 2: Platform Admin Override
```sql
CREATE POLICY "Platform admins can view all"
ON tenants FOR SELECT
USING (is_platform_admin(auth.uid()));
```

### Pattern 3: Owner-Only
```sql
CREATE POLICY "Users can view own profile"
ON profiles FOR SELECT
USING (id = auth.uid());
```

### Pattern 4: Public Read
```sql
CREATE POLICY "Feature flags are readable"
ON feature_flags FOR SELECT
USING (true);
```

---

## 8. Security Boundaries

### What Authenticated Users Can Do
- ✅ Access data in their tenant(s)
- ✅ CRUD on tenant-owned resources
- ✅ View global config (feature flags, plans)
- ❌ Access other tenants' data
- ❌ Modify global config
- ❌ See platform admin tools

### What Platform Admins Can Do
- ✅ Everything authenticated users can do
- ✅ Access any tenant's data
- ✅ Impersonate tenants
- ✅ Modify feature flags
- ✅ Access Inspector tools
- ✅ Create/suspend tenants

### What Service Role Can Do
- ✅ Bypass all RLS policies
- ✅ Access all data
- ⚠️ Only used in Edge Functions
- ⚠️ Only after JWT validation

---

## 9. Attack Surface

### Protected
- ✅ SQL injection (parameterized queries)
- ✅ Cross-tenant data access (RLS)
- ✅ Unauthorized API access (JWT validation)
- ✅ Session hijacking (short JWT expiry)

### Considerations
- ⚠️ localStorage can be manipulated (but RLS protects data)
- ⚠️ Service role key in Edge Functions (must be kept secret)
- ⚠️ Email enumeration possible (signup errors reveal existence)
