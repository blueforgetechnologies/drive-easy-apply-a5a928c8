-- Create trigger function to auto-provision dispatcher record when dispatcher role is assigned
CREATE OR REPLACE FUNCTION public.auto_provision_dispatcher()
RETURNS TRIGGER AS $$
DECLARE
  user_profile RECORD;
  user_tenant_id UUID;
  first_name_val TEXT;
  last_name_val TEXT;
BEGIN
  -- Only act on dispatcher role inserts
  IF NEW.role = 'dispatcher' THEN
    -- Get user profile info
    SELECT email, full_name, phone INTO user_profile
    FROM public.profiles
    WHERE id = NEW.user_id;
    
    -- Get user's tenant (first active tenant membership)
    SELECT tenant_id INTO user_tenant_id
    FROM public.tenant_users
    WHERE user_id = NEW.user_id AND is_active = true
    LIMIT 1;
    
    -- Parse name
    IF user_profile.full_name IS NOT NULL AND user_profile.full_name != '' THEN
      first_name_val := split_part(user_profile.full_name, ' ', 1);
      last_name_val := NULLIF(trim(substring(user_profile.full_name from position(' ' in user_profile.full_name))), '');
      IF last_name_val IS NULL OR last_name_val = '' THEN
        last_name_val := first_name_val;
      END IF;
    ELSE
      first_name_val := split_part(user_profile.email, '@', 1);
      last_name_val := first_name_val;
    END IF;
    
    -- Insert dispatcher if not exists (using user_id as unique key)
    INSERT INTO public.dispatchers (
      first_name,
      last_name,
      email,
      phone,
      user_id,
      tenant_id,
      status
    )
    VALUES (
      first_name_val,
      COALESCE(last_name_val, first_name_val),
      user_profile.email,
      user_profile.phone,
      NEW.user_id,
      user_tenant_id,
      'active'
    )
    ON CONFLICT (email) DO UPDATE SET
      user_id = EXCLUDED.user_id,
      tenant_id = COALESCE(public.dispatchers.tenant_id, EXCLUDED.tenant_id),
      status = COALESCE(public.dispatchers.status, 'active');
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger on user_roles table
DROP TRIGGER IF EXISTS trigger_auto_provision_dispatcher ON public.user_roles;
CREATE TRIGGER trigger_auto_provision_dispatcher
  AFTER INSERT ON public.user_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_provision_dispatcher();

-- BACKFILL: Create dispatcher records for all existing users with dispatcher role who don't have one
INSERT INTO public.dispatchers (first_name, last_name, email, phone, user_id, tenant_id, status)
SELECT 
  COALESCE(split_part(p.full_name, ' ', 1), split_part(p.email, '@', 1)) AS first_name,
  COALESCE(
    NULLIF(trim(substring(p.full_name from position(' ' in p.full_name))), ''),
    split_part(p.full_name, ' ', 1),
    split_part(p.email, '@', 1)
  ) AS last_name,
  p.email,
  p.phone,
  r.user_id,
  tu.tenant_id,
  'active'
FROM public.user_roles r
JOIN public.profiles p ON p.id = r.user_id
LEFT JOIN public.tenant_users tu ON tu.user_id = r.user_id AND tu.is_active = true
WHERE r.role = 'dispatcher'
  AND NOT EXISTS (
    SELECT 1 FROM public.dispatchers d WHERE d.user_id = r.user_id
  )
ON CONFLICT (email) DO UPDATE SET
  user_id = EXCLUDED.user_id,
  tenant_id = COALESCE(public.dispatchers.tenant_id, EXCLUDED.tenant_id);