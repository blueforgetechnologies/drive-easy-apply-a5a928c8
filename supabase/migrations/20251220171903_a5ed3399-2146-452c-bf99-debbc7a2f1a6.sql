-- Add vehicle_size column to loads table for storing extracted vehicle size info
ALTER TABLE public.loads ADD COLUMN vehicle_size text;