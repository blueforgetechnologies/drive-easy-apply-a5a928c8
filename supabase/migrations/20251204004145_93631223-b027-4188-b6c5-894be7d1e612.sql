-- Create geocode cache daily stats table
CREATE TABLE public.geocode_cache_daily_stats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recorded_at DATE NOT NULL DEFAULT CURRENT_DATE UNIQUE,
  total_locations INTEGER NOT NULL DEFAULT 0,
  total_hits INTEGER NOT NULL DEFAULT 0,
  new_locations_today INTEGER NOT NULL DEFAULT 0,
  hits_today INTEGER NOT NULL DEFAULT 0,
  estimated_savings NUMERIC(10, 2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.geocode_cache_daily_stats ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read stats
CREATE POLICY "Allow read access to geocode stats"
ON public.geocode_cache_daily_stats
FOR SELECT
USING (true);

-- Index for date lookups
CREATE INDEX idx_geocode_stats_recorded_at ON public.geocode_cache_daily_stats(recorded_at DESC);