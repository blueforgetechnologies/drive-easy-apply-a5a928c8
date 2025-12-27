-- Fix: do NOT reset carrier approval when the payload (rate) is edited.
-- The approval-reset trigger should only fire when a vehicle is assigned/changed.

DROP TRIGGER IF EXISTS trg_enforce_load_approval ON public.loads;

CREATE TRIGGER trg_enforce_load_approval
  BEFORE INSERT OR UPDATE OF assigned_vehicle_id
  ON public.loads
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_load_approval_on_vehicle_assignment();
