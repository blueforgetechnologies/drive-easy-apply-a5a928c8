-- Add sender email configuration for match notifications
ALTER TABLE public.tenants 
  ADD COLUMN IF NOT EXISTS match_notification_from_email text DEFAULT NULL;

COMMENT ON COLUMN public.tenants.match_notification_from_email IS 'Custom from email for match notifications (e.g., no.reply-matches@talbilogistics.com). Domain must be verified in Resend.';