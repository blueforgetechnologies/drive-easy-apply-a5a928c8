-- Add foreign key constraint from loads to dispatchers
ALTER TABLE public.loads 
ADD CONSTRAINT loads_assigned_dispatcher_id_fkey 
FOREIGN KEY (assigned_dispatcher_id) 
REFERENCES public.dispatchers(id) 
ON DELETE SET NULL;