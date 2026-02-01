-- RPC function to match customers by broker name (searches name + alias_names)
-- Tenant-safe, deterministic ordering, handles text[] array search
CREATE OR REPLACE FUNCTION public.match_customer_by_broker_name(p_tenant_id uuid, p_broker_name text)
RETURNS TABLE (
  id uuid,
  name text,
  mc_number text,
  otr_approval_status text,
  alias_names text[]
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH q AS (
    SELECT trim(regexp_replace(lower(coalesce(p_broker_name,'')), '\s+', ' ', 'g')) AS needle
  )
  SELECT c.id, c.name, c.mc_number, c.otr_approval_status, c.alias_names
  FROM customers c, q
  WHERE c.tenant_id = p_tenant_id
    AND (
      lower(c.name) LIKE '%' || q.needle || '%'
      OR EXISTS (
        SELECT 1
        FROM unnest(coalesce(c.alias_names, ARRAY[]::text[])) a
        WHERE lower(a) LIKE '%' || q.needle || '%'
      )
    )
  ORDER BY
    CASE
      WHEN lower(c.name) = q.needle THEN 0
      WHEN lower(c.name) LIKE q.needle || '%' THEN 1
      ELSE 2
    END,
    length(c.name) ASC
  LIMIT 1;
$$;