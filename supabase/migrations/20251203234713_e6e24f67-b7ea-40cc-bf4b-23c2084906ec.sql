-- Remove insecure plain text password field
-- Drivers will authenticate through Supabase Auth instead

ALTER TABLE public.applications DROP COLUMN IF EXISTS driver_password;