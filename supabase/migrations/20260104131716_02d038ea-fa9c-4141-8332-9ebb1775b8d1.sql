-- Add columns for outbound email sending to email_queue
ALTER TABLE public.email_queue 
ADD COLUMN IF NOT EXISTS to_email TEXT,
ADD COLUMN IF NOT EXISTS subject TEXT,
ADD COLUMN IF NOT EXISTS body_html TEXT,
ADD COLUMN IF NOT EXISTS body_text TEXT,
ADD COLUMN IF NOT EXISTS from_email TEXT,
ADD COLUMN IF NOT EXISTS from_name TEXT;

-- Add 'sent' status for completed outbound emails
COMMENT ON TABLE public.email_queue IS 'Email queue for both inbound Gmail processing and outbound Resend sending';

-- Update complete_email_queue_item to set status to 'sent' for outbound emails
CREATE OR REPLACE FUNCTION public.complete_email_queue_item(p_id uuid, p_status text DEFAULT 'completed')
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  UPDATE email_queue
  SET 
    status = p_status,
    processed_at = now(),
    processing_started_at = NULL
  WHERE id = p_id;
END;
$function$;