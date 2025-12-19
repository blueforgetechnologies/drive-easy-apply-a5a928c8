-- Add load_owner_id column to loads table
ALTER TABLE public.loads
ADD COLUMN load_owner_id uuid REFERENCES public.dispatchers(id);