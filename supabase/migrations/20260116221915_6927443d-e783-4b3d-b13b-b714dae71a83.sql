
-- Drop the old function signature (without p_status parameter)
DROP FUNCTION IF EXISTS public.complete_email_queue_item(uuid);

-- Keep only the one with p_status parameter (which has a default value)
