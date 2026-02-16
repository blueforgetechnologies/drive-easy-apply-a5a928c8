
CREATE OR REPLACE FUNCTION public.archive_old_load_emails_batched(batch_size integer DEFAULT 1000)
 RETURNS integer
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
 SET statement_timeout TO '30s'
AS $function$
DECLARE
  archived_count integer := 0;
  cutoff_date timestamp with time zone;
  batch_ids uuid[];
BEGIN
  cutoff_date := now() - interval '8 days';
  
  -- Get batch of IDs, excluding rows that are still referenced as parents
  SELECT ARRAY_AGG(id) INTO batch_ids
  FROM (
    SELECT le.id FROM load_emails le
    WHERE le.received_at < cutoff_date
      AND NOT EXISTS (
        SELECT 1 FROM load_emails child
        WHERE child.parent_email_id = le.id
          AND child.received_at >= cutoff_date
      )
    ORDER BY le.received_at ASC
    LIMIT batch_size
  ) sub;
  
  IF batch_ids IS NULL OR array_length(batch_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;
  
  -- Archive: insert into archive table
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
  WHERE id = ANY(batch_ids);
  
  GET DIAGNOSTICS archived_count = ROW_COUNT;
  
  -- Delete archived records (children-first ordering handled by exclusion above)
  DELETE FROM load_emails WHERE id = ANY(batch_ids);
  
  RETURN archived_count;
END;
$function$;
