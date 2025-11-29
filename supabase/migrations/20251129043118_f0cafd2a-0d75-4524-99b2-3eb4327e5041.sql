-- Create table for incoming load emails from Gmail
CREATE TABLE IF NOT EXISTS public.load_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_id TEXT NOT NULL UNIQUE,
  thread_id TEXT,
  from_email TEXT NOT NULL,
  from_name TEXT,
  subject TEXT,
  received_at TIMESTAMP WITH TIME ZONE NOT NULL,
  expires_at TIMESTAMP WITH TIME ZONE,
  body_text TEXT,
  body_html TEXT,
  parsed_data JSONB,
  status TEXT NOT NULL DEFAULT 'new',
  assigned_load_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_load_emails_status ON public.load_emails(status);
CREATE INDEX idx_load_emails_received_at ON public.load_emails(received_at DESC);
CREATE INDEX idx_load_emails_from_email ON public.load_emails(from_email);

-- Enable RLS
ALTER TABLE public.load_emails ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Admins can view all load emails"
  ON public.load_emails FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert load emails"
  ON public.load_emails FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update load emails"
  ON public.load_emails FOR UPDATE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete load emails"
  ON public.load_emails FOR DELETE
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Add foreign key to loads table if load is assigned
ALTER TABLE public.load_emails
  ADD CONSTRAINT fk_load_emails_load
  FOREIGN KEY (assigned_load_id)
  REFERENCES public.loads(id)
  ON DELETE SET NULL;

-- Create trigger for updated_at
CREATE TRIGGER update_load_emails_updated_at
  BEFORE UPDATE ON public.load_emails
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();