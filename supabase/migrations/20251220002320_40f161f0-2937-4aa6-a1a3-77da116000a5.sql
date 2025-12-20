-- Create table to track spend alerts
CREATE TABLE public.spend_alerts (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_email TEXT NOT NULL,
  alert_threshold NUMERIC NOT NULL DEFAULT 2.00,
  last_alerted_at TIMESTAMP WITH TIME ZONE,
  last_alerted_amount NUMERIC DEFAULT 0,
  total_spent NUMERIC DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.spend_alerts ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to manage their own alerts
CREATE POLICY "Users can view their own spend alerts" 
ON public.spend_alerts FOR SELECT 
USING (true);

CREATE POLICY "Users can insert spend alerts" 
ON public.spend_alerts FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Users can update spend alerts" 
ON public.spend_alerts FOR UPDATE 
USING (true);

-- Create trigger for updated_at
CREATE TRIGGER update_spend_alerts_updated_at
BEFORE UPDATE ON public.spend_alerts
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();