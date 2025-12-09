-- Add missing tab permissions
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order) VALUES
('tab_maintenance', 'Maintenance Tab', 'Access to Maintenance management', 'maintenance', 'tab', 7),
('tab_development', 'Development Tab', 'Access to Development documentation', 'development', 'tab', 8),
('tab_changelog', 'Changelog Tab', 'Access to Changelog', 'changelog', 'tab', 9),
('tab_roles', 'Roles Tab', 'Access to Role Builder', 'roles', 'tab', 10);

-- Add feature-level permissions for Maintenance
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order) VALUES
('maintenance_view', 'View Maintenance', 'Can view maintenance records', 'maintenance', 'feature', 60),
('maintenance_create', 'Create Maintenance', 'Can create maintenance records', 'maintenance', 'feature', 61),
('maintenance_edit', 'Edit Maintenance', 'Can edit maintenance records', 'maintenance', 'feature', 62),
('maintenance_delete', 'Delete Maintenance', 'Can delete maintenance records', 'maintenance', 'feature', 63);

-- Add feature-level permissions for Map
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order) VALUES
('map_view', 'View Fleet Map', 'Can view vehicle locations on map', 'map', 'feature', 55),
('map_view_history', 'View Location History', 'Can view vehicle location history', 'map', 'feature', 56);