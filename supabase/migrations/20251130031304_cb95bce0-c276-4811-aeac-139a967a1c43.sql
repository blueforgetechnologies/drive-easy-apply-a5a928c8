-- Create table to persist matches between load emails and hunt plans
CREATE TABLE IF NOT EXISTS public.load_hunt_matches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  load_email_id uuid NOT NULL REFERENCES public.load_emails(id) ON DELETE CASCADE,
  hunt_plan_id uuid NOT NULL REFERENCES public.hunt_plans(id) ON DELETE CASCADE,
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  distance_miles numeric,
  match_score numeric,
  is_active boolean NOT NULL DEFAULT true,
  matched_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (load_email_id, hunt_plan_id)
);

-- Trigger function to keep updated_at in sync
CREATE OR REPLACE FUNCTION public.update_load_hunt_matches_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_update_load_hunt_matches_updated_at
BEFORE UPDATE ON public.load_hunt_matches
FOR EACH ROW
EXECUTE FUNCTION public.update_load_hunt_matches_updated_at();

-- Enable RLS
ALTER TABLE public.load_hunt_matches ENABLE ROW LEVEL SECURITY;

-- Only admins can manage and view load_hunt_matches
CREATE POLICY "Admins can manage load_hunt_matches" 
ON public.load_hunt_matches
AS PERMISSIVE
FOR ALL
TO authenticated
USING (has_role(auth.uid(), 'admin'))
WITH CHECK (has_role(auth.uid(), 'admin'));
