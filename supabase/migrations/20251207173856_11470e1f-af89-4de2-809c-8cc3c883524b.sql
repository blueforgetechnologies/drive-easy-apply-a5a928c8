-- Create archive table for permanent load match history
CREATE TABLE public.load_hunt_matches_archive (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_match_id uuid NOT NULL,
  load_email_id uuid NOT NULL,
  hunt_plan_id uuid NOT NULL,
  vehicle_id uuid NOT NULL,
  distance_miles numeric,
  match_score numeric,
  is_active boolean NOT NULL,
  match_status text NOT NULL,
  matched_at timestamp with time zone NOT NULL,
  original_created_at timestamp with time zone NOT NULL,
  original_updated_at timestamp with time zone NOT NULL,
  archived_at timestamp with time zone NOT NULL DEFAULT now(),
  archive_reason text NOT NULL DEFAULT 'deleted'
);

-- Create index for common queries
CREATE INDEX idx_archive_vehicle_id ON public.load_hunt_matches_archive(vehicle_id);
CREATE INDEX idx_archive_hunt_plan_id ON public.load_hunt_matches_archive(hunt_plan_id);
CREATE INDEX idx_archive_archived_at ON public.load_hunt_matches_archive(archived_at);
CREATE INDEX idx_archive_match_status ON public.load_hunt_matches_archive(match_status);

-- Enable RLS
ALTER TABLE public.load_hunt_matches_archive ENABLE ROW LEVEL SECURITY;

-- RLS policies (read-only for dispatchers and admins)
CREATE POLICY "Admins can view match archive"
ON public.load_hunt_matches_archive
FOR SELECT
USING (has_role(auth.uid(), 'admin'));

CREATE POLICY "Dispatchers can view match archive"
ON public.load_hunt_matches_archive
FOR SELECT
USING (has_role(auth.uid(), 'dispatcher') OR has_role(auth.uid(), 'admin'));

-- Create trigger function to archive before delete
CREATE OR REPLACE FUNCTION public.archive_match_before_delete()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  INSERT INTO public.load_hunt_matches_archive (
    original_match_id,
    load_email_id,
    hunt_plan_id,
    vehicle_id,
    distance_miles,
    match_score,
    is_active,
    match_status,
    matched_at,
    original_created_at,
    original_updated_at,
    archived_at,
    archive_reason
  ) VALUES (
    OLD.id,
    OLD.load_email_id,
    OLD.hunt_plan_id,
    OLD.vehicle_id,
    OLD.distance_miles,
    OLD.match_score,
    OLD.is_active,
    OLD.match_status,
    OLD.matched_at,
    OLD.created_at,
    OLD.updated_at,
    now(),
    'deleted'
  );
  RETURN OLD;
END;
$$;

-- Attach trigger to load_hunt_matches table
CREATE TRIGGER archive_match_on_delete
BEFORE DELETE ON public.load_hunt_matches
FOR EACH ROW
EXECUTE FUNCTION public.archive_match_before_delete();