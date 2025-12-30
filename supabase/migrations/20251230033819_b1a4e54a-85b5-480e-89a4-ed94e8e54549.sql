-- First drop the trigger and recreate the function to allow bootstrap
DROP TRIGGER IF EXISTS prevent_platform_admin_self_update ON public.profiles;

-- Recreate function to allow first platform admin to be set (check if any exist first)
CREATE OR REPLACE FUNCTION public.prevent_platform_admin_self_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  has_any_platform_admin boolean;
BEGIN
  -- If is_platform_admin is being changed
  IF OLD.is_platform_admin IS DISTINCT FROM NEW.is_platform_admin THEN
    -- Check if any platform admin exists
    SELECT EXISTS (SELECT 1 FROM public.profiles WHERE is_platform_admin = true) INTO has_any_platform_admin;
    
    -- Allow first platform admin to be set (bootstrap case)
    IF NOT has_any_platform_admin AND NEW.is_platform_admin = true THEN
      RETURN NEW;
    END IF;
    
    -- Only allow if the current user is already a platform admin
    IF NOT is_user_platform_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only platform admins can modify platform admin status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Recreate trigger
CREATE TRIGGER prevent_platform_admin_self_update
BEFORE UPDATE ON public.profiles
FOR EACH ROW
EXECUTE FUNCTION public.prevent_platform_admin_self_update();