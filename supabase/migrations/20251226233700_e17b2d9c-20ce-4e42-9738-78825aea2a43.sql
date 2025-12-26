-- Add truck_type column to vehicles table
ALTER TABLE public.vehicles ADD COLUMN truck_type TEXT DEFAULT 'my_truck';

-- Comment for clarity
COMMENT ON COLUMN public.vehicles.truck_type IS 'Ownership type: my_truck (company-owned) or contractor_truck (third-party)';