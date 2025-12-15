-- Create enum for email sources
CREATE TYPE email_source AS ENUM ('sylectus', 'fullcircle', '123loadboard', 'truckstop');

-- Create loadboard_filters table for managing filters per source
CREATE TABLE public.loadboard_filters (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  source email_source NOT NULL,
  filter_type TEXT NOT NULL CHECK (filter_type IN ('vehicle', 'load')),
  original_value TEXT NOT NULL,
  canonical_value TEXT,
  is_hidden BOOLEAN NOT NULL DEFAULT false,
  auto_mapped BOOLEAN NOT NULL DEFAULT false,
  reviewed_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(source, filter_type, original_value)
);

-- Add sources array to hunt_plans for explicit source selection
ALTER TABLE public.hunt_plans 
ADD COLUMN sources email_source[] DEFAULT NULL;

-- Enable RLS
ALTER TABLE public.loadboard_filters ENABLE ROW LEVEL SECURITY;

-- RLS policies for loadboard_filters
CREATE POLICY "Admins can view loadboard filters"
ON public.loadboard_filters FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Dispatchers can view loadboard filters"
ON public.loadboard_filters FOR SELECT
USING (has_role(auth.uid(), 'dispatcher'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert loadboard filters"
ON public.loadboard_filters FOR INSERT
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update loadboard filters"
ON public.loadboard_filters FOR UPDATE
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete loadboard filters"
ON public.loadboard_filters FOR DELETE
USING (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for updated_at
CREATE TRIGGER update_loadboard_filters_updated_at
BEFORE UPDATE ON public.loadboard_filters
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster lookups
CREATE INDEX idx_loadboard_filters_source ON public.loadboard_filters(source);
CREATE INDEX idx_loadboard_filters_canonical ON public.loadboard_filters(canonical_value);
CREATE INDEX idx_loadboard_filters_needs_review ON public.loadboard_filters(auto_mapped, reviewed_at) WHERE auto_mapped = true AND reviewed_at IS NULL;