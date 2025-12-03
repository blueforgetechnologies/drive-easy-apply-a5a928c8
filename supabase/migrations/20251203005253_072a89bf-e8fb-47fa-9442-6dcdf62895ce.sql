-- Create processing_state table to track cursor checkpoint
CREATE TABLE IF NOT EXISTS public.processing_state (
  id TEXT PRIMARY KEY DEFAULT 'email_processor',
  last_processed_received_at TIMESTAMP WITH TIME ZONE,
  last_processed_load_id TEXT,
  floor_received_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT '2025-12-03 00:46:12+00'::timestamptz,
  floor_load_id TEXT NOT NULL DEFAULT 'LH-251203-1004448',
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Insert initial state with the floor values
INSERT INTO public.processing_state (id, last_processed_received_at, last_processed_load_id, floor_received_at, floor_load_id)
VALUES ('email_processor', '2025-12-03 00:46:12+00'::timestamptz, 'LH-251203-1004448', '2025-12-03 00:46:12+00'::timestamptz, 'LH-251203-1004448')
ON CONFLICT (id) DO NOTHING;

-- Enable RLS
ALTER TABLE public.processing_state ENABLE ROW LEVEL SECURITY;

-- Allow all authenticated users to read/update
CREATE POLICY "processing_state_all" ON public.processing_state
  FOR ALL USING (true) WITH CHECK (true);