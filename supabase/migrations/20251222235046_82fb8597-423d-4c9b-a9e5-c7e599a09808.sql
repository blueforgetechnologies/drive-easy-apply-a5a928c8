-- Add requires_load_approval column to vehicles table
ALTER TABLE public.vehicles 
ADD COLUMN requires_load_approval boolean DEFAULT false;

-- Add carrier_approved column to loads table to track approval status
ALTER TABLE public.loads 
ADD COLUMN carrier_approved boolean DEFAULT true;

-- Add carrier_rate column for the adjusted rate the carrier sees
ALTER TABLE public.loads 
ADD COLUMN carrier_rate numeric(10,2) DEFAULT null;

COMMENT ON COLUMN public.vehicles.requires_load_approval IS 'When enabled, loads assigned to this vehicle require approval before showing in Carrier Dashboard';
COMMENT ON COLUMN public.loads.carrier_approved IS 'Whether this load has been approved to show in Carrier Dashboard';
COMMENT ON COLUMN public.loads.carrier_rate IS 'The rate visible to the carrier (may differ from internal rate)';