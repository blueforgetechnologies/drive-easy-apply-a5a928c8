-- Fix function search_path for update_hunt_plans_updated_at
CREATE OR REPLACE FUNCTION public.update_hunt_plans_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

-- Update RLS policies for vehicles table to restrict to admin role
DROP POLICY IF EXISTS "vehicles_select" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_insert" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_update" ON public.vehicles;
DROP POLICY IF EXISTS "vehicles_delete" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can view all vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can insert vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can update vehicles" ON public.vehicles;
DROP POLICY IF EXISTS "Admins can delete vehicles" ON public.vehicles;

CREATE POLICY "Admins can view all vehicles" ON public.vehicles
  FOR SELECT USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can insert vehicles" ON public.vehicles
  FOR INSERT WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can update vehicles" ON public.vehicles
  FOR UPDATE USING (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Admins can delete vehicles" ON public.vehicles
  FOR DELETE USING (public.has_role(auth.uid(), 'admin'));

-- Update RLS policies for hunt_plans table to restrict based on creator/admin
DROP POLICY IF EXISTS "hunt_plans_select" ON public.hunt_plans;
DROP POLICY IF EXISTS "hunt_plans_insert" ON public.hunt_plans;
DROP POLICY IF EXISTS "hunt_plans_update" ON public.hunt_plans;
DROP POLICY IF EXISTS "hunt_plans_delete" ON public.hunt_plans;
DROP POLICY IF EXISTS "Users can view own hunt plans or admins view all" ON public.hunt_plans;
DROP POLICY IF EXISTS "Users can create own hunt plans" ON public.hunt_plans;
DROP POLICY IF EXISTS "Users can update own hunt plans or admins update all" ON public.hunt_plans;
DROP POLICY IF EXISTS "Users can delete own hunt plans or admins delete all" ON public.hunt_plans;

CREATE POLICY "Users can view own hunt plans or admins view all" ON public.hunt_plans
  FOR SELECT USING (
    created_by = auth.uid() OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can create own hunt plans" ON public.hunt_plans
  FOR INSERT WITH CHECK (
    created_by = auth.uid() OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can update own hunt plans or admins update all" ON public.hunt_plans
  FOR UPDATE USING (
    created_by = auth.uid() OR public.has_role(auth.uid(), 'admin')
  );

CREATE POLICY "Users can delete own hunt plans or admins delete all" ON public.hunt_plans
  FOR DELETE USING (
    created_by = auth.uid() OR public.has_role(auth.uid(), 'admin')
  );