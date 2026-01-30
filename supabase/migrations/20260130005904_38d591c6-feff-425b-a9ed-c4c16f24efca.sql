-- Add unique constraint on (tenant_id, gmail_message_id)
CREATE UNIQUE INDEX IF NOT EXISTS email_queue_tenant_gmail_unique 
ON email_queue (tenant_id, gmail_message_id) 
NULLS NOT DISTINCT;

-- Create function to normalize payload_url on insert/update  
CREATE OR REPLACE FUNCTION normalize_payload_url()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.payload_url IS NOT NULL AND NEW.payload_url LIKE 'http%/storage/v1/object/public/email-content/%' THEN
    NEW.payload_url := REGEXP_REPLACE(
      NEW.payload_url, 
      '^https?://[^/]+/storage/v1/object/public/email-content/', 
      ''
    );
  END IF;
  RETURN NEW;
END;
$$;

-- Attach trigger to email_queue
DROP TRIGGER IF EXISTS normalize_payload_url_trigger ON email_queue;
CREATE TRIGGER normalize_payload_url_trigger
BEFORE INSERT OR UPDATE ON email_queue
FOR EACH ROW
EXECUTE FUNCTION normalize_payload_url();