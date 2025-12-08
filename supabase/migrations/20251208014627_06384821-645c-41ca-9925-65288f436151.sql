-- Create vehicle location history table for tracking
CREATE TABLE public.vehicle_location_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  latitude numeric NOT NULL,
  longitude numeric NOT NULL,
  speed numeric,
  heading numeric,
  odometer numeric,
  recorded_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create indexes for efficient querying
CREATE INDEX idx_vehicle_location_history_vehicle_date ON public.vehicle_location_history (vehicle_id, recorded_at DESC);
CREATE INDEX idx_vehicle_location_history_recorded_at ON public.vehicle_location_history (recorded_at DESC);

-- Enable RLS
ALTER TABLE public.vehicle_location_history ENABLE ROW LEVEL SECURITY;

-- RLS policies for admins and dispatchers
CREATE POLICY "Admins can view vehicle location history"
  ON public.vehicle_location_history FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can view vehicle location history"
  ON public.vehicle_location_history FOR SELECT
  USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role can insert location history"
  ON public.vehicle_location_history FOR INSERT
  WITH CHECK (true);

-- Enable realtime for live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.vehicle_location_history;