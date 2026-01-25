-- Add rejection tracking columns to applications table
ALTER TABLE public.applications 
ADD COLUMN IF NOT EXISTS rejected_at TIMESTAMP WITH TIME ZONE,
ADD COLUMN IF NOT EXISTS rejected_by UUID,
ADD COLUMN IF NOT EXISTS rejected_by_name TEXT,
ADD COLUMN IF NOT EXISTS rejection_reason TEXT;

-- Add comment for documentation
COMMENT ON COLUMN public.applications.rejected_at IS 'Timestamp when the application was rejected';
COMMENT ON COLUMN public.applications.rejected_by IS 'User ID of who rejected the application';
COMMENT ON COLUMN public.applications.rejected_by_name IS 'Name of user who rejected the application';
COMMENT ON COLUMN public.applications.rejection_reason IS 'Reason provided for rejection';