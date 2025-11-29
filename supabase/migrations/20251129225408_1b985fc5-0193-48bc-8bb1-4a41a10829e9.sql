-- Create hunt_plans table for storing vehicle load hunt plans
CREATE TABLE public.hunt_plans (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  vehicle_id UUID NOT NULL,
  plan_name TEXT NOT NULL,
  vehicle_size TEXT,
  zip_code TEXT,
  available_feet TEXT,
  partial BOOLEAN DEFAULT false,
  pickup_radius TEXT,
  mile_limit TEXT,
  load_capacity TEXT,
  available_date DATE,
  available_time TIME,
  destination_zip TEXT,
  destination_radius TEXT,
  notes TEXT,
  hunt_coordinates JSONB,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  last_modified TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable Row Level Security
ALTER TABLE public.hunt_plans ENABLE ROW LEVEL SECURITY;

-- Create policies for hunt plans
CREATE POLICY "Admins can view all hunt plans"
  ON public.hunt_plans
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert hunt plans"
  ON public.hunt_plans
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update hunt plans"
  ON public.hunt_plans
  FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete hunt plans"
  ON public.hunt_plans
  FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger to update last_modified timestamp
CREATE TRIGGER update_hunt_plans_last_modified
  BEFORE UPDATE ON public.hunt_plans
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups by vehicle
CREATE INDEX idx_hunt_plans_vehicle_id ON public.hunt_plans(vehicle_id);

-- Enable realtime
ALTER TABLE public.hunt_plans REPLICA IDENTITY FULL;
ALTER PUBLICATION supabase_realtime ADD TABLE public.hunt_plans;