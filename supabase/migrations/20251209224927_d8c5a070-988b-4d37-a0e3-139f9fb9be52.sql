-- Add feature column to track where AI is used in the app
ALTER TABLE public.ai_usage_tracking 
ADD COLUMN IF NOT EXISTS feature text DEFAULT 'unknown';

-- Add index for efficient feature-based queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_tracking_feature ON public.ai_usage_tracking(feature);

-- Add index for month + feature queries
CREATE INDEX IF NOT EXISTS idx_ai_usage_tracking_month_feature ON public.ai_usage_tracking(month_year, feature);