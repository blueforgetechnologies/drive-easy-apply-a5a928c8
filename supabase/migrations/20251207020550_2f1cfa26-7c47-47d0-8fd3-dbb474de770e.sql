-- Drop the overly permissive user_roles_select policy that allows any authenticated user to read all roles
DROP POLICY IF EXISTS "user_roles_select" ON public.user_roles;

-- Ensure the admin-only policy exists for viewing roles
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies 
    WHERE schemaname = 'public' 
    AND tablename = 'user_roles' 
    AND policyname = 'Admins can view all roles'
  ) THEN
    CREATE POLICY "Admins can view all roles"
    ON public.user_roles
    FOR SELECT
    USING (public.has_role(auth.uid(), 'admin'));
  END IF;
END $$;