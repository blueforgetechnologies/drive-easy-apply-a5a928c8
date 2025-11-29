-- Create table to track missed loads for scorecard
CREATE TABLE IF NOT EXISTS public.missed_loads_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  load_email_id UUID NOT NULL REFERENCES public.load_emails(id) ON DELETE CASCADE,
  missed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  reset_at TIMESTAMP WITH TIME ZONE,
  dispatcher_id UUID,
  from_email TEXT,
  subject TEXT,
  received_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.missed_loads_history ENABLE ROW LEVEL SECURITY;

-- Allow admins to view missed loads history
CREATE POLICY "Admins can view missed loads history"
  ON public.missed_loads_history
  FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Allow admins to insert missed loads history
CREATE POLICY "Admins can insert missed loads history"
  ON public.missed_loads_history
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS idx_missed_loads_dispatcher ON public.missed_loads_history(dispatcher_id);
CREATE INDEX IF NOT EXISTS idx_missed_loads_missed_at ON public.missed_loads_history(missed_at);