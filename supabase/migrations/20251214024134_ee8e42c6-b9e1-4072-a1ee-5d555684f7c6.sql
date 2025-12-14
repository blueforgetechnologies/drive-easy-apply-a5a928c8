-- Create table to track hidden/deleted type values
CREATE TABLE public.sylectus_type_config (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  type_category TEXT NOT NULL CHECK (type_category IN ('vehicle', 'load')),
  original_value TEXT NOT NULL,
  mapped_to TEXT, -- NULL means hidden/deleted, otherwise merged to this value
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  UNIQUE(type_category, original_value)
);

-- Enable RLS
ALTER TABLE public.sylectus_type_config ENABLE ROW LEVEL SECURITY;

-- Admins can manage type configs
CREATE POLICY "Admins can view sylectus type config"
  ON public.sylectus_type_config FOR SELECT
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert sylectus type config"
  ON public.sylectus_type_config FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update sylectus type config"
  ON public.sylectus_type_config FOR UPDATE
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete sylectus type config"
  ON public.sylectus_type_config FOR DELETE
  USING (has_role(auth.uid(), 'admin'::app_role));

-- Dispatchers can view type configs
CREATE POLICY "Dispatchers can view sylectus type config"
  ON public.sylectus_type_config FOR SELECT
  USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));