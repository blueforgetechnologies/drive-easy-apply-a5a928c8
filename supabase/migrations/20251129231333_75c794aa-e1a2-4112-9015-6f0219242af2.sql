-- Add updated_at column to hunt_plans table
ALTER TABLE hunt_plans 
ADD COLUMN IF NOT EXISTS updated_at TIMESTAMP WITH TIME ZONE DEFAULT now();

-- Create trigger to automatically update updated_at column
CREATE OR REPLACE FUNCTION update_hunt_plans_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trigger_update_hunt_plans_updated_at ON hunt_plans;

CREATE TRIGGER trigger_update_hunt_plans_updated_at
  BEFORE UPDATE ON hunt_plans
  FOR EACH ROW
  EXECUTE FUNCTION update_hunt_plans_updated_at();