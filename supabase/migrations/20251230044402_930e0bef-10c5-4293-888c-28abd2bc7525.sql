-- Create release channel feature flags table for channel-specific defaults
CREATE TABLE public.release_channel_feature_flags (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  release_channel TEXT NOT NULL CHECK (release_channel IN ('internal', 'pilot', 'general')),
  feature_flag_id UUID NOT NULL REFERENCES public.feature_flags(id) ON DELETE CASCADE,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(release_channel, feature_flag_id)
);

-- Enable RLS
ALTER TABLE public.release_channel_feature_flags ENABLE ROW LEVEL SECURITY;

-- Platform admins can manage channel defaults
CREATE POLICY "Platform admins can manage channel defaults"
ON public.release_channel_feature_flags
FOR ALL
USING (is_user_platform_admin(auth.uid()));

-- Authenticated users can view channel defaults
CREATE POLICY "Authenticated users can view channel defaults"
ON public.release_channel_feature_flags
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Create trigger for updated_at
CREATE TRIGGER update_release_channel_feature_flags_updated_at
BEFORE UPDATE ON public.release_channel_feature_flags
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Seed initial data for existing feature flags
-- Internal channel gets all features enabled (for testing)
-- Pilot channel gets most features enabled
-- General channel gets stable features only

-- First, let's insert for internal channel (all features enabled)
INSERT INTO public.release_channel_feature_flags (release_channel, feature_flag_id, enabled)
SELECT 'internal', id, true FROM public.feature_flags;

-- For pilot channel (most features enabled)
INSERT INTO public.release_channel_feature_flags (release_channel, feature_flag_id, enabled)
SELECT 'pilot', id, true FROM public.feature_flags;

-- For general channel (conservative - only non-experimental features)
INSERT INTO public.release_channel_feature_flags (release_channel, feature_flag_id, enabled)
SELECT 'general', id, default_enabled FROM public.feature_flags;