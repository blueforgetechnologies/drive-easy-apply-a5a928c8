-- Create table to track each geocoding API call (not just cached locations)
CREATE TABLE public.geocoding_api_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  month_year TEXT DEFAULT to_char(now(), 'YYYY-MM'),
  user_id UUID,
  location_query TEXT,
  was_cache_hit BOOLEAN DEFAULT false
);

-- Enable RLS
ALTER TABLE public.geocoding_api_tracking ENABLE ROW LEVEL SECURITY;

-- Policies
CREATE POLICY "Admins can view geocoding tracking"
  ON public.geocoding_api_tracking FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can view geocoding tracking"
  ON public.geocoding_api_tracking FOR SELECT
  USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Authenticated users can insert geocoding tracking"
  ON public.geocoding_api_tracking FOR INSERT
  WITH CHECK (true);

-- Add baseline columns to billing history for tracking new calls since last official snapshot
ALTER TABLE public.mapbox_billing_history 
  ADD COLUMN IF NOT EXISTS baseline_set_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  ADD COLUMN IF NOT EXISTS is_baseline BOOLEAN DEFAULT true;

-- Index for efficient monthly queries
CREATE INDEX idx_geocoding_api_tracking_month ON public.geocoding_api_tracking(month_year);
CREATE INDEX idx_geocoding_api_tracking_created ON public.geocoding_api_tracking(created_at);