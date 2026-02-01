
-- Improve match_customer_by_broker_name to use word-based matching
-- This handles cases like "MILLHOUSE LOGISTICS INC" matching "MILLHOUSE LOGISTICS SERVICES LLC"
CREATE OR REPLACE FUNCTION public.match_customer_by_broker_name(p_tenant_id uuid, p_broker_name text)
 RETURNS TABLE(id uuid, name text, mc_number text, otr_approval_status text, alias_names text[])
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  WITH q AS (
    SELECT trim(regexp_replace(lower(coalesce(p_broker_name,'')), '\s+', ' ', 'g')) AS needle
  ),
  -- Extract first 2-3 significant words from the broker name (skip common suffixes)
  words AS (
    SELECT 
      (regexp_split_to_array(
        regexp_replace(
          (SELECT needle FROM q), 
          '\s*(llc|inc|corp|ltd|co|company|logistics|services|express|freight|trucking|transportation)\s*', 
          ' ', 
          'gi'
        ),
        '\s+'
      ))[1] AS word1,
      (regexp_split_to_array(
        regexp_replace(
          (SELECT needle FROM q), 
          '\s*(llc|inc|corp|ltd|co|company)\s*', 
          ' ', 
          'gi'
        ),
        '\s+'
      ))[2] AS word2
  )
  SELECT c.id, c.name, c.mc_number, c.otr_approval_status, c.alias_names
  FROM customers c, q, words
  WHERE c.tenant_id = p_tenant_id
    AND (
      -- Exact match (case-insensitive)
      lower(c.name) = q.needle
      -- Original contains-style match (shorter name inside longer)
      OR lower(c.name) LIKE '%' || q.needle || '%'
      OR q.needle LIKE '%' || lower(c.name) || '%'
      -- Word-based match: both first word and second word found in customer name
      OR (
        words.word1 IS NOT NULL 
        AND length(words.word1) > 2
        AND lower(c.name) LIKE '%' || words.word1 || '%'
        AND (
          words.word2 IS NULL 
          OR length(words.word2) <= 2
          OR lower(c.name) LIKE '%' || words.word2 || '%'
        )
      )
      -- Alias matching with same logic
      OR EXISTS (
        SELECT 1
        FROM unnest(coalesce(c.alias_names, ARRAY[]::text[])) a
        WHERE lower(a) LIKE '%' || q.needle || '%'
           OR q.needle LIKE '%' || lower(a) || '%'
           OR (
             words.word1 IS NOT NULL 
             AND length(words.word1) > 2
             AND lower(a) LIKE '%' || words.word1 || '%'
           )
      )
    )
  ORDER BY
    CASE
      WHEN lower(c.name) = q.needle THEN 0
      WHEN lower(c.name) LIKE q.needle || '%' THEN 1
      WHEN q.needle LIKE lower(c.name) || '%' THEN 2
      WHEN words.word1 IS NOT NULL AND lower(c.name) LIKE '%' || words.word1 || '%' THEN 3
      ELSE 4
    END,
    length(c.name) ASC
  LIMIT 1;
$function$;
