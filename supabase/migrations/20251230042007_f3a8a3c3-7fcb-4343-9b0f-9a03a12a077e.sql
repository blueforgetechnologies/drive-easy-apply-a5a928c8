-- ui_action_registry: allow platform admins to read; nobody can write from the app
ALTER TABLE public.ui_action_registry ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ui_action_registry_read_only"
ON public.ui_action_registry
FOR SELECT
USING (EXISTS (
  SELECT 1 FROM public.profiles p
  WHERE p.id = auth.uid() AND p.is_platform_admin = true
));

CREATE POLICY "ui_action_registry_no_inserts" ON public.ui_action_registry FOR INSERT WITH CHECK (false);
CREATE POLICY "ui_action_registry_no_updates" ON public.ui_action_registry FOR UPDATE USING (false);
CREATE POLICY "ui_action_registry_no_deletes" ON public.ui_action_registry FOR DELETE USING (false);