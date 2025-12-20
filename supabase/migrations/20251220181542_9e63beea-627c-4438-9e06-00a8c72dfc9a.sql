-- Create load_bids table to track bids and prevent duplicates
CREATE TABLE public.load_bids (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  load_id text NOT NULL,
  load_email_id uuid REFERENCES public.load_emails(id) ON DELETE SET NULL,
  match_id uuid REFERENCES public.load_hunt_matches(id) ON DELETE SET NULL,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  dispatcher_id uuid REFERENCES public.dispatchers(id) ON DELETE SET NULL,
  carrier_id uuid REFERENCES public.carriers(id) ON DELETE SET NULL,
  bid_amount numeric NOT NULL,
  to_email text,
  status text DEFAULT 'sent',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  
  -- UNIQUE constraint on load_id to prevent duplicate bids per load
  CONSTRAINT unique_bid_per_load UNIQUE (load_id)
);

-- Enable RLS
ALTER TABLE public.load_bids ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Dispatchers can view all bids"
  ON public.load_bids FOR SELECT
  USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can insert bids"
  ON public.load_bids FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can update bids"
  ON public.load_bids FOR UPDATE
  USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete bids"
  ON public.load_bids FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Trigger to update updated_at
CREATE TRIGGER update_load_bids_updated_at
  BEFORE UPDATE ON public.load_bids
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Index for fast lookups by load_id
CREATE INDEX idx_load_bids_load_id ON public.load_bids(load_id);

-- Enable realtime for the table so dispatchers see updates immediately
ALTER PUBLICATION supabase_realtime ADD TABLE public.load_bids;