-- Create table for user-specific cost calibration settings
CREATE TABLE public.user_cost_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL UNIQUE,
  cloud_calibrated_rate NUMERIC,
  mapbox_calibrated_multiplier NUMERIC,
  monthly_budget NUMERIC DEFAULT 100,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.user_cost_settings ENABLE ROW LEVEL SECURITY;

-- Policies: users can only access their own settings
CREATE POLICY "Users can view their own cost settings"
ON public.user_cost_settings
FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own cost settings"
ON public.user_cost_settings
FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own cost settings"
ON public.user_cost_settings
FOR UPDATE
USING (auth.uid() = user_id);

-- Trigger for updated_at
CREATE TRIGGER update_user_cost_settings_updated_at
BEFORE UPDATE ON public.user_cost_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();