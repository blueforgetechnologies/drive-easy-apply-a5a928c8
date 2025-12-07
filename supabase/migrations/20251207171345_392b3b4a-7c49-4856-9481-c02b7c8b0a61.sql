-- Add logo_url column to carriers table
ALTER TABLE public.carriers ADD COLUMN IF NOT EXISTS logo_url text;