-- Add split ICE candidate columns for proper signaling
ALTER TABLE public.screen_share_sessions
ADD COLUMN IF NOT EXISTS admin_ice_candidates jsonb DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS client_ice_candidates jsonb DEFAULT '[]'::jsonb;