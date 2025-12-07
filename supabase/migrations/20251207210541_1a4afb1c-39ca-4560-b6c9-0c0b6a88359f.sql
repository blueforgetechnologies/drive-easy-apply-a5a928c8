-- Add invite_id column to applications table to link applications to invites
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS invite_id uuid REFERENCES public.driver_invites(id);

-- Drop the overly permissive "Anyone can insert applications" policy
DROP POLICY IF EXISTS "Anyone can insert applications" ON public.applications;

-- Create a new policy that requires a valid invite token
-- Applications can only be inserted if the invite_id exists in driver_invites
CREATE POLICY "Applications require valid invite" 
ON public.applications 
FOR INSERT 
WITH CHECK (
  invite_id IS NOT NULL 
  AND EXISTS (
    SELECT 1 FROM public.driver_invites 
    WHERE id = invite_id 
    AND application_started_at IS NULL
  )
);

-- Also allow admins to insert applications (for manual entry)
CREATE POLICY "Admins can insert applications" 
ON public.applications 
FOR INSERT 
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));