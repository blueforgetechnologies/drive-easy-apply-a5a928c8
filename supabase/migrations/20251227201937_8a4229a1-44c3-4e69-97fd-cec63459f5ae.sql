-- Update trigger to also fire on rate changes
DROP TRIGGER IF EXISTS trg_enforce_load_approval ON public.loads;

CREATE TRIGGER trg_enforce_load_approval
BEFORE INSERT OR UPDATE OF assigned_vehicle_id, rate ON public.loads
FOR EACH ROW
EXECUTE FUNCTION public.enforce_load_approval_on_vehicle_assignment();

-- Backfill existing loads that need carrier_rate calculated
-- Only update loads where:
-- 1. carrier_approved is false (requires approval)
-- 2. carrier_rate is NULL or 0
-- 3. rate is not null
-- 4. vehicle has contractor_percentage set
UPDATE public.loads l
SET carrier_rate = ROUND((l.rate * v.contractor_percentage / 100)::numeric, 2)
FROM public.vehicles v
WHERE l.assigned_vehicle_id = v.id
  AND l.carrier_approved = false
  AND (l.carrier_rate IS NULL OR l.carrier_rate = 0)
  AND l.rate IS NOT NULL
  AND v.contractor_percentage IS NOT NULL
  AND v.requires_load_approval = true;