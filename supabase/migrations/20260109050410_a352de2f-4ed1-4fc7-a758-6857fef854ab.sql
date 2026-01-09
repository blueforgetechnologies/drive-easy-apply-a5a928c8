-- Add restart signal column to worker_config
ALTER TABLE public.worker_config 
ADD COLUMN IF NOT EXISTS restart_requested_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add comment explaining the column
COMMENT ON COLUMN public.worker_config.restart_requested_at IS 'When set, workers should gracefully restart. Workers clear this after acknowledging.';