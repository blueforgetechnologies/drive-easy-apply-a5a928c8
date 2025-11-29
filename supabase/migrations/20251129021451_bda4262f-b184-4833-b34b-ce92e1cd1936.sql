-- Add foreign key relationships for load assignments
ALTER TABLE loads
ADD CONSTRAINT loads_assigned_vehicle_id_fkey 
FOREIGN KEY (assigned_vehicle_id) 
REFERENCES vehicles(id) 
ON DELETE SET NULL;

ALTER TABLE loads
ADD CONSTRAINT loads_assigned_driver_id_fkey 
FOREIGN KEY (assigned_driver_id) 
REFERENCES applications(id) 
ON DELETE SET NULL;