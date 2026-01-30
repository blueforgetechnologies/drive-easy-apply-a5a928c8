-- Add missing coordinate columns to load_emails for stub processor
ALTER TABLE public.load_emails
ADD COLUMN IF NOT EXISTS pickup_coordinates JSONB,
ADD COLUMN IF NOT EXISTS dropoff_coordinates JSONB;

-- Notify PostgREST to refresh schema cache
NOTIFY pgrst, 'reload schema';