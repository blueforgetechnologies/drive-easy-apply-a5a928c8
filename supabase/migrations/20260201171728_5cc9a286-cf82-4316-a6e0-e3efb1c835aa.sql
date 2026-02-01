
-- Enable realtime for broker_credit_checks table so UI gets live updates
ALTER PUBLICATION supabase_realtime ADD TABLE public.broker_credit_checks;
