-- Create match_action_history table to track actions on load matches
CREATE TABLE public.match_action_history (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  match_id uuid NOT NULL REFERENCES public.load_hunt_matches(id) ON DELETE CASCADE,
  dispatcher_id uuid REFERENCES public.dispatchers(id),
  dispatcher_name text,
  dispatcher_email text,
  action_type text NOT NULL, -- 'viewed', 'skipped', 'bid', 'waitlist', 'undecided'
  action_details jsonb, -- additional details like bid amount
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.match_action_history ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Dispatchers can view match action history"
ON public.match_action_history
FOR SELECT
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can insert match action history"
ON public.match_action_history
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete match action history"
ON public.match_action_history
FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_match_action_history_match_id ON public.match_action_history(match_id);
CREATE INDEX idx_match_action_history_created_at ON public.match_action_history(created_at DESC);