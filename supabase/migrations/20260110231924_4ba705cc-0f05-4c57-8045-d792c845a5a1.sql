
-- Step 1: Backup and modify the enforce_tenant_isolation function to allow admin migrations
CREATE OR REPLACE FUNCTION public.enforce_tenant_isolation()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current_tenant_id uuid;
BEGIN
  -- Get current tenant from JWT claims via tenant_users membership
  v_current_tenant_id := get_current_tenant_id();
  
  -- For INSERT: auto-set tenant_id if null, block if wrong tenant
  IF TG_OP = 'INSERT' THEN
    IF NEW.tenant_id IS NULL THEN
      IF v_current_tenant_id IS NULL THEN
        RAISE EXCEPTION 'Cannot insert without tenant context. Please ensure you are logged in and have tenant membership.';
      END IF;
      NEW.tenant_id := v_current_tenant_id;
    ELSIF NEW.tenant_id != v_current_tenant_id THEN
      -- Allow platform admins to insert for any tenant
      IF NOT is_platform_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Cross-tenant write blocked. You cannot insert data for tenant % when your context is %.', NEW.tenant_id, v_current_tenant_id;
      END IF;
    END IF;
  END IF;
  
  -- For UPDATE: ALLOW platform admins to change tenant_id (for data migration)
  IF TG_OP = 'UPDATE' THEN
    IF OLD.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
      IF NOT is_platform_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Cannot change tenant_id of existing record.';
      END IF;
      -- Platform admins CAN now change tenant_id
    END IF;
  END IF;
  
  RETURN NEW;
END;
$function$;
