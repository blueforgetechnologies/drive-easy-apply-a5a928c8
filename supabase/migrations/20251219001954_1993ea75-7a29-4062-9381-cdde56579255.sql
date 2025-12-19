-- Add foreign key constraint from loads to customers
ALTER TABLE public.loads 
ADD CONSTRAINT loads_customer_id_fkey 
FOREIGN KEY (customer_id) 
REFERENCES public.customers(id) 
ON DELETE SET NULL;