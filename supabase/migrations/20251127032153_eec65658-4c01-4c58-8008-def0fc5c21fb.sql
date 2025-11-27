-- Create invites table
CREATE TABLE public.invites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  invited_by UUID REFERENCES auth.users(id) NOT NULL,
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  accepted_at TIMESTAMP WITH TIME ZONE,
  UNIQUE(email)
);

-- Enable RLS
ALTER TABLE public.invites ENABLE ROW LEVEL SECURITY;

-- Admins can view all invites
CREATE POLICY "Admins can view all invites"
ON public.invites
FOR SELECT
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Admins can insert invites
CREATE POLICY "Admins can insert invites"
ON public.invites
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'));

-- Admins can delete invites
CREATE POLICY "Admins can delete invites"
ON public.invites
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'));

-- Update handle_new_user to auto-assign admin role for invited users
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_exists BOOLEAN;
BEGIN
  -- Insert profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    new.id,
    new.email,
    COALESCE(new.raw_user_meta_data->>'full_name', '')
  );
  
  -- Check if user was invited
  SELECT EXISTS (
    SELECT 1 FROM public.invites 
    WHERE email = new.email AND accepted_at IS NULL
  ) INTO invite_exists;
  
  -- If invited, assign admin role and mark invite as accepted
  IF invite_exists THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (new.id, 'admin');
    
    UPDATE public.invites 
    SET accepted_at = now()
    WHERE email = new.email;
  END IF;
  
  RETURN new;
END;
$$;