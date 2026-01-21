-- Add first_name, last_name, and phone columns to invites table
ALTER TABLE public.invites 
ADD COLUMN IF NOT EXISTS first_name text,
ADD COLUMN IF NOT EXISTS last_name text,
ADD COLUMN IF NOT EXISTS phone text;