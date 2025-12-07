-- First migration: Add columns and enum value only
-- Add user_id to link dispatchers to auth users
ALTER TABLE public.dispatchers 
ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL,
ADD COLUMN IF NOT EXISTS must_change_password boolean DEFAULT false;

-- Create dispatcher role type if not exists
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dispatcher';