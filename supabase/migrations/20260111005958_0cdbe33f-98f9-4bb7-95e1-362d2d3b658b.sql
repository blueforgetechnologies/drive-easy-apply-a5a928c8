-- Drop existing foreign key and re-create with CASCADE
ALTER TABLE public.missed_loads_history 
DROP CONSTRAINT IF EXISTS missed_loads_history_vehicle_id_fkey;

ALTER TABLE public.missed_loads_history 
ADD CONSTRAINT missed_loads_history_vehicle_id_fkey 
FOREIGN KEY (vehicle_id) REFERENCES public.vehicles(id) ON DELETE CASCADE;