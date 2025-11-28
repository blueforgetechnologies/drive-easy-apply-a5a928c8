-- Add formatted_address column to vehicles table to store Samsara reverse geocoded addresses
ALTER TABLE public.vehicles 
ADD COLUMN IF NOT EXISTS formatted_address TEXT;