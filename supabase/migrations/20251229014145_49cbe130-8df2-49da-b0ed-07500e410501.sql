-- Ensure carrier pay (loads.carrier_rate) stays in sync with vehicle Ownership & Costs

-- 1) Update vehicle-assignment enforcement to also sync carrier_rate for contractor trucks when approval is OFF
CREATE OR REPLACE FUNCTION public.enforce_load_approval_on_vehicle_assignment()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_requires boolean;
  v_contractor_percentage numeric;
  v_truck_type text;
BEGIN
  -- On UPDATE, if the assigned vehicle didn't actually change, do nothing.
  IF TG_OP = 'UPDATE' AND NEW.assigned_vehicle_id IS NOT DISTINCT FROM OLD.assigned_vehicle_id THEN
    RETURN NEW;
  END IF;

  IF NEW.assigned_vehicle_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT requires_load_approval, contractor_percentage, truck_type
  INTO v_requires, v_contractor_percentage, v_truck_type
  FROM public.vehicles
  WHERE id = NEW.assigned_vehicle_id;

  IF COALESCE(v_requires, false) = true THEN
    -- Approval workflow ON
    NEW.carrier_approved := false;
    NEW.approved_payload := NULL;

    -- Pre-fill carrier_rate from contractor % only if not manually set yet
    IF (NEW.carrier_rate IS NULL OR NEW.carrier_rate = 0)
      AND NEW.rate IS NOT NULL
      AND v_truck_type = 'contractor_truck'
      AND v_contractor_percentage IS NOT NULL
      AND v_contractor_percentage > 0 THEN
      NEW.carrier_rate := ROUND((NEW.rate * v_contractor_percentage / 100)::numeric, 2);
    END IF;
  ELSE
    -- Approval workflow OFF: auto-approve
    NEW.carrier_approved := true;

    -- Keep carrier_rate synced to contractor % for contractor trucks
    IF NEW.rate IS NOT NULL
      AND v_truck_type = 'contractor_truck'
      AND v_contractor_percentage IS NOT NULL
      AND v_contractor_percentage > 0 THEN
      NEW.carrier_rate := ROUND((NEW.rate * v_contractor_percentage / 100)::numeric, 2);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 2) Update payload-change recalculation:
--    - For approval workflow ON: preserve existing behavior (track approved_payload + log history)
--    - For approval workflow OFF: just keep carrier_rate synced (no approved_payload/history)
CREATE OR REPLACE FUNCTION public.recalculate_carrier_rate_on_rate_change()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_contractor_percentage numeric;
  v_old_carrier_rate numeric;
  v_new_carrier_rate numeric;
  v_requires boolean;
  v_truck_type text;
BEGIN
  -- Only process if rate actually changed and has an assigned vehicle
  IF OLD.rate IS DISTINCT FROM NEW.rate AND NEW.assigned_vehicle_id IS NOT NULL THEN

    SELECT requires_load_approval, contractor_percentage, truck_type
    INTO v_requires, v_contractor_percentage, v_truck_type
    FROM public.vehicles
    WHERE id = NEW.assigned_vehicle_id;

    -- Only apply to contractor trucks with a valid percentage
    IF v_truck_type = 'contractor_truck'
      AND v_contractor_percentage IS NOT NULL
      AND v_contractor_percentage > 0
      AND NEW.rate IS NOT NULL THEN

      v_old_carrier_rate := OLD.carrier_rate;
      v_new_carrier_rate := ROUND((NEW.rate * v_contractor_percentage / 100)::numeric, 2);

      IF COALESCE(v_requires, false) = true THEN
        -- Approval workflow ON: only recalc once approved
        IF NEW.carrier_approved = true THEN
          -- If approved_payload is NULL, set it to the OLD rate so strikethrough works
          IF NEW.approved_payload IS NULL THEN
            NEW.approved_payload := OLD.rate;
          END IF;

          NEW.carrier_rate := v_new_carrier_rate;

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
      ELSE
        -- Approval workflow OFF: always keep carrier_rate in sync, no approved_payload/history
        NEW.carrier_rate := v_new_carrier_rate;
      END IF;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

-- 3) Install triggers on public.loads
DROP TRIGGER IF EXISTS trg_loads_enforce_vehicle_assignment ON public.loads;
CREATE TRIGGER trg_loads_enforce_vehicle_assignment
BEFORE INSERT OR UPDATE OF assigned_vehicle_id ON public.loads
FOR EACH ROW
EXECUTE FUNCTION public.enforce_load_approval_on_vehicle_assignment();

DROP TRIGGER IF EXISTS trg_loads_recalculate_carrier_rate_on_rate_change ON public.loads;
CREATE TRIGGER trg_loads_recalculate_carrier_rate_on_rate_change
BEFORE UPDATE OF rate ON public.loads
FOR EACH ROW
EXECUTE FUNCTION public.recalculate_carrier_rate_on_rate_change();

-- 4) Backfill existing loads (only where approval is OFF and carrier_rate is missing)
UPDATE public.loads l
SET carrier_rate = ROUND((l.rate * v.contractor_percentage / 100)::numeric, 2),
    carrier_approved = true
FROM public.vehicles v
WHERE l.assigned_vehicle_id = v.id
  AND v.truck_type = 'contractor_truck'
  AND COALESCE(v.requires_load_approval, false) = false
  AND l.rate IS NOT NULL
  AND (l.carrier_rate IS NULL OR l.carrier_rate = 0);
