-- Drop the incorrect global unique constraint on VIN
ALTER TABLE public.vehicles DROP CONSTRAINT IF EXISTS vehicles_vin_key;

-- Create tenant-scoped unique constraint: VIN must be unique only within each tenant
CREATE UNIQUE INDEX IF NOT EXISTS vehicles_tenant_vin_unique 
ON public.vehicles (tenant_id, vin) 
WHERE vin IS NOT NULL AND vin != '';