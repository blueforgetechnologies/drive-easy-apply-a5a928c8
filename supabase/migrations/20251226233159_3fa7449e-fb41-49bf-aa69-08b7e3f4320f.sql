-- Add truck_type_at_booking column to track ownership type when load was booked
ALTER TABLE public.loads ADD COLUMN truck_type_at_booking TEXT NULL;

-- Comment for clarity
COMMENT ON COLUMN public.loads.truck_type_at_booking IS 'Snapshots vehicle truck_type (my_truck or contractor_truck) when load was created/booked';