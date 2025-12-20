-- Create table to track Google Cloud Platform usage data for calibration
CREATE TABLE public.gcp_usage_baselines (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  service_name TEXT NOT NULL, -- e.g., 'gmail_api', 'pubsub', 'cloud_functions'
  metric_name TEXT NOT NULL, -- e.g., 'api_calls', 'data_transfer_bytes'
  metric_value BIGINT NOT NULL, -- The actual count from GCP Console
  period_start DATE NOT NULL, -- Start of measurement period
  period_end DATE NOT NULL, -- End of measurement period
  period_days INTEGER NOT NULL, -- Number of days in the period
  notes TEXT, -- Any additional notes about this baseline
  source TEXT DEFAULT 'gcp_console', -- Where this data came from
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by TEXT -- Who recorded this data
);

-- Enable RLS
ALTER TABLE public.gcp_usage_baselines ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read
CREATE POLICY "Authenticated users can view GCP baselines" 
ON public.gcp_usage_baselines 
FOR SELECT 
USING (auth.role() = 'authenticated');

-- Allow authenticated users to insert
CREATE POLICY "Authenticated users can insert GCP baselines" 
ON public.gcp_usage_baselines 
FOR INSERT 
WITH CHECK (auth.role() = 'authenticated');

-- Insert the baseline data from the user's GCP Console screenshot
INSERT INTO public.gcp_usage_baselines (service_name, metric_name, metric_value, period_start, period_end, period_days, notes, created_by)
VALUES 
  ('gmail_api', 'api_calls', 2689724, '2025-11-29', '2025-12-19', 21, 'Initial calibration from GCP Console APIs & Services dashboard', 'system'),
  ('gmail_api', 'emails_processed', 206912, '2025-11-29', '2025-12-19', 21, 'Emails received during calibration period', 'system');