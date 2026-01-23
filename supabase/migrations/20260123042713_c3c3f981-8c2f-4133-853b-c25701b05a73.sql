-- Create repairs_needed table for tracking pending repairs per vehicle with urgency
CREATE TABLE public.repairs_needed (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vehicle_id UUID NOT NULL REFERENCES public.vehicles(id) ON DELETE CASCADE,
  description TEXT NOT NULL,
  urgency INTEGER NOT NULL DEFAULT 3, -- 1=Critical, 2=High, 3=Medium, 4=Low
  color TEXT, -- Optional color coding like spreadsheet
  status TEXT NOT NULL DEFAULT 'pending', -- pending, in_progress, completed
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID,
  completed_at TIMESTAMPTZ,
  sort_order INTEGER DEFAULT 0
);

-- Enable RLS
ALTER TABLE public.repairs_needed ENABLE ROW LEVEL SECURITY;

-- Create RLS policies using tenant_users table
CREATE POLICY "Users can view repairs for their tenant"
  ON public.repairs_needed FOR SELECT
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can insert repairs for their tenant"
  ON public.repairs_needed FOR INSERT
  WITH CHECK (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can update repairs for their tenant"
  ON public.repairs_needed FOR UPDATE
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()));

CREATE POLICY "Users can delete repairs for their tenant"
  ON public.repairs_needed FOR DELETE
  USING (tenant_id IN (SELECT tenant_id FROM public.tenant_users WHERE user_id = auth.uid()));

-- Create trigger for updated_at
CREATE TRIGGER update_repairs_needed_updated_at
  BEFORE UPDATE ON public.repairs_needed
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();

-- Create index for faster queries
CREATE INDEX idx_repairs_needed_vehicle ON public.repairs_needed(vehicle_id);
CREATE INDEX idx_repairs_needed_tenant ON public.repairs_needed(tenant_id);
CREATE INDEX idx_repairs_needed_urgency ON public.repairs_needed(urgency, sort_order);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.repairs_needed;