-- Add is_platform_admin column to profiles
ALTER TABLE public.profiles 
ADD COLUMN IF NOT EXISTS is_platform_admin boolean NOT NULL DEFAULT false;

-- Drop overly permissive update policy
DROP POLICY IF EXISTS "profiles_update" ON public.profiles;

-- Create policy: Users can update their own profile (excluding is_platform_admin)
CREATE POLICY "Users can update own profile fields"
ON public.profiles
FOR UPDATE
USING (auth.uid() = id)
WITH CHECK (auth.uid() = id);

-- Create a security definer function to check platform admin status
-- This avoids RLS recursion and provides a reliable check
CREATE OR REPLACE FUNCTION public.is_user_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(
    (SELECT is_platform_admin FROM public.profiles WHERE id = _user_id),
    false
  )
$$;

-- Create trigger function to prevent users from updating is_platform_admin
CREATE OR REPLACE FUNCTION public.prevent_platform_admin_self_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- If is_platform_admin is being changed and user is not already a platform admin
  IF OLD.is_platform_admin IS DISTINCT FROM NEW.is_platform_admin THEN
    -- Only allow if the current user is already a platform admin
    IF NOT is_platform_admin(auth.uid()) THEN
      RAISE EXCEPTION 'Only platform admins can modify platform admin status';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- Create trigger to enforce the restriction
DROP TRIGGER IF EXISTS prevent_platform_admin_update ON public.profiles;
CREATE TRIGGER prevent_platform_admin_update
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_platform_admin_self_update();