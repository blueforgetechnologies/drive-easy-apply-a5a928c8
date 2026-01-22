-- Add formatted_location column to store Samsara's reverse-geocoded location
ALTER TABLE public.vehicle_location_history 
ADD COLUMN IF NOT EXISTS formatted_location text;