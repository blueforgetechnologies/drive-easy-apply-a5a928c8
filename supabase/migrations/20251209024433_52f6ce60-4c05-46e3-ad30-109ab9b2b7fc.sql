-- Create permissions table to store all available features/permissions
CREATE TABLE public.permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text NOT NULL UNIQUE,
  name text NOT NULL,
  description text,
  category text NOT NULL, -- e.g., 'loads', 'assets', 'accounting', 'settings'
  permission_type text NOT NULL DEFAULT 'feature', -- 'tab' or 'feature'
  parent_permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE,
  sort_order integer DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

-- Create custom roles table
CREATE TABLE public.custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  is_system_role boolean DEFAULT false, -- for built-in roles like 'admin', 'dispatcher'
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Create role_permissions junction table
CREATE TABLE public.role_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role_id uuid REFERENCES public.custom_roles(id) ON DELETE CASCADE NOT NULL,
  permission_id uuid REFERENCES public.permissions(id) ON DELETE CASCADE NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(role_id, permission_id)
);

-- Create user_custom_roles to assign custom roles to users
CREATE TABLE public.user_custom_roles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  role_id uuid REFERENCES public.custom_roles(id) ON DELETE CASCADE NOT NULL,
  assigned_by uuid REFERENCES auth.users(id),
  assigned_at timestamptz DEFAULT now(),
  UNIQUE(user_id, role_id)
);

-- Enable RLS
ALTER TABLE public.permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.role_permissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_custom_roles ENABLE ROW LEVEL SECURITY;

-- Function to check if user can manage roles (admin or has role_manager permission)
CREATE OR REPLACE FUNCTION public.can_manage_roles(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    has_role(_user_id, 'admin'::app_role) 
    OR EXISTS (
      SELECT 1 
      FROM user_custom_roles ucr
      JOIN role_permissions rp ON rp.role_id = ucr.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ucr.user_id = _user_id AND p.code = 'manage_roles'
    )
$$;

-- Function to check if user has a specific permission
CREATE OR REPLACE FUNCTION public.has_permission(_user_id uuid, _permission_code text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 
    has_role(_user_id, 'admin'::app_role) -- admins have all permissions
    OR EXISTS (
      SELECT 1 
      FROM user_custom_roles ucr
      JOIN role_permissions rp ON rp.role_id = ucr.role_id
      JOIN permissions p ON p.id = rp.permission_id
      WHERE ucr.user_id = _user_id AND p.code = _permission_code
    )
$$;

-- RLS Policies for permissions (everyone can read, only role managers can modify)
CREATE POLICY "Anyone can view permissions" ON public.permissions FOR SELECT USING (true);
CREATE POLICY "Role managers can insert permissions" ON public.permissions FOR INSERT WITH CHECK (can_manage_roles(auth.uid()));
CREATE POLICY "Role managers can update permissions" ON public.permissions FOR UPDATE USING (can_manage_roles(auth.uid()));
CREATE POLICY "Role managers can delete permissions" ON public.permissions FOR DELETE USING (can_manage_roles(auth.uid()));

-- RLS Policies for custom_roles
CREATE POLICY "Anyone can view custom roles" ON public.custom_roles FOR SELECT USING (true);
CREATE POLICY "Role managers can insert custom roles" ON public.custom_roles FOR INSERT WITH CHECK (can_manage_roles(auth.uid()));
CREATE POLICY "Role managers can update custom roles" ON public.custom_roles FOR UPDATE USING (can_manage_roles(auth.uid()));
CREATE POLICY "Role managers can delete non-system roles" ON public.custom_roles FOR DELETE USING (can_manage_roles(auth.uid()) AND is_system_role = false);

-- RLS Policies for role_permissions
CREATE POLICY "Anyone can view role permissions" ON public.role_permissions FOR SELECT USING (true);
CREATE POLICY "Role managers can insert role permissions" ON public.role_permissions FOR INSERT WITH CHECK (can_manage_roles(auth.uid()));
CREATE POLICY "Role managers can delete role permissions" ON public.role_permissions FOR DELETE USING (can_manage_roles(auth.uid()));

-- RLS Policies for user_custom_roles
CREATE POLICY "Admins can view all user roles" ON public.user_custom_roles FOR SELECT USING (has_role(auth.uid(), 'admin'::app_role) OR can_manage_roles(auth.uid()) OR user_id = auth.uid());
CREATE POLICY "Role managers can assign roles" ON public.user_custom_roles FOR INSERT WITH CHECK (can_manage_roles(auth.uid()));
CREATE POLICY "Role managers can remove roles" ON public.user_custom_roles FOR DELETE USING (can_manage_roles(auth.uid()));

-- Insert default permissions (all tabs and features)
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order) VALUES
-- Tab-level permissions
('tab_loads', 'Loads Tab', 'Access to Loads management', 'loads', 'tab', 1),
('tab_business', 'Business Manager Tab', 'Access to Business Manager (Assets, Drivers, etc.)', 'business', 'tab', 2),
('tab_accounting', 'Accounting Tab', 'Access to Accounting (Invoices, Settlements, Audit)', 'accounting', 'tab', 3),
('tab_settings', 'Settings Tab', 'Access to Settings', 'settings', 'tab', 4),
('tab_load_hunter', 'Load Hunter Tab', 'Access to Load Hunter', 'load_hunter', 'tab', 5),
('tab_map', 'Map Tab', 'Access to Fleet Map', 'map', 'tab', 6);

-- Feature-level permissions for Loads
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order) VALUES
('loads_view', 'View Loads', 'Can view load list and details', 'loads', 'feature', 10),
('loads_create', 'Create Loads', 'Can create new loads', 'loads', 'feature', 11),
('loads_edit', 'Edit Loads', 'Can edit existing loads', 'loads', 'feature', 12),
('loads_delete', 'Delete Loads', 'Can delete loads', 'loads', 'feature', 13),
('loads_assign', 'Assign Loads', 'Can assign drivers/vehicles to loads', 'loads', 'feature', 14);

-- Feature-level permissions for Business Manager
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order) VALUES
('assets_view', 'View Assets', 'Can view vehicle list and details', 'business', 'feature', 20),
('assets_edit', 'Edit Assets', 'Can edit vehicle information', 'business', 'feature', 21),
('drivers_view', 'View Drivers', 'Can view driver list and applications', 'business', 'feature', 22),
('drivers_edit', 'Edit Drivers', 'Can edit driver information', 'business', 'feature', 23),
('dispatchers_view', 'View Dispatchers', 'Can view dispatcher list', 'business', 'feature', 24),
('dispatchers_edit', 'Edit Dispatchers', 'Can edit dispatcher information', 'business', 'feature', 25),
('carriers_view', 'View Carriers', 'Can view carrier list', 'business', 'feature', 26),
('carriers_edit', 'Edit Carriers', 'Can edit carrier information', 'business', 'feature', 27),
('customers_view', 'View Customers', 'Can view customer list', 'business', 'feature', 28),
('customers_edit', 'Edit Customers', 'Can edit customer information', 'business', 'feature', 29);

-- Feature-level permissions for Accounting
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order) VALUES
('invoices_view', 'View Invoices', 'Can view invoices', 'accounting', 'feature', 30),
('invoices_create', 'Create Invoices', 'Can create new invoices', 'accounting', 'feature', 31),
('invoices_edit', 'Edit Invoices', 'Can edit invoices', 'accounting', 'feature', 32),
('settlements_view', 'View Settlements', 'Can view settlements', 'accounting', 'feature', 33),
('settlements_create', 'Create Settlements', 'Can create settlements', 'accounting', 'feature', 34),
('audit_logs_view', 'View Audit Logs', 'Can view audit logs', 'accounting', 'feature', 35);

-- Feature-level permissions for Settings
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order) VALUES
('users_view', 'View Users', 'Can view user list', 'settings', 'feature', 40),
('users_manage', 'Manage Users', 'Can invite and manage users', 'settings', 'feature', 41),
('company_view', 'View Company Profile', 'Can view company settings', 'settings', 'feature', 42),
('company_edit', 'Edit Company Profile', 'Can edit company settings', 'settings', 'feature', 43),
('integrations_view', 'View Integrations', 'Can view integrations status', 'settings', 'feature', 44),
('integrations_manage', 'Manage Integrations', 'Can configure integrations', 'settings', 'feature', 45),
('manage_roles', 'Manage Roles', 'Can create and assign roles', 'settings', 'feature', 46);

-- Feature-level permissions for Load Hunter
INSERT INTO public.permissions (code, name, description, category, permission_type, sort_order) VALUES
('load_hunter_view', 'View Load Hunter', 'Can view Load Hunter matches', 'load_hunter', 'feature', 50),
('load_hunter_bid', 'Send Bids', 'Can send bid emails', 'load_hunter', 'feature', 51),
('load_hunter_manage_hunts', 'Manage Hunt Plans', 'Can create and edit hunt plans', 'load_hunter', 'feature', 52);

-- Create system roles
INSERT INTO public.custom_roles (name, description, is_system_role) VALUES
('Administrator', 'Full access to all features', true),
('Dispatcher', 'Standard dispatcher access', true),
('Viewer', 'Read-only access', true);

-- Trigger for updated_at
CREATE TRIGGER update_custom_roles_updated_at
  BEFORE UPDATE ON public.custom_roles
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();