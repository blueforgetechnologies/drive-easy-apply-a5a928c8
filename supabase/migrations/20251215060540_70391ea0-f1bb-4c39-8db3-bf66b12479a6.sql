-- Change canonical_value from single text to array of text for multi-mapping support
ALTER TABLE public.loadboard_filters 
  ALTER COLUMN canonical_value TYPE text[] 
  USING CASE 
    WHEN canonical_value IS NULL THEN NULL 
    ELSE ARRAY[canonical_value] 
  END;