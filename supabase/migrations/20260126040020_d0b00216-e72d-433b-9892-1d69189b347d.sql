-- Add heartbeat columns to screen_share_sessions for session cleanup
ALTER TABLE public.screen_share_sessions
ADD COLUMN IF NOT EXISTS last_heartbeat_at timestamptz,
ADD COLUMN IF NOT EXISTS last_heartbeat_by uuid;

-- Create index for efficient cleanup queries
CREATE INDEX IF NOT EXISTS idx_screen_share_sessions_heartbeat 
ON public.screen_share_sessions (status, last_heartbeat_at, created_at)
WHERE status IN ('pending', 'active');

-- Add comment for documentation
COMMENT ON COLUMN public.screen_share_sessions.last_heartbeat_at IS 'Last heartbeat timestamp from either participant';
COMMENT ON COLUMN public.screen_share_sessions.last_heartbeat_by IS 'User ID of last heartbeat sender';