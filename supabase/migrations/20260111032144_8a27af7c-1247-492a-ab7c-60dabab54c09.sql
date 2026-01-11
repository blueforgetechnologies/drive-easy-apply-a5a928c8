-- 1) Set gmail_alias for tenants 
UPDATE public.tenants SET gmail_alias = '+talbi' WHERE slug = 'talbi-logistics-llc' AND (gmail_alias IS NULL OR gmail_alias != '+talbi');
UPDATE public.tenants SET gmail_alias = '+internal' WHERE slug = 'default' AND (gmail_alias IS NULL OR gmail_alias != '+internal');

-- 2) Drop the problematic global UNIQUE constraint on gmail_message_id
ALTER TABLE public.email_queue DROP CONSTRAINT IF EXISTS email_queue_gmail_message_id_key;

-- 3) Add proper tenant-scoped deduplication constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_indexes 
    WHERE tablename = 'email_queue' 
    AND indexname = 'email_queue_tenant_dedupe_key'
  ) THEN
    CREATE UNIQUE INDEX email_queue_tenant_dedupe_key 
    ON public.email_queue (tenant_id, dedupe_key);
  END IF;
END $$;

-- 4) Create unroutable_emails quarantine table
CREATE TABLE IF NOT EXISTS public.unroutable_emails (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  gmail_message_id TEXT NOT NULL,
  gmail_history_id TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  
  -- Header analysis
  delivered_to_header TEXT,
  x_original_to_header TEXT,
  envelope_to_header TEXT,
  to_header TEXT,
  from_header TEXT,
  subject TEXT,
  
  -- Extraction results
  extracted_alias TEXT,
  extraction_source TEXT,
  
  -- Routing failure reason
  failure_reason TEXT NOT NULL,
  
  -- Raw payload reference
  payload_url TEXT,
  raw_headers JSONB,
  
  -- Status tracking
  status TEXT NOT NULL DEFAULT 'quarantined',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  resolution_notes TEXT
);

-- Add unique constraint if not exists
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'unroutable_emails_gmail_message_id_unique'
  ) THEN
    ALTER TABLE public.unroutable_emails 
    ADD CONSTRAINT unroutable_emails_gmail_message_id_unique UNIQUE (gmail_message_id);
  END IF;
END $$;

-- Enable RLS
ALTER TABLE public.unroutable_emails ENABLE ROW LEVEL SECURITY;

-- Create policies using is_platform_admin function
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unroutable_emails' AND policyname = 'Platform admins can view quarantine') THEN
    CREATE POLICY "Platform admins can view quarantine"
      ON public.unroutable_emails
      FOR SELECT
      USING (is_platform_admin(auth.uid()));
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename = 'unroutable_emails' AND policyname = 'Platform admins can update quarantine') THEN
    CREATE POLICY "Platform admins can update quarantine"
      ON public.unroutable_emails
      FOR UPDATE
      USING (is_platform_admin(auth.uid()));
  END IF;
END $$;

-- Add routing columns to email_queue if not exists
ALTER TABLE public.email_queue 
ADD COLUMN IF NOT EXISTS routing_method TEXT,
ADD COLUMN IF NOT EXISTS extracted_alias TEXT,
ADD COLUMN IF NOT EXISTS delivered_to_header TEXT;

-- Create indexes if not exist
CREATE INDEX IF NOT EXISTS idx_email_queue_routing_method ON public.email_queue (routing_method, queued_at DESC);
CREATE INDEX IF NOT EXISTS idx_unroutable_emails_received ON public.unroutable_emails (received_at DESC);
CREATE INDEX IF NOT EXISTS idx_unroutable_emails_status ON public.unroutable_emails (status);

-- Add comment
COMMENT ON TABLE public.unroutable_emails IS 'Quarantine for emails that could not be routed to a tenant';