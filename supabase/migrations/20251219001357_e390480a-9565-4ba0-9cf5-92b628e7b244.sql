-- Add missing columns to loads table for complete data transfer from load hunter
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS email_source text;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS empty_miles numeric;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS cargo_length text;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS cargo_width text;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS cargo_height text;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS cargo_dimensions text;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS load_email_id uuid REFERENCES public.load_emails(id);
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS match_id uuid REFERENCES public.load_hunt_matches(id);
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS available_feet text;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS shipper_load_id text;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS bid_placed_at timestamp with time zone;
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS bid_placed_by uuid REFERENCES public.dispatchers(id);

-- Add index for better query performance
CREATE INDEX IF NOT EXISTS idx_loads_load_email_id ON public.loads(load_email_id);
CREATE INDEX IF NOT EXISTS idx_loads_match_id ON public.loads(match_id);