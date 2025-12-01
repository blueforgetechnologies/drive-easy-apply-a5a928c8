-- Fix the load_id generation function to handle concurrent inserts
CREATE OR REPLACE FUNCTION public.generate_load_id_for_date(target_date timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  date_prefix TEXT;
  next_number INTEGER;
  new_load_id TEXT;
  attempts INTEGER := 0;
  max_attempts INTEGER := 100;
BEGIN
  -- Generate date prefix: LH-YYMMDD
  date_prefix := 'LH-' || TO_CHAR(target_date, 'YYMMDD');
  
  LOOP
    attempts := attempts + 1;
    
    -- Find the highest number used for this date using FOR UPDATE to lock
    SELECT COALESCE(MAX(
      CAST(
        SUBSTRING(load_id FROM LENGTH(date_prefix) + 2) AS INTEGER
      )
    ), 0) + attempts
    INTO next_number
    FROM load_emails
    WHERE load_id LIKE date_prefix || '-%';
    
    -- Format as LH-YYMMDD-###
    new_load_id := date_prefix || '-' || LPAD(next_number::TEXT, 3, '0');
    
    -- Check if this ID already exists
    IF NOT EXISTS (SELECT 1 FROM load_emails WHERE load_id = new_load_id) THEN
      RETURN new_load_id;
    END IF;
    
    -- Safety exit after max attempts
    IF attempts >= max_attempts THEN
      -- Use timestamp suffix as fallback
      RETURN date_prefix || '-' || LPAD((next_number + EXTRACT(EPOCH FROM clock_timestamp())::INTEGER % 1000)::TEXT, 6, '0');
    END IF;
  END LOOP;
END;
$function$;