-- Update the trigger function to also set approved_payload when rate changes
-- This ensures strikethrough logic works correctly
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
    
    -- If approved_payload is NULL, set it to the OLD rate so strikethrough works
    IF NEW.approved_payload IS NULL THEN
      NEW.approved_payload := OLD.rate;
    END IF;
    
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

-- Backfill approved_payload for existing approved loads where it's NULL
-- This sets it to current rate so next edit will trigger strikethrough
UPDATE public.loads 
SET approved_payload = rate 
WHERE carrier_approved = true 
  AND approved_payload IS NULL 
  AND rate IS NOT NULL;