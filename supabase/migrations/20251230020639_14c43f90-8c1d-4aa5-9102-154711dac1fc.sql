
-- Add display settings to tenants
ALTER TABLE public.tenants 
ADD COLUMN IF NOT EXISTS logo_url TEXT,
ADD COLUMN IF NOT EXISTS primary_color TEXT DEFAULT '#3b82f6',
ADD COLUMN IF NOT EXISTS timezone TEXT DEFAULT 'America/New_York';

-- Create tenant invitations table for inviting users to join a tenant
CREATE TABLE IF NOT EXISTS public.tenant_invitations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'member',
  invited_by UUID NOT NULL,
  invited_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  accepted_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '7 days'),
  token TEXT UNIQUE NOT NULL DEFAULT encode(gen_random_bytes(32), 'hex')
);

-- Enable RLS
ALTER TABLE public.tenant_invitations ENABLE ROW LEVEL SECURITY;

-- Policies for tenant invitations
CREATE POLICY "Tenant admins can manage invitations"
ON public.tenant_invitations
FOR ALL
TO authenticated
USING (
  public.is_platform_admin(auth.uid()) 
  OR public.has_tenant_role(auth.uid(), tenant_id, 'admin')
  OR public.has_tenant_role(auth.uid(), tenant_id, 'owner')
);

-- Users can view invitations sent to their email
CREATE POLICY "Users can view their own invitations"
ON public.tenant_invitations
FOR SELECT
TO authenticated
USING (LOWER(email) = LOWER((SELECT email FROM auth.users WHERE id = auth.uid())));

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_email ON public.tenant_invitations(LOWER(email));
CREATE INDEX IF NOT EXISTS idx_tenant_invitations_token ON public.tenant_invitations(token);

-- Function to accept a tenant invitation
CREATE OR REPLACE FUNCTION public.accept_tenant_invitation(p_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invitation RECORD;
  v_user_id UUID;
  v_user_email TEXT;
BEGIN
  v_user_id := auth.uid();
  
  IF v_user_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Not authenticated');
  END IF;
  
  -- Get user email
  SELECT email INTO v_user_email FROM auth.users WHERE id = v_user_id;
  
  -- Find the invitation
  SELECT * INTO v_invitation 
  FROM public.tenant_invitations 
  WHERE token = p_token 
    AND accepted_at IS NULL 
    AND expires_at > now();
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invalid or expired invitation');
  END IF;
  
  -- Check email matches
  IF LOWER(v_invitation.email) != LOWER(v_user_email) THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invitation is for a different email address');
  END IF;
  
  -- Add user to tenant
  INSERT INTO public.tenant_users (tenant_id, user_id, role)
  VALUES (v_invitation.tenant_id, v_user_id, v_invitation.role)
  ON CONFLICT (tenant_id, user_id) DO UPDATE SET role = v_invitation.role, is_active = true;
  
  -- Mark invitation as accepted
  UPDATE public.tenant_invitations 
  SET accepted_at = now() 
  WHERE id = v_invitation.id;
  
  RETURN jsonb_build_object(
    'success', true, 
    'tenant_id', v_invitation.tenant_id,
    'role', v_invitation.role
  );
END;
$$;
