-- Add additional profile fields
ALTER TABLE public.profiles
ADD COLUMN IF NOT EXISTS phone text,
ADD COLUMN IF NOT EXISTS phone_secondary text,
ADD COLUMN IF NOT EXISTS address text,
ADD COLUMN IF NOT EXISTS city text,
ADD COLUMN IF NOT EXISTS state text,
ADD COLUMN IF NOT EXISTS zip text,
ADD COLUMN IF NOT EXISTS country text DEFAULT 'USA',
ADD COLUMN IF NOT EXISTS notes text,
ADD COLUMN IF NOT EXISTS status text DEFAULT 'active';

-- Add RLS policy for admins to update profiles
CREATE POLICY "Admins can update profiles"
ON public.profiles
FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));