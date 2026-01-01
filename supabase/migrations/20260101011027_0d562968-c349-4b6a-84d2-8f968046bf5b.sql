-- Fix is_platform_admin function to check profiles.is_platform_admin instead of user_roles
CREATE OR REPLACE FUNCTION public.is_platform_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
    SELECT COALESCE(
        (SELECT is_platform_admin FROM public.profiles WHERE id = _user_id),
        false
    )
$$;