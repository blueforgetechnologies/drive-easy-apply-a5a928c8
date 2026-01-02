-- Drop the existing view first
DROP VIEW IF EXISTS public.tenant_integrations_safe;

CREATE OR REPLACE FUNCTION public.get_tenant_integrations_safe(p_tenant_id uuid)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  provider text,
  is_enabled boolean,
  credentials_hint text,
  settings jsonb,
  sync_status text,
  error_message text,
  last_checked_at timestamptz,
  last_sync_at timestamptz,
  is_configured boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT can_access_tenant(auth.uid(), p_tenant_id) THEN
    RAISE EXCEPTION 'Access denied'
      USING ERRCODE = '42501';
  END IF;
  RETURN QUERY
  SELECT
    ti.id,
    ti.tenant_id,
    ti.provider,
    ti.is_enabled,
    ti.credentials_hint,
    ti.settings,
    ti.sync_status,
    ti.error_message,
    ti.last_checked_at,
    ti.last_sync_at,
    (ti.credentials_encrypted IS NOT NULL AND ti.credentials_encrypted <> '') AS is_configured
  FROM public.tenant_integrations ti
  WHERE ti.tenant_id = p_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_tenant_integrations_safe(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.get_tenant_integrations_safe(uuid) FROM anon, public;