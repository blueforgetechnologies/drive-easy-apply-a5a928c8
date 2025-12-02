-- Fix the load_id generator to handle concurrent inserts better
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
BEGIN
  -- Generate date prefix: LH-YYMMDD
  date_prefix := 'LH-' || TO_CHAR(target_date, 'YYMMDD');
  
  -- Use advisory lock to prevent concurrent generation
  PERFORM pg_advisory_xact_lock(hashtext(date_prefix));
  
  -- Find the highest number used for this date
  SELECT COALESCE(MAX(
    CAST(
      SUBSTRING(load_id FROM LENGTH(date_prefix) + 2) AS INTEGER
    )
  ), 0) + 1
  INTO next_number
  FROM load_emails
  WHERE load_id LIKE date_prefix || '-%';
  
  -- Format as LH-YYMMDD-### (3 digits)
  new_load_id := date_prefix || '-' || LPAD(next_number::TEXT, 3, '0');
  
  RETURN new_load_id;
END;
$function$;