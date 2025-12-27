-- Enforce load approval rules consistently whenever a load is assigned to a vehicle
-- If the vehicle requires load approval, carrier_approved is forced to false and approved_payload cleared
-- If not, carrier_approved is forced to true

CREATE OR REPLACE FUNCTION public.enforce_load_approval_on_vehicle_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requires boolean;
BEGIN
  IF NEW.assigned_vehicle_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT requires_load_approval
  INTO v_requires
  FROM public.vehicles
  WHERE id = NEW.assigned_vehicle_id;

  IF COALESCE(v_requires, false) = true THEN
    NEW.carrier_approved := false;
    NEW.approved_payload := NULL;
  ELSE
    NEW.carrier_approved := true;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_load_approval ON public.loads;

CREATE TRIGGER trg_enforce_load_approval
BEFORE INSERT OR UPDATE OF assigned_vehicle_id ON public.loads
FOR EACH ROW
EXECUTE FUNCTION public.enforce_load_approval_on_vehicle_assignment();