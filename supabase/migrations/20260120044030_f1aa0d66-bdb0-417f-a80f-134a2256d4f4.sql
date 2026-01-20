-- Add match notification settings to tenants
ALTER TABLE public.tenants 
  ADD COLUMN IF NOT EXISTS match_notifications_enabled boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS match_notification_emails text[] DEFAULT '{}';

-- Add comment for documentation
COMMENT ON COLUMN public.tenants.match_notifications_enabled IS 'When true, dispatchers receive email notifications when new load matches are found';
COMMENT ON COLUMN public.tenants.match_notification_emails IS 'Optional array of specific email addresses to notify. If empty, uses dispatcher emails from tenant_users';

-- Create a feature flag for match notifications if not exists
INSERT INTO public.feature_flags (key, name, description, default_enabled, is_killswitch)
VALUES (
  'match_notifications', 
  'Match Notifications', 
  'Send email notifications to dispatchers when new load matches are found',
  false,
  false
)
ON CONFLICT (key) DO NOTHING;