-- Add carrier_id to driver_invites table to track which carrier the application is for
ALTER TABLE driver_invites 
ADD COLUMN carrier_id UUID REFERENCES carriers(id) ON DELETE SET NULL;

-- Add index for lookups
CREATE INDEX idx_driver_invites_carrier_id ON driver_invites(carrier_id);