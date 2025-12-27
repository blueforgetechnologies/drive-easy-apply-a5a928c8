-- Add column for external/temporary truck reference when using carriers without linked vehicles
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS external_truck_reference TEXT;