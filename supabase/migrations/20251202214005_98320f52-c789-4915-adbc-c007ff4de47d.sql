-- Create lightweight email queue for fast ingestion
CREATE TABLE public.email_queue (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gmail_message_id text NOT NULL,
  gmail_history_id text,
  queued_at timestamp with time zone NOT NULL DEFAULT now(),
  status text NOT NULL DEFAULT 'pending',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  processed_at timestamp with time zone,
  CONSTRAINT email_queue_gmail_message_id_key UNIQUE (gmail_message_id)
);

-- Index for fast pending lookup
CREATE INDEX idx_email_queue_status ON public.email_queue(status) WHERE status = 'pending';
CREATE INDEX idx_email_queue_queued_at ON public.email_queue(queued_at);

-- Enable RLS with simple policy
ALTER TABLE public.email_queue ENABLE ROW LEVEL SECURITY;

CREATE POLICY "email_queue_all" ON public.email_queue FOR ALL USING (true) WITH CHECK (true);