-- Create geocode cache table to reduce Mapbox API calls
CREATE TABLE public.geocode_cache (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  location_key TEXT NOT NULL UNIQUE,
  city TEXT,
  state TEXT,
  latitude NUMERIC(10, 6) NOT NULL,
  longitude NUMERIC(10, 6) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  hit_count INTEGER DEFAULT 1
);

-- Index for fast lookups
CREATE INDEX idx_geocode_cache_location_key ON public.geocode_cache(location_key);

-- Enable RLS
ALTER TABLE public.geocode_cache ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read/write (needed for edge functions)
CREATE POLICY "Allow all access to geocode cache"
ON public.geocode_cache
FOR ALL
USING (true)
WITH CHECK (true);