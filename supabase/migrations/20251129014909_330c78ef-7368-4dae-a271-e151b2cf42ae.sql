-- Add fuel type and efficiency fields to vehicles table
ALTER TABLE vehicles 
ADD COLUMN IF NOT EXISTS fuel_type text DEFAULT 'diesel',
ADD COLUMN IF NOT EXISTS fuel_efficiency_mpg numeric DEFAULT 6.5,
ADD COLUMN IF NOT EXISTS fuel_tank_capacity numeric;

-- Add comment for fuel_type options
COMMENT ON COLUMN vehicles.fuel_type IS 'Fuel type: diesel, gasoline, electric, hybrid, cng, lng';
COMMENT ON COLUMN vehicles.fuel_efficiency_mpg IS 'Average fuel efficiency in miles per gallon';
COMMENT ON COLUMN vehicles.fuel_tank_capacity IS 'Fuel tank capacity in gallons';
