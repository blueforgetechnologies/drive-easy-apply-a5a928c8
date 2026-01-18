-- Add secondary_dispatcher_ids column to vehicles table for storing multiple secondary dispatchers
ALTER TABLE public.vehicles 
ADD COLUMN IF NOT EXISTS secondary_dispatcher_ids UUID[] DEFAULT '{}'::UUID[];