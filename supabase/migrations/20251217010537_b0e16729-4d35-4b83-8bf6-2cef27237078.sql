-- Enable realtime for load_hunt_matches table
ALTER PUBLICATION supabase_realtime ADD TABLE public.load_hunt_matches;

-- Enable realtime for load_emails table
ALTER PUBLICATION supabase_realtime ADD TABLE public.load_emails;