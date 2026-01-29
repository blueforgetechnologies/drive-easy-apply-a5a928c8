-- Add storage columns to email_queue for reliable payload access
-- storage_bucket: the bucket name (e.g., 'email-content')
-- storage_path: the object path within the bucket (e.g., 'gmail/ab/ab123456.json')
-- These replace the problematic payload_url which stored signed/public URLs

ALTER TABLE public.email_queue 
ADD COLUMN IF NOT EXISTS storage_bucket TEXT NULL;

ALTER TABLE public.email_queue 
ADD COLUMN IF NOT EXISTS storage_path TEXT NULL;

COMMENT ON COLUMN public.email_queue.storage_bucket IS 
  'Supabase Storage bucket name containing the email payload (e.g., email-content)';

COMMENT ON COLUMN public.email_queue.storage_path IS 
  'Object path within the storage bucket (e.g., gmail/ab/ab123456.json). Use with storage.from(bucket).download(path)';