-- Create trigger function to handle rate changes on approved loads
CREATE OR REPLACE FUNCTION public.recalculate_carrier_rate_on_rate_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contractor_percentage numeric;
  v_old_carrier_rate numeric;
  v_new_carrier_rate numeric;
BEGIN
  -- Only process if:
  -- 1. Load is approved (carrier_approved = true)
  -- 2. Rate actually changed
  -- 3. Has an assigned vehicle
  IF NEW.carrier_approved = true 
     AND OLD.rate IS DISTINCT FROM NEW.rate 
     AND NEW.assigned_vehicle_id IS NOT NULL THEN
    
    -- Get contractor percentage from vehicle
    SELECT contractor_percentage INTO v_contractor_percentage
    FROM public.vehicles
    WHERE id = NEW.assigned_vehicle_id;
    
    -- Only recalculate if vehicle has contractor percentage set
    IF v_contractor_percentage IS NOT NULL AND v_contractor_percentage > 0 THEN
      -- Store old carrier rate
      v_old_carrier_rate := OLD.carrier_rate;
      
      -- Calculate new carrier rate
      v_new_carrier_rate := ROUND((NEW.rate * v_contractor_percentage / 100)::numeric, 2);
      
      -- Update carrier_rate on the load
      NEW.carrier_rate := v_new_carrier_rate;
      
      -- Update approved_payload to match new rate (so strikethrough clears after recalc)
      -- Actually NO - keep approved_payload as the OLD rate so strikethrough shows
      -- The user needs to re-approve to clear the strikethrough
      
      -- Log to carrier_rate_history
      INSERT INTO public.carrier_rate_history (
        load_id,
        old_rate,
        new_rate,
        old_payload,
        new_payload,
        changed_by_name,
        notes
      ) VALUES (
        NEW.id,
        v_old_carrier_rate,
        v_new_carrier_rate,
        OLD.rate,
        NEW.rate,
        'System (Auto-recalc)',
        'Carrier rate auto-recalculated due to payload change from $' || COALESCE(OLD.rate::text, '0') || ' to $' || COALESCE(NEW.rate::text, '0')
      );
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$;

-- Create the trigger on loads table
DROP TRIGGER IF EXISTS trg_recalculate_carrier_rate_on_rate_change ON public.loads;
CREATE TRIGGER trg_recalculate_carrier_rate_on_rate_change
  BEFORE UPDATE ON public.loads
  FOR EACH ROW
  EXECUTE FUNCTION public.recalculate_carrier_rate_on_rate_change();