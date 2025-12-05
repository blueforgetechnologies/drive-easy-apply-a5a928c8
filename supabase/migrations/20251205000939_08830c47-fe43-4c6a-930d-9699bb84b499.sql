-- Add matches_count column to email_volume_stats table
ALTER TABLE public.email_volume_stats 
ADD COLUMN IF NOT EXISTS matches_count integer DEFAULT 0;