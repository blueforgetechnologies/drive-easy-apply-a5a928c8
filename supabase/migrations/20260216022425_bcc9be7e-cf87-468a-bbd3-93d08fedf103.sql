
-- Add a constraint to prevent full HTML bodies from being stored in sylectus_type_config
-- Valid equipment type strings should never exceed 200 characters
ALTER TABLE public.sylectus_type_config ADD CONSTRAINT sylectus_type_config_value_length CHECK (length(original_value) <= 200);
