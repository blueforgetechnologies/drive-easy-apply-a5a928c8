-- Add column to track the payload value at time of approval
ALTER TABLE public.loads ADD COLUMN IF NOT EXISTS approved_payload numeric;

-- Add comment for documentation
COMMENT ON COLUMN public.loads.approved_payload IS 'Stores the payload (rate) value at the time carrier rate was approved. Used to detect when payload changes require re-approval.';