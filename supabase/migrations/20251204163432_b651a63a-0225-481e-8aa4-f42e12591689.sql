-- Add last_synced_at column to track when baseline was synced from Mapbox dashboard
ALTER TABLE public.mapbox_monthly_usage 
ADD COLUMN IF NOT EXISTS last_synced_at timestamp with time zone DEFAULT now();

-- Update existing record with current timestamp
UPDATE public.mapbox_monthly_usage 
SET last_synced_at = now() 
WHERE last_synced_at IS NULL;