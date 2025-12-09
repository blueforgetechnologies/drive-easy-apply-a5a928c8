-- Create screen share sessions table
CREATE TABLE public.screen_share_sessions (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  session_code VARCHAR(6) NOT NULL UNIQUE,
  admin_user_id UUID REFERENCES auth.users(id),
  client_user_id UUID REFERENCES auth.users(id),
  status VARCHAR(20) NOT NULL DEFAULT 'pending', -- pending, active, ended
  initiated_by VARCHAR(10) NOT NULL, -- 'admin' or 'client'
  admin_offer TEXT, -- WebRTC SDP offer
  client_answer TEXT, -- WebRTC SDP answer
  ice_candidates JSONB DEFAULT '[]'::jsonb,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  connected_at TIMESTAMP WITH TIME ZONE,
  ended_at TIMESTAMP WITH TIME ZONE,
  expires_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT (now() + interval '10 minutes')
);

-- Enable RLS
ALTER TABLE public.screen_share_sessions ENABLE ROW LEVEL SECURITY;

-- Admins can view all sessions
CREATE POLICY "Admins can view all sessions"
ON public.screen_share_sessions
FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Users can create sessions
CREATE POLICY "Users can create sessions"
ON public.screen_share_sessions
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Users can update their sessions
CREATE POLICY "Users can update their sessions"
ON public.screen_share_sessions
FOR UPDATE
USING (auth.uid() = admin_user_id OR auth.uid() = client_user_id);

-- Enable realtime for signaling
ALTER PUBLICATION supabase_realtime ADD TABLE public.screen_share_sessions;

-- Create index for session code lookups
CREATE INDEX idx_screen_share_session_code ON public.screen_share_sessions(session_code);
CREATE INDEX idx_screen_share_status ON public.screen_share_sessions(status);