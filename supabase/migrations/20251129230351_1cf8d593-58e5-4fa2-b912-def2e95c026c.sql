-- Add enabled field to hunt_plans table
ALTER TABLE public.hunt_plans 
ADD COLUMN enabled BOOLEAN NOT NULL DEFAULT true;