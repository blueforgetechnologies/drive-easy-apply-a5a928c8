-- Add payload tracking columns to carrier_rate_history table
ALTER TABLE public.carrier_rate_history
ADD COLUMN old_payload numeric,
ADD COLUMN new_payload numeric;

-- Add a comment to clarify the table's purpose
COMMENT ON TABLE public.carrier_rate_history IS 'Tracks both carrier rate and payload (customer rate) changes for load approvals';