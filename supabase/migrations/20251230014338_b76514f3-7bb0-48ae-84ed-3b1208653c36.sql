-- Create storage bucket for raw email payloads
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'email-payloads',
  'email-payloads',
  false,
  5242880, -- 5MB limit
  ARRAY['application/json']
)
ON CONFLICT (id) DO NOTHING;

-- Add payload_url column to email_queue for referencing stored payloads
ALTER TABLE public.email_queue
ADD COLUMN IF NOT EXISTS payload_url text;

-- Add column to load_emails for audit trail
ALTER TABLE public.load_emails
ADD COLUMN IF NOT EXISTS raw_payload_url text;

-- Add to archive table as well
ALTER TABLE public.load_emails_archive
ADD COLUMN IF NOT EXISTS raw_payload_url text;

-- Storage policy: Only service role can access (edge functions use service role)
CREATE POLICY "Service role full access to email payloads"
ON storage.objects
FOR ALL
USING (bucket_id = 'email-payloads')
WITH CHECK (bucket_id = 'email-payloads');