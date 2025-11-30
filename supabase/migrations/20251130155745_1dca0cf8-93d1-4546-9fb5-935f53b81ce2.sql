-- Add load_id column to load_emails table
ALTER TABLE load_emails ADD COLUMN IF NOT EXISTS load_id TEXT UNIQUE;

-- Create function to generate next load_id for a specific date
CREATE OR REPLACE FUNCTION generate_load_id_for_date(target_date TIMESTAMP WITH TIME ZONE)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  date_prefix TEXT;
  next_number INTEGER;
  new_load_id TEXT;
BEGIN
  -- Generate date prefix: LH-YYMMDD
  date_prefix := 'LH-' || TO_CHAR(target_date, 'YYMMDD');
  
  -- Find the highest number used for this date
  SELECT COALESCE(MAX(
    CAST(
      SUBSTRING(load_id FROM LENGTH(date_prefix) + 2) AS INTEGER
    )
  ), 0) + 1
  INTO next_number
  FROM load_emails
  WHERE load_id LIKE date_prefix || '-%';
  
  -- Format as LH-YYMMDD-###
  new_load_id := date_prefix || '-' || LPAD(next_number::TEXT, 3, '0');
  
  RETURN new_load_id;
END;
$$;

-- Create trigger function to auto-generate load_id on insert
CREATE OR REPLACE FUNCTION set_load_id()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.load_id IS NULL THEN
    NEW.load_id := generate_load_id_for_date(NEW.received_at);
  END IF;
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS trigger_set_load_id ON load_emails;
CREATE TRIGGER trigger_set_load_id
  BEFORE INSERT ON load_emails
  FOR EACH ROW
  EXECUTE FUNCTION set_load_id();