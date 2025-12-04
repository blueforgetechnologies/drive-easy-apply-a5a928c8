-- Create table to track map loads
CREATE TABLE public.map_load_tracking (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  component_name TEXT NOT NULL,
  user_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.map_load_tracking ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to insert
CREATE POLICY "Authenticated users can insert map loads"
ON public.map_load_tracking
FOR INSERT
WITH CHECK (auth.uid() IS NOT NULL);

-- Allow admins to view all
CREATE POLICY "Admins can view all map loads"
ON public.map_load_tracking
FOR SELECT
USING (true);

-- Create index for efficient counting
CREATE INDEX idx_map_load_tracking_created_at ON public.map_load_tracking(created_at);