-- Create table for tracking Google Cloud Pub/Sub usage
CREATE TABLE public.pubsub_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  month_year TEXT DEFAULT to_char(now(), 'YYYY-MM'),
  message_type TEXT DEFAULT 'gmail_notification',
  message_size_bytes INTEGER DEFAULT 0
);

-- Create table for tracking Resend email sends
CREATE TABLE public.email_send_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  month_year TEXT DEFAULT to_char(now(), 'YYYY-MM'),
  email_type TEXT NOT NULL, -- 'invite', 'driver_invite', 'application'
  recipient_email TEXT,
  success BOOLEAN DEFAULT true
);

-- Create table for tracking Lovable AI usage
CREATE TABLE public.ai_usage_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  month_year TEXT DEFAULT to_char(now(), 'YYYY-MM'),
  model TEXT,
  prompt_tokens INTEGER DEFAULT 0,
  completion_tokens INTEGER DEFAULT 0,
  total_tokens INTEGER DEFAULT 0,
  user_id UUID
);

-- Enable RLS
ALTER TABLE public.pubsub_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.email_send_tracking ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_usage_tracking ENABLE ROW LEVEL SECURITY;

-- RLS policies for authenticated users
CREATE POLICY "Authenticated users can view pubsub tracking" ON public.pubsub_tracking FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert pubsub tracking" ON public.pubsub_tracking FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can view email send tracking" ON public.email_send_tracking FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert email send tracking" ON public.email_send_tracking FOR INSERT TO authenticated WITH CHECK (true);

CREATE POLICY "Authenticated users can view AI usage tracking" ON public.ai_usage_tracking FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can insert AI usage tracking" ON public.ai_usage_tracking FOR INSERT TO authenticated WITH CHECK (true);

-- Service role policies for edge functions
CREATE POLICY "Service role can insert pubsub tracking" ON public.pubsub_tracking FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can insert email send tracking" ON public.email_send_tracking FOR INSERT TO service_role WITH CHECK (true);
CREATE POLICY "Service role can insert AI usage tracking" ON public.ai_usage_tracking FOR INSERT TO service_role WITH CHECK (true);

-- Add indexes for efficient querying
CREATE INDEX idx_pubsub_tracking_month ON public.pubsub_tracking(month_year);
CREATE INDEX idx_email_send_tracking_month ON public.email_send_tracking(month_year);
CREATE INDEX idx_ai_usage_tracking_month ON public.ai_usage_tracking(month_year);