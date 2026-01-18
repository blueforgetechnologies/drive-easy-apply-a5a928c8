-- Fix feature flag resolution so runtime respects release channels (pilot/internal/general)
-- The frontend rollouts UI already writes to release_channel_feature_flags,
-- but the runtime resolver (used by worker/webhook) previously ignored it.

CREATE OR REPLACE FUNCTION public.is_feature_enabled(
  _tenant_id uuid,
  _feature_key text,
  _user_role text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_flag public.feature_flags%ROWTYPE;
  v_override RECORD;
  v_tenant_channel text;
  v_channel_enabled boolean;
BEGIN
  -- Get the feature flag definition
  SELECT *
  INTO v_flag
  FROM public.feature_flags
  WHERE key = _feature_key;

  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Killswitch (globally disabled) overrides everything
  IF v_flag.is_killswitch AND NOT v_flag.default_enabled THEN
    RETURN false;
  END IF;

  -- Tenant-specific override takes priority over channel defaults
  SELECT *
  INTO v_override
  FROM public.tenant_feature_flags
  WHERE tenant_id = _tenant_id
    AND feature_flag_id = v_flag.id;

  IF FOUND THEN
    -- Role restriction (if configured)
    IF v_override.enabled_for_roles IS NOT NULL AND array_length(v_override.enabled_for_roles, 1) > 0 THEN
      IF _user_role IS NULL OR NOT (_user_role = ANY(v_override.enabled_for_roles)) THEN
        RETURN false;
      END IF;
    END IF;

    RETURN v_override.enabled;
  END IF;

  -- Release channel default (pilot/internal/general)
  SELECT t.release_channel::text
  INTO v_tenant_channel
  FROM public.tenants t
  WHERE t.id = _tenant_id;

  IF v_tenant_channel IS NOT NULL THEN
    SELECT rcff.enabled
    INTO v_channel_enabled
    FROM public.release_channel_feature_flags rcff
    WHERE rcff.feature_flag_id = v_flag.id
      AND rcff.release_channel = v_tenant_channel
    LIMIT 1;

    IF FOUND THEN
      RETURN v_channel_enabled;
    END IF;
  END IF;

  -- Global default
  RETURN COALESCE(v_flag.default_enabled, false);
END;
$function$;
