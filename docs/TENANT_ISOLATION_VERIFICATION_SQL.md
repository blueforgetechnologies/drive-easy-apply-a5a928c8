# Tenant Isolation Verification SQL Snippets

Use these queries to verify tenant isolation for Gmail ingestion.

## 1. Last 20 load_emails grouped by tenant_id

```sql
SELECT 
  tenant_id,
  COUNT(*) as email_count,
  MAX(received_at) as latest_received
FROM load_emails
WHERE received_at > now() - interval '7 days'
GROUP BY tenant_id
ORDER BY latest_received DESC
LIMIT 20;
```

## 2. Check for NULL tenant_id (should return 0 rows)

```sql
SELECT id, email_id, subject, from_email, received_at, email_source
FROM load_emails
WHERE tenant_id IS NULL
ORDER BY received_at DESC
LIMIT 50;
```

## 3. Verify gmail_tokens have tenant_id set

```sql
SELECT user_email, tenant_id, updated_at
FROM gmail_tokens
ORDER BY updated_at DESC;
```

## 4. Check for any orphaned tokens (no tenant mapping)

```sql
SELECT user_email, tenant_id
FROM gmail_tokens
WHERE tenant_id IS NULL;
```

## Expected Results

- Query 1: Shows distribution of load_emails across tenants
- Query 2: **MUST return 0 rows** - any NULL tenant_id is a critical isolation failure
- Query 3: All gmail tokens should have tenant_id set
- Query 4: **MUST return 0 rows** - all tokens need tenant mapping
