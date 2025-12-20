-- Update archive function to use 8 days instead of 30 days
CREATE OR REPLACE FUNCTION public.archive_old_load_emails()
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  archived_count integer := 0;
  cutoff_date timestamp with time zone;
BEGIN
  -- Changed from 30 days to 8 days retention
  cutoff_date := now() - interval '8 days';
  
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
$function$;