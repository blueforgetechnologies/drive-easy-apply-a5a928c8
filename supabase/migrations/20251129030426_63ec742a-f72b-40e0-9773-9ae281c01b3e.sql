-- Add foreign key constraint between loads and carriers
ALTER TABLE loads
ADD CONSTRAINT loads_carrier_id_fkey 
FOREIGN KEY (carrier_id) 
REFERENCES carriers(id) 
ON DELETE SET NULL;