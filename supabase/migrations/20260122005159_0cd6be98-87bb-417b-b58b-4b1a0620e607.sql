-- Add new permissions for Load Approval Mode and Load Approval Page
INSERT INTO permissions (code, name, description, permission_type, category, sort_order)
VALUES 
  ('feature_load_approval_mode', 'Load Approval Mode', 'Can toggle Load Approval Mode on Loads tab', 'feature', 'loads', 18),
  ('feature_load_approval_page', 'Load Approval Page', 'Can access the Load Approval page', 'feature', 'loads', 19)
ON CONFLICT (code) DO NOTHING;