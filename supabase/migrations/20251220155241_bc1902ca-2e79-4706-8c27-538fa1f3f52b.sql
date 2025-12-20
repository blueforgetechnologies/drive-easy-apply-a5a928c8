-- Add customer_type column to customers table
ALTER TABLE public.customers 
ADD COLUMN customer_type text DEFAULT 'broker';

-- Add a comment explaining the valid values
COMMENT ON COLUMN public.customers.customer_type IS 'Type of customer: broker, shipper, receiver, or shipper_receiver';

-- Update any existing customers to default to broker (since most are from load boards)
UPDATE public.customers SET customer_type = 'broker' WHERE customer_type IS NULL;