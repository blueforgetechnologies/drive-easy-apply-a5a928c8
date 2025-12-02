-- Create a sequence for load_id generation
CREATE SEQUENCE IF NOT EXISTS load_email_seq START WITH 1;

-- Fix the load_id generator to use sequence (guaranteed unique)
CREATE OR REPLACE FUNCTION public.generate_load_id_for_date(target_date timestamp with time zone)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  date_prefix TEXT;
  seq_val INTEGER;
BEGIN
  -- Generate date prefix: LH-YYMMDD
  date_prefix := 'LH-' || TO_CHAR(target_date, 'YYMMDD');
  
  -- Get next sequence value (guaranteed unique)
  seq_val := nextval('load_email_seq');
  
  -- Format as LH-YYMMDD-### (sequence number)
  RETURN date_prefix || '-' || seq_val::TEXT;
END;
$function$;

-- Reset the sequence to a safe value above existing max
DO $$
DECLARE
  max_num INTEGER;
BEGIN
  SELECT COALESCE(MAX(
    CASE 
      WHEN load_id ~ '^LH-[0-9]{6}-[0-9]+$' THEN
        CAST(SUBSTRING(load_id FROM 11) AS INTEGER)
      ELSE 0
    END
  ), 0) + 1 INTO max_num
  FROM load_emails;
  
  EXECUTE 'ALTER SEQUENCE load_email_seq RESTART WITH ' || max_num;
END $$;