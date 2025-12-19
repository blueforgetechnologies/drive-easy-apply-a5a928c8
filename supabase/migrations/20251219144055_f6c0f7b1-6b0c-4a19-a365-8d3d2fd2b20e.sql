-- Create load_emails_archive table for emails older than 30 days
CREATE TABLE IF NOT EXISTS public.load_emails_archive (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  original_id uuid NOT NULL,
  email_id text NOT NULL,
  thread_id text,
  from_email text NOT NULL,
  from_name text,
  subject text,
  body_text text,
  body_html text,
  received_at timestamp with time zone NOT NULL,
  expires_at timestamp with time zone,
  parsed_data jsonb,
  status text NOT NULL,
  load_id text,
  email_source text NOT NULL,
  has_issues boolean DEFAULT false,
  issue_notes text,
  assigned_load_id uuid,
  marked_missed_at timestamp with time zone,
  original_created_at timestamp with time zone NOT NULL,
  original_updated_at timestamp with time zone NOT NULL,
  archived_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_load_emails_archive_received_at ON public.load_emails_archive (received_at DESC);
CREATE INDEX idx_load_emails_archive_archived_at ON public.load_emails_archive (archived_at DESC);
CREATE INDEX idx_load_emails_archive_email_source ON public.load_emails_archive (email_source);

-- Enable RLS
ALTER TABLE public.load_emails_archive ENABLE ROW LEVEL SECURITY;

-- RLS policies for archive table
CREATE POLICY "Admins can view email archive" 
ON public.load_emails_archive 
FOR SELECT 
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can view email archive" 
ON public.load_emails_archive 
FOR SELECT 
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Add regional_bounds column to hunt_plans for smart matching pre-filter
-- This stores the bounding box for quick regional checks
ALTER TABLE public.hunt_plans ADD COLUMN IF NOT EXISTS regional_bounds jsonb;

-- Create function to archive old emails (older than 30 days)
CREATE OR REPLACE FUNCTION archive_old_load_emails()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  archived_count integer := 0;
  cutoff_date timestamp with time zone;
BEGIN
  cutoff_date := now() - interval '30 days';
  
  -- Insert into archive
  WITH archived AS (
    INSERT INTO load_emails_archive (
      original_id, email_id, thread_id, from_email, from_name, subject,
      body_text, body_html, received_at, expires_at, parsed_data, status,
      load_id, email_source, has_issues, issue_notes, assigned_load_id,
      marked_missed_at, original_created_at, original_updated_at
    )
    SELECT 
      id, email_id, thread_id, from_email, from_name, subject,
      body_text, body_html, received_at, expires_at, parsed_data, status,
      load_id, email_source, has_issues, issue_notes, assigned_load_id,
      marked_missed_at, created_at, updated_at
    FROM load_emails
    WHERE received_at < cutoff_date
    RETURNING 1
  )
  SELECT count(*) INTO archived_count FROM archived;
  
  -- Delete from main table
  DELETE FROM load_emails WHERE received_at < cutoff_date;
  
  RETURN archived_count;
END;
$$;