-- Fix pubsub_tracking cleanup to use created_at instead of received_at
CREATE OR REPLACE FUNCTION public.cleanup_pubsub_tracking()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  deleted_count integer := 0;
  cutoff_date timestamp with time zone;
BEGIN
  cutoff_date := now() - interval '7 days';
  
  WITH deleted AS (
    DELETE FROM pubsub_tracking
    WHERE created_at < cutoff_date
    RETURNING 1
  )
  SELECT count(*) INTO deleted_count FROM deleted;
  
  RETURN deleted_count;
END;
$$;

-- Create batched archive function to avoid timeout
CREATE OR REPLACE FUNCTION public.archive_old_load_emails_batched(batch_size integer DEFAULT 5000)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  archived_count integer := 0;
  cutoff_date timestamp with time zone;
BEGIN
  cutoff_date := now() - interval '8 days';
  
  -- Insert batch into archive
  WITH batch AS (
    SELECT id, email_id, thread_id, from_email, from_name, subject,
           body_text, body_html, received_at, expires_at, parsed_data, status,
           load_id, email_source, has_issues, issue_notes, assigned_load_id,
           marked_missed_at, created_at, updated_at
    FROM load_emails
    WHERE received_at < cutoff_date
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  ),
  archived AS (
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
    FROM batch
    RETURNING 1
  )
  SELECT count(*) INTO archived_count FROM archived;
  
  -- Delete archived records from main table
  DELETE FROM load_emails 
  WHERE id IN (
    SELECT le.id FROM load_emails le
    WHERE le.received_at < cutoff_date
    LIMIT batch_size
  );
  
  RETURN archived_count;
END;
$$;