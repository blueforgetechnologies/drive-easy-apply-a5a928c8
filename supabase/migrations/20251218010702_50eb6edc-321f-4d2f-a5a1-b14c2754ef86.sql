-- Add 'dispatcher' to the app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'dispatcher';

-- Add 'driver' for future driver portal
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'driver';