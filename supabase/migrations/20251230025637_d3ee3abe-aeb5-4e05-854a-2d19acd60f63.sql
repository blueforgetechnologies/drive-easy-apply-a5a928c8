-- Add audit trigger for feature_flags table
CREATE OR REPLACE FUNCTION public.log_feature_flag_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    INSERT INTO public.feature_flag_audit_log (
      feature_flag_id,
      action,
      old_value,
      new_value,
      changed_by,
      tenant_id
    ) VALUES (
      NEW.id,
      'global_toggle',
      jsonb_build_object('default_enabled', OLD.default_enabled, 'is_killswitch', OLD.is_killswitch),
      jsonb_build_object('default_enabled', NEW.default_enabled, 'is_killswitch', NEW.is_killswitch),
      auth.uid(),
      NULL
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for feature_flags
DROP TRIGGER IF EXISTS trigger_log_feature_flag_changes ON public.feature_flags;
CREATE TRIGGER trigger_log_feature_flag_changes
  AFTER UPDATE ON public.feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.log_feature_flag_changes();

-- Add audit trigger for tenant_feature_flags table
CREATE OR REPLACE FUNCTION public.log_tenant_feature_flag_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.feature_flag_audit_log (
      feature_flag_id,
      action,
      old_value,
      new_value,
      changed_by,
      tenant_id
    ) VALUES (
      NEW.feature_flag_id,
      'tenant_override_created',
      NULL,
      jsonb_build_object('enabled', NEW.enabled),
      auth.uid(),
      NEW.tenant_id
    );
  ELSIF TG_OP = 'UPDATE' THEN
    INSERT INTO public.feature_flag_audit_log (
      feature_flag_id,
      action,
      old_value,
      new_value,
      changed_by,
      tenant_id
    ) VALUES (
      NEW.feature_flag_id,
      'tenant_override_updated',
      jsonb_build_object('enabled', OLD.enabled),
      jsonb_build_object('enabled', NEW.enabled),
      auth.uid(),
      NEW.tenant_id
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for tenant_feature_flags
DROP TRIGGER IF EXISTS trigger_log_tenant_feature_flag_changes ON public.tenant_feature_flags;
CREATE TRIGGER trigger_log_tenant_feature_flag_changes
  AFTER INSERT OR UPDATE ON public.tenant_feature_flags
  FOR EACH ROW
  EXECUTE FUNCTION public.log_tenant_feature_flag_changes();

-- Add tenant_audit_log table for tenant changes
CREATE TABLE IF NOT EXISTS public.tenant_audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL,
  action TEXT NOT NULL,
  old_value JSONB,
  new_value JSONB,
  changed_by UUID,
  changed_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.tenant_audit_log ENABLE ROW LEVEL SECURITY;

-- Platform admins can view all audit logs
CREATE POLICY "Platform admins can view tenant audit logs"
  ON public.tenant_audit_log
  FOR SELECT
  USING (is_platform_admin(auth.uid()));

-- Service role can insert
CREATE POLICY "System can insert tenant audit logs"
  ON public.tenant_audit_log
  FOR INSERT
  WITH CHECK (true);

-- Add audit trigger for tenants table
CREATE OR REPLACE FUNCTION public.log_tenant_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF TG_OP = 'UPDATE' THEN
    -- Only log meaningful changes
    IF OLD.is_paused IS DISTINCT FROM NEW.is_paused
       OR OLD.release_channel IS DISTINCT FROM NEW.release_channel
       OR OLD.rate_limit_per_minute IS DISTINCT FROM NEW.rate_limit_per_minute
       OR OLD.rate_limit_per_day IS DISTINCT FROM NEW.rate_limit_per_day
       OR OLD.status IS DISTINCT FROM NEW.status THEN
      INSERT INTO public.tenant_audit_log (
        tenant_id,
        action,
        old_value,
        new_value,
        changed_by
      ) VALUES (
        NEW.id,
        CASE 
          WHEN OLD.is_paused IS DISTINCT FROM NEW.is_paused THEN 
            CASE WHEN NEW.is_paused THEN 'tenant_paused' ELSE 'tenant_resumed' END
          WHEN OLD.release_channel IS DISTINCT FROM NEW.release_channel THEN 'release_channel_changed'
          WHEN OLD.rate_limit_per_minute IS DISTINCT FROM NEW.rate_limit_per_minute 
               OR OLD.rate_limit_per_day IS DISTINCT FROM NEW.rate_limit_per_day THEN 'rate_limits_changed'
          ELSE 'tenant_updated'
        END,
        jsonb_build_object(
          'is_paused', OLD.is_paused,
          'release_channel', OLD.release_channel,
          'rate_limit_per_minute', OLD.rate_limit_per_minute,
          'rate_limit_per_day', OLD.rate_limit_per_day,
          'status', OLD.status
        ),
        jsonb_build_object(
          'is_paused', NEW.is_paused,
          'release_channel', NEW.release_channel,
          'rate_limit_per_minute', NEW.rate_limit_per_minute,
          'rate_limit_per_day', NEW.rate_limit_per_day,
          'status', NEW.status
        ),
        auth.uid()
      );
    END IF;
  ELSIF TG_OP = 'INSERT' THEN
    INSERT INTO public.tenant_audit_log (
      tenant_id,
      action,
      old_value,
      new_value,
      changed_by
    ) VALUES (
      NEW.id,
      'tenant_created',
      NULL,
      jsonb_build_object('name', NEW.name, 'slug', NEW.slug),
      auth.uid()
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger for tenants
DROP TRIGGER IF EXISTS trigger_log_tenant_changes ON public.tenants;
CREATE TRIGGER trigger_log_tenant_changes
  AFTER INSERT OR UPDATE ON public.tenants
  FOR EACH ROW
  EXECUTE FUNCTION public.log_tenant_changes();