-- Add missing feature flags for all navigation tabs and features
-- This ensures Rollouts UI can control all major app features

-- Insert new feature flag definitions (skip if they already exist)
INSERT INTO public.feature_flags (key, name, description, default_enabled, is_killswitch)
VALUES 
  -- Navigation tabs
  ('analytics', 'Analytics Dashboard', 'Load analytics with charts and insights', false, false),
  ('usage_dashboard', 'Usage Dashboard', 'API usage and cost tracking (internal only)', false, false),
  ('development_tools', 'Development Tools', 'Development and debugging tools', false, false),
  ('inspector_tools', 'Inspector Tools', 'Platform health inspector (platform admin only)', false, false),
  ('map_view', 'Map View', 'Vehicle and load map visualization', true, false),
  ('maintenance_module', 'Maintenance Module', 'Vehicle maintenance tracking', true, false),
  ('accounting_module', 'Accounting Module', 'Invoicing and settlements', true, false),
  ('carrier_dashboard', 'Carrier Dashboard', 'Carrier-specific view', true, false),
  ('operations_module', 'Operations Module', 'Customer, driver, and vehicle management', true, false)
ON CONFLICT (key) DO NOTHING;

-- Set channel defaults for internal-only features
-- Usage Dashboard: internal only
INSERT INTO public.release_channel_feature_flags (feature_flag_id, release_channel, enabled)
SELECT id, 'internal', true FROM public.feature_flags WHERE key = 'usage_dashboard'
ON CONFLICT (feature_flag_id, release_channel) DO UPDATE SET enabled = true;

INSERT INTO public.release_channel_feature_flags (feature_flag_id, release_channel, enabled)
SELECT id, 'pilot', false FROM public.feature_flags WHERE key = 'usage_dashboard'
ON CONFLICT (feature_flag_id, release_channel) DO UPDATE SET enabled = false;

INSERT INTO public.release_channel_feature_flags (feature_flag_id, release_channel, enabled)
SELECT id, 'general', false FROM public.feature_flags WHERE key = 'usage_dashboard'
ON CONFLICT (feature_flag_id, release_channel) DO UPDATE SET enabled = false;

-- Development Tools: internal only
INSERT INTO public.release_channel_feature_flags (feature_flag_id, release_channel, enabled)
SELECT id, 'internal', true FROM public.feature_flags WHERE key = 'development_tools'
ON CONFLICT (feature_flag_id, release_channel) DO UPDATE SET enabled = true;

INSERT INTO public.release_channel_feature_flags (feature_flag_id, release_channel, enabled)
SELECT id, 'pilot', false FROM public.feature_flags WHERE key = 'development_tools'
ON CONFLICT (feature_flag_id, release_channel) DO UPDATE SET enabled = false;

INSERT INTO public.release_channel_feature_flags (feature_flag_id, release_channel, enabled)
SELECT id, 'general', false FROM public.feature_flags WHERE key = 'development_tools'
ON CONFLICT (feature_flag_id, release_channel) DO UPDATE SET enabled = false;

-- Inspector Tools: internal only
INSERT INTO public.release_channel_feature_flags (feature_flag_id, release_channel, enabled)
SELECT id, 'internal', true FROM public.feature_flags WHERE key = 'inspector_tools'
ON CONFLICT (feature_flag_id, release_channel) DO UPDATE SET enabled = true;

INSERT INTO public.release_channel_feature_flags (feature_flag_id, release_channel, enabled)
SELECT id, 'pilot', false FROM public.feature_flags WHERE key = 'inspector_tools'
ON CONFLICT (feature_flag_id, release_channel) DO UPDATE SET enabled = false;

INSERT INTO public.release_channel_feature_flags (feature_flag_id, release_channel, enabled)
SELECT id, 'general', false FROM public.feature_flags WHERE key = 'inspector_tools'
ON CONFLICT (feature_flag_id, release_channel) DO UPDATE SET enabled = false;

-- Analytics: pilot + internal only by default
INSERT INTO public.release_channel_feature_flags (feature_flag_id, release_channel, enabled)
SELECT id, 'internal', true FROM public.feature_flags WHERE key = 'analytics'
ON CONFLICT (feature_flag_id, release_channel) DO UPDATE SET enabled = true;

INSERT INTO public.release_channel_feature_flags (feature_flag_id, release_channel, enabled)
SELECT id, 'pilot', true FROM public.feature_flags WHERE key = 'analytics'
ON CONFLICT (feature_flag_id, release_channel) DO UPDATE SET enabled = true;

INSERT INTO public.release_channel_feature_flags (feature_flag_id, release_channel, enabled)
SELECT id, 'general', false FROM public.feature_flags WHERE key = 'analytics'
ON CONFLICT (feature_flag_id, release_channel) DO UPDATE SET enabled = false;