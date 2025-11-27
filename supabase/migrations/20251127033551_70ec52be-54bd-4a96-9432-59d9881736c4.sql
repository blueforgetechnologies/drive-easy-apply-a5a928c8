-- Create driver_invites table to track sent invitations
CREATE TABLE public.driver_invites (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email TEXT NOT NULL,
  name TEXT,
  invited_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  invited_by UUID NOT NULL,
  opened_at TIMESTAMP WITH TIME ZONE,
  application_started_at TIMESTAMP WITH TIME ZONE
);

-- Enable RLS
ALTER TABLE public.driver_invites ENABLE ROW LEVEL SECURITY;

-- Admins can view all driver invites
CREATE POLICY "Admins can view all driver invites"
  ON public.driver_invites
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can insert driver invites
CREATE POLICY "Admins can insert driver invites"
  ON public.driver_invites
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Anyone can update opened_at (for tracking link clicks)
CREATE POLICY "Anyone can track invite opens"
  ON public.driver_invites
  FOR UPDATE
  USING (true)
  WITH CHECK (true);