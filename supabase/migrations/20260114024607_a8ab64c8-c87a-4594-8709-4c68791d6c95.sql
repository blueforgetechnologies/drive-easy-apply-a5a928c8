-- Create a trigger function to PREVENT cross-tenant matches at DB level
-- This is a defense-in-depth mechanism - even if code has a bug, DB will reject it
CREATE OR REPLACE FUNCTION public.validate_load_hunt_match_tenant_isolation()
RETURNS TRIGGER AS $$
DECLARE
  v_load_email_tenant_id uuid;
  v_hunt_plan_tenant_id uuid;
BEGIN
  -- Get tenant_id from load_email
  SELECT tenant_id INTO v_load_email_tenant_id
  FROM public.load_emails
  WHERE id = NEW.load_email_id;
  
  -- Get tenant_id from hunt_plan
  SELECT tenant_id INTO v_hunt_plan_tenant_id
  FROM public.hunt_plans
  WHERE id = NEW.hunt_plan_id;
  
  -- REJECT if tenants don't match (cross-tenant violation)
  IF v_load_email_tenant_id IS DISTINCT FROM v_hunt_plan_tenant_id THEN
    RAISE EXCEPTION 'TENANT ISOLATION VIOLATION: Cannot create match between load_email (tenant=%) and hunt_plan (tenant=%). Cross-tenant matches are forbidden.', 
      v_load_email_tenant_id, v_hunt_plan_tenant_id
      USING ERRCODE = '42501';
  END IF;
  
  -- Also ensure the match's tenant_id matches
  IF NEW.tenant_id IS NOT NULL AND NEW.tenant_id IS DISTINCT FROM v_load_email_tenant_id THEN
    RAISE EXCEPTION 'TENANT ISOLATION VIOLATION: Match tenant_id (%) does not match load_email tenant_id (%).',
      NEW.tenant_id, v_load_email_tenant_id
      USING ERRCODE = '42501';
  END IF;
  
  -- Auto-set tenant_id if not provided
  IF NEW.tenant_id IS NULL THEN
    NEW.tenant_id := v_load_email_tenant_id;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on load_hunt_matches
DROP TRIGGER IF EXISTS enforce_load_hunt_match_tenant_isolation ON public.load_hunt_matches;

CREATE TRIGGER enforce_load_hunt_match_tenant_isolation
  BEFORE INSERT ON public.load_hunt_matches
  FOR EACH ROW
  EXECUTE FUNCTION public.validate_load_hunt_match_tenant_isolation();

-- Add comment explaining the trigger
COMMENT ON FUNCTION public.validate_load_hunt_match_tenant_isolation() IS 
  'Defense-in-depth trigger that PREVENTS cross-tenant matches. Rejects any INSERT where load_email.tenant_id != hunt_plan.tenant_id.';