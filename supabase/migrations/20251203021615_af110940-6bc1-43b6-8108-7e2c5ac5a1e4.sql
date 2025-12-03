-- Add match-specific columns to missed_loads_history for tracking which truck+load match was missed
ALTER TABLE missed_loads_history 
ADD COLUMN IF NOT EXISTS hunt_plan_id uuid REFERENCES hunt_plans(id),
ADD COLUMN IF NOT EXISTS vehicle_id uuid REFERENCES vehicles(id),
ADD COLUMN IF NOT EXISTS match_id uuid;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_missed_loads_match_id ON missed_loads_history(match_id);
CREATE INDEX IF NOT EXISTS idx_missed_loads_vehicle_id ON missed_loads_history(vehicle_id);