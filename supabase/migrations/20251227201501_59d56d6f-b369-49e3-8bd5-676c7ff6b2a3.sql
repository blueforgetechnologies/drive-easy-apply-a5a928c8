-- Update the trigger to also calculate carrier_rate based on contractor_percentage
-- when vehicle requires load approval

CREATE OR REPLACE FUNCTION public.enforce_load_approval_on_vehicle_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_requires boolean;
  v_contractor_percentage numeric;
BEGIN
  IF NEW.assigned_vehicle_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT requires_load_approval, contractor_percentage
  INTO v_requires, v_contractor_percentage
  FROM public.vehicles
  WHERE id = NEW.assigned_vehicle_id;

  IF COALESCE(v_requires, false) = true THEN
    NEW.carrier_approved := false;
    NEW.approved_payload := NULL;
    
    -- Calculate carrier_rate from rate * contractor_percentage if not already manually set
    -- Only auto-calculate if carrier_rate is NULL or 0 (not yet manually overridden)
    IF (NEW.carrier_rate IS NULL OR NEW.carrier_rate = 0) AND NEW.rate IS NOT NULL AND v_contractor_percentage IS NOT NULL THEN
      NEW.carrier_rate := ROUND((NEW.rate * v_contractor_percentage / 100)::numeric, 2);
    END IF;
  ELSE
    NEW.carrier_approved := true;
  END IF;

  RETURN NEW;
END;
$$;