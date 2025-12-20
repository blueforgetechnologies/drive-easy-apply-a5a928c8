-- Remove the unique constraint to allow multiple bids per load
ALTER TABLE public.load_bids DROP CONSTRAINT IF EXISTS unique_bid_per_load;

-- Add index for efficient lookup of first bid per load
CREATE INDEX IF NOT EXISTS idx_load_bids_load_id_created ON public.load_bids(load_id, created_at);