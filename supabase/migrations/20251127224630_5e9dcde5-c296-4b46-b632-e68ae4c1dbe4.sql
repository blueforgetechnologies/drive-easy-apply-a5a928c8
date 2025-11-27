-- Add camera image URL field to vehicles table
ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS camera_image_url TEXT;