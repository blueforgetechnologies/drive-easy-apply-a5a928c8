-- Create parser_hints table to store field mapping patterns per email source
CREATE TABLE public.parser_hints (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  email_source TEXT NOT NULL DEFAULT 'sylectus',
  field_name TEXT NOT NULL,
  pattern TEXT NOT NULL,
  context_before TEXT,
  context_after TEXT,
  example_value TEXT,
  priority INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  notes TEXT
);

-- Create unique constraint to prevent duplicate patterns for same field/source
CREATE UNIQUE INDEX idx_parser_hints_unique ON public.parser_hints (email_source, field_name, pattern);

-- Create index for fast lookups by source
CREATE INDEX idx_parser_hints_source ON public.parser_hints (email_source, is_active);

-- Enable RLS
ALTER TABLE public.parser_hints ENABLE ROW LEVEL SECURITY;

-- Admins can manage parser hints
CREATE POLICY "Admins can view parser hints" ON public.parser_hints
FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert parser hints" ON public.parser_hints
FOR INSERT WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can update parser hints" ON public.parser_hints
FOR UPDATE USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can delete parser hints" ON public.parser_hints
FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_parser_hints_updated_at
BEFORE UPDATE ON public.parser_hints
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();