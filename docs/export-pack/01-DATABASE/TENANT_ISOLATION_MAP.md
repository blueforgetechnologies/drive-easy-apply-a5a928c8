# Tenant Isolation Map

**Generated:** 2026-01-11

---

## Purpose

This document maps every tenant-owned table to:
1. How `tenant_id` is populated (source)
2. How reads are restricted (RLS policy summary)

---

## Critical Tables

### `loads`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | Client via `useTenantId()` on INSERT |
| **RLS SELECT** | `can_access_tenant(auth.uid(), tenant_id)` |
| **RLS INSERT** | `can_access_tenant(auth.uid(), tenant_id)` |
| **RLS UPDATE** | `can_access_tenant(auth.uid(), tenant_id)` |
| **RLS DELETE** | `can_access_tenant(auth.uid(), tenant_id)` |
| **Risk** | Low - properly gated |

### `vehicles`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | Client via `useTenantId()` on INSERT |
| **RLS SELECT** | `can_access_tenant(auth.uid(), tenant_id)` |
| **RLS INSERT** | `can_access_tenant(auth.uid(), tenant_id)` |
| **RLS UPDATE** | `can_access_tenant(auth.uid(), tenant_id)` |
| **RLS DELETE** | `can_access_tenant(auth.uid(), tenant_id)` |
| **Risk** | Low - properly gated |

### `customers`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | Client via `useTenantId()` on INSERT |
| **RLS SELECT** | `can_access_tenant(auth.uid(), tenant_id)` |
| **RLS INSERT** | `can_access_tenant(auth.uid(), tenant_id)` |
| **RLS UPDATE** | `can_access_tenant(auth.uid(), tenant_id)` |
| **RLS DELETE** | `can_access_tenant(auth.uid(), tenant_id)` |
| **Risk** | Low - properly gated |

### `load_emails`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | Edge function via `gmail_tokens.tenant_id` |
| **RLS SELECT** | `can_access_tenant(auth.uid(), tenant_id)` |
| **RLS INSERT** | Service role (scheduled job) |
| **RLS UPDATE** | `can_access_tenant(auth.uid(), tenant_id)` |
| **RLS DELETE** | Service role (archive job) |
| **Risk** | Medium - relies on gmail token mapping |

### `load_hunt_matches`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | Copied from `hunt_plans.tenant_id` on match creation |
| **RLS SELECT** | `can_access_tenant(auth.uid(), tenant_id)` |
| **RLS INSERT** | Service role (matching engine) |
| **RLS UPDATE** | `can_access_tenant(auth.uid(), tenant_id)` |
| **RLS DELETE** | `can_access_tenant(auth.uid(), tenant_id)` |
| **Risk** | Medium - depends on hunt_plan tenant accuracy |

---

## Support Tables

### `carriers`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | Client INSERT |
| **RLS** | Tenant membership check |
| **Note** | Used as FK in loads, vehicles |

### `dispatchers`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | Client INSERT |
| **RLS** | Tenant membership check |
| **Note** | Can be linked to user accounts |

### `applications`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | From `driver_invites.tenant_id` on creation |
| **RLS** | Tenant membership check + invite validation |
| **Note** | Contains PII - properly protected |

### `hunt_plans`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | Client INSERT via `useTenantId()` |
| **RLS** | Tenant membership check |
| **Note** | Source for match tenant_id |

---

## Integration Tables

### `gmail_tokens`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | Set during Gmail OAuth flow |
| **RLS** | Tenant membership check |
| **Note** | Critical for email routing |

### `tenant_integrations`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | Admin configuration |
| **RLS** | Tenant membership check |
| **Note** | Contains encrypted credentials |

### `vehicle_integrations`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | Copied from `vehicles.tenant_id` |
| **RLS** | Tenant membership check |
| **Note** | Samsara vehicle links |

---

## Financial Tables

### `invoices`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | Client INSERT |
| **RLS** | Tenant membership check |
| **Contains** | Customer names, amounts |

### `settlements`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | Client INSERT |
| **RLS** | Tenant membership check |
| **Contains** | Driver pay, deductions |

### `expenses`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | Client INSERT |
| **RLS** | Tenant membership check |
| **Contains** | Expense amounts, categories |

---

## Admin Tables

### `tenant_users`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | Set on membership creation |
| **RLS** | Own membership or platform admin |
| **Note** | Core authorization table |

### `tenant_feature_flags`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | Admin configuration |
| **RLS** | Tenant membership check |
| **Note** | Feature overrides |

### `tenant_feature_access`
| Aspect | Details |
|--------|---------|
| **tenant_id Source** | Admin configuration |
| **RLS** | Tenant membership check |
| **Note** | Per-user feature grants |

---

## Common RLS Functions

### `can_access_tenant(user_id, tenant_id)`
```sql
-- Returns true if:
-- 1. User is platform admin, OR
-- 2. User has active membership in tenant
SELECT 
  is_platform_admin(_user_id) 
  OR is_tenant_member(_user_id, _tenant_id)
```

### `is_tenant_member(user_id, tenant_id)`
```sql
-- Returns true if user has active membership
SELECT EXISTS (
  SELECT 1 FROM tenant_users 
  WHERE user_id = _user_id 
    AND tenant_id = _tenant_id 
    AND is_active = true
)
```

### `is_platform_admin(user_id)`
```sql
-- Returns true if user has platform admin flag
SELECT COALESCE(
  (SELECT is_platform_admin FROM profiles WHERE id = _user_id),
  false
)
```

---

## Isolation Verification Queries

### Check for NULL tenant_ids
```sql
SELECT 'loads' AS table_name, COUNT(*) AS null_count
FROM loads WHERE tenant_id IS NULL
UNION ALL
SELECT 'vehicles', COUNT(*) FROM vehicles WHERE tenant_id IS NULL
UNION ALL
SELECT 'customers', COUNT(*) FROM customers WHERE tenant_id IS NULL
UNION ALL
SELECT 'load_emails', COUNT(*) FROM load_emails WHERE tenant_id IS NULL;
```

### Cross-tenant access test
```sql
-- As authenticated user, this should only return their tenant's data
SELECT COUNT(*) as total, tenant_id 
FROM loads 
GROUP BY tenant_id;
-- Should show only one tenant_id (the user's)
```

### RLS bypass check
```sql
-- This should fail for non-platform-admin
SELECT * FROM loads WHERE tenant_id != (SELECT tenant_id FROM tenant_users WHERE user_id = auth.uid() LIMIT 1);
-- Should return 0 rows due to RLS
```
