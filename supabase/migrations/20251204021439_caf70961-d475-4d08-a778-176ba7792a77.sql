-- Add directions_api_calls column to mapbox_monthly_usage
ALTER TABLE public.mapbox_monthly_usage 
ADD COLUMN IF NOT EXISTS directions_api_calls integer DEFAULT 0,
ADD COLUMN IF NOT EXISTS directions_cost numeric DEFAULT 0;

-- Create tracking table for directions API calls
CREATE TABLE IF NOT EXISTS public.directions_api_tracking (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  user_id uuid,
  load_id text,
  month_year text DEFAULT to_char(now(), 'YYYY-MM')
);

-- Enable RLS
ALTER TABLE public.directions_api_tracking ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to insert and read
CREATE POLICY "Allow all access to directions tracking" 
ON public.directions_api_tracking 
FOR ALL 
USING (true) 
WITH CHECK (true);

-- Update existing December 2025 record with baseline of 18 calls
UPDATE public.mapbox_monthly_usage 
SET directions_api_calls = 18, directions_cost = 0 
WHERE month_year = '2025-12';