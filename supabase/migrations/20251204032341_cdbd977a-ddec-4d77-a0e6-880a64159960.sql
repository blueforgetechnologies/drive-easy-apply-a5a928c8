
-- Create table for hourly email volume tracking
CREATE TABLE public.email_volume_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recorded_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  hour_start TIMESTAMP WITH TIME ZONE NOT NULL,
  emails_received INTEGER NOT NULL DEFAULT 0,
  emails_processed INTEGER NOT NULL DEFAULT 0,
  emails_pending INTEGER NOT NULL DEFAULT 0,
  emails_failed INTEGER NOT NULL DEFAULT 0,
  avg_processing_time_ms INTEGER,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_email_volume_stats_hour ON public.email_volume_stats(hour_start DESC);
CREATE INDEX idx_email_volume_stats_recorded ON public.email_volume_stats(recorded_at DESC);

-- Add unique constraint to prevent duplicate hourly records
ALTER TABLE public.email_volume_stats ADD CONSTRAINT unique_hour_start UNIQUE (hour_start);

-- Enable RLS
ALTER TABLE public.email_volume_stats ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Authenticated users can view email stats"
ON public.email_volume_stats
FOR SELECT
USING (auth.uid() IS NOT NULL);
