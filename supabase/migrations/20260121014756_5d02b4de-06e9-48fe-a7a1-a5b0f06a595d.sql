-- Add missing permission categories to ensure all features are covered

-- Analytics permissions
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order)
VALUES 
  ('tab_analytics', 'Analytics Tab', 'Access to Load Analytics', 'analytics', 'tab', 120),
  ('analytics_view', 'View Analytics', 'Can view analytics dashboards and reports', 'analytics', 'feature', 121),
  ('analytics_export', 'Export Analytics', 'Can export analytics data', 'analytics', 'feature', 122)
ON CONFLICT (code) DO NOTHING;

-- Tools permissions
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order)
VALUES 
  ('tab_tools', 'Tools Tab', 'Access to Tools (Freight Calculator, etc.)', 'tools', 'tab', 130),
  ('freight_calculator', 'Freight Calculator', 'Can use freight calculator', 'tools', 'feature', 131),
  ('loadboard_filters', 'Loadboard Filters', 'Can manage loadboard filters', 'tools', 'feature', 132)
ON CONFLICT (code) DO NOTHING;

-- Inspector permissions (admin)
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order)
VALUES 
  ('tab_inspector', 'Inspector Tab', 'Access to Inspector tools', 'inspector', 'tab', 200),
  ('inspector_view', 'View Inspector', 'Can view system health and actions', 'inspector', 'feature', 201),
  ('inspector_actions', 'Inspector Actions', 'Can perform inspector actions', 'inspector', 'feature', 202)
ON CONFLICT (code) DO NOTHING;

-- Platform Admin permissions
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order)
VALUES 
  ('tab_platform_admin', 'Platform Admin Tab', 'Access to Platform Admin', 'platform_admin', 'tab', 210),
  ('tenant_management', 'Tenant Management', 'Can manage tenants', 'platform_admin', 'feature', 211),
  ('impersonation', 'Impersonation', 'Can impersonate users', 'platform_admin', 'feature', 212)
ON CONFLICT (code) DO NOTHING;

-- Rollouts permissions
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order)
VALUES 
  ('tab_rollouts', 'Rollouts Tab', 'Access to Feature Rollouts', 'rollouts', 'tab', 220),
  ('rollouts_view', 'View Rollouts', 'Can view feature flags and rollouts', 'rollouts', 'feature', 221),
  ('rollouts_edit', 'Edit Rollouts', 'Can manage feature flags', 'rollouts', 'feature', 222)
ON CONFLICT (code) DO NOTHING;

-- Add missing load permissions
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order)
VALUES 
  ('loads_approve', 'Approve Loads', 'Can approve loads for booking', 'loads', 'feature', 16),
  ('loads_book', 'Book Loads', 'Can book loads with carriers', 'loads', 'feature', 17)
ON CONFLICT (code) DO NOTHING;

-- Add missing Load Hunter permissions
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order)
VALUES 
  ('load_hunter_manage_plans', 'Manage Hunt Plans', 'Can create and edit hunt plans', 'load_hunter', 'feature', 44),
  ('load_hunter_bid', 'Submit Bids', 'Can submit bids on loads', 'load_hunter', 'feature', 45)
ON CONFLICT (code) DO NOTHING;

-- Add missing business permissions
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order)
VALUES 
  ('locations_view', 'View Locations', 'Can view location list', 'business', 'feature', 57),
  ('locations_edit', 'Edit Locations', 'Can edit location information', 'business', 'feature', 58)
ON CONFLICT (code) DO NOTHING;

-- Add missing accounting permissions  
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order)
VALUES 
  ('settlements_edit', 'Edit Settlements', 'Can edit settlement information', 'accounting', 'feature', 36),
  ('expenses_view', 'View Expenses', 'Can view expenses', 'accounting', 'feature', 37),
  ('expenses_edit', 'Edit Expenses', 'Can create and edit expenses', 'accounting', 'feature', 38)
ON CONFLICT (code) DO NOTHING;