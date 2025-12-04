-- Create table to store monthly Mapbox usage summaries
CREATE TABLE public.mapbox_monthly_usage (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  month_year TEXT NOT NULL, -- Format: 'YYYY-MM' e.g., '2025-12'
  geocoding_api_calls INTEGER NOT NULL DEFAULT 0,
  map_loads INTEGER NOT NULL DEFAULT 0,
  geocoding_cost NUMERIC NOT NULL DEFAULT 0,
  map_loads_cost NUMERIC NOT NULL DEFAULT 0,
  total_cost NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(month_year)
);

-- Enable RLS
ALTER TABLE public.mapbox_monthly_usage ENABLE ROW LEVEL SECURITY;

-- Allow admins to view
CREATE POLICY "Admins can view mapbox usage"
ON public.mapbox_monthly_usage
FOR SELECT
USING (true);

-- Add month tracking columns to geocode_cache for monthly resets
ALTER TABLE public.geocode_cache 
ADD COLUMN IF NOT EXISTS month_created TEXT DEFAULT TO_CHAR(now(), 'YYYY-MM');

-- Add month tracking to map_load_tracking
ALTER TABLE public.map_load_tracking
ADD COLUMN IF NOT EXISTS month_year TEXT DEFAULT TO_CHAR(now(), 'YYYY-MM');

-- Create index for efficient monthly queries
CREATE INDEX idx_map_load_tracking_month ON public.map_load_tracking(month_year);
CREATE INDEX idx_geocode_cache_month ON public.geocode_cache(month_created);