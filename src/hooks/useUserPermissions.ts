import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useTenantContext } from "@/contexts/TenantContext";

interface UserPermissionsResult {
  permissions: Set<string>;
  hasPermission: (code: string) => boolean;
  hasAnyPermission: (codes: string[]) => boolean;
  hasAllPermissions: (codes: string[]) => boolean;
  isLoading: boolean;
  isAdmin: boolean; // Has admin app_role in user_roles
  isTenantAdmin: boolean; // Is admin/owner in tenant_users for current tenant
  hasCustomRole: boolean; // Has at least one custom role assigned
  refresh: () => Promise<void>;
}

/**
 * Hook to load and check the current user's effective permissions.
 * 
 * Permissions are derived from:
 * 1. user_custom_roles -> role_permissions -> permissions
 * 
 * Special cases:
 * - Platform admins bypass all permission checks
 * - Tenant admins/owners have elevated access to settings
 * - Users with admin app_role get admin-level UI access
 * 
 * STRICT ENFORCEMENT:
 * - No custom role assigned = no permissions = see nothing
 * - Permissions must be explicitly granted through custom roles
 */
export function useUserPermissions(): UserPermissionsResult {
  const { isPlatformAdmin, effectiveTenant, loading: tenantLoading } = useTenantContext();
  const [permissions, setPermissions] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [isTenantAdmin, setIsTenantAdmin] = useState(false);
  const [hasCustomRole, setHasCustomRole] = useState(false);

  const loadPermissions = useCallback(async () => {
    if (tenantLoading) return;
    
    setIsLoading(true);
    
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setPermissions(new Set());
        setIsAdmin(false);
        setIsTenantAdmin(false);
        setHasCustomRole(false);
        setIsLoading(false);
        return;
      }

      // Platform admins have all permissions
      if (isPlatformAdmin) {
        // Load ALL permission codes for platform admins
        const { data: allPerms } = await supabase
          .from("permissions")
          .select("code");
        
        const allCodes = new Set((allPerms || []).map(p => p.code));
        setPermissions(allCodes);
        setIsAdmin(true);
        setIsTenantAdmin(true);
        setHasCustomRole(true);
        setIsLoading(false);
        return;
      }

      // Check app_role (user_roles table) for admin status
      const { data: appRoles } = await supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", user.id);
      
      const hasAdminRole = (appRoles || []).some(r => r.role === "admin");
      setIsAdmin(hasAdminRole);

      // Check tenant_users for tenant-level admin status
      if (effectiveTenant?.id) {
        const { data: tenantUser } = await supabase
          .from("tenant_users")
          .select("role")
          .eq("tenant_id", effectiveTenant.id)
          .eq("user_id", user.id)
          .eq("is_active", true)
          .maybeSingle();
        
        setIsTenantAdmin(tenantUser?.role === "admin" || tenantUser?.role === "owner");
      } else {
        setIsTenantAdmin(false);
      }

      // Load permissions from custom roles
      // Get user's custom role assignments
      const { data: userRoles } = await supabase
        .from("user_custom_roles")
        .select("role_id")
        .eq("user_id", user.id);

      if (!userRoles || userRoles.length === 0) {
        // No custom roles = no permissions (STRICT)
        setPermissions(new Set());
        setHasCustomRole(false);
        setIsLoading(false);
        return;
      }

      setHasCustomRole(true);
      const roleIds = userRoles.map(r => r.role_id);

      // Get permissions for these roles
      const { data: rolePerms } = await supabase
        .from("role_permissions")
        .select("permission_id")
        .in("role_id", roleIds);

      if (!rolePerms || rolePerms.length === 0) {
        setPermissions(new Set());
        setIsLoading(false);
        return;
      }

      const permissionIds = rolePerms.map(rp => rp.permission_id);

      // Get permission codes
      const { data: permCodes } = await supabase
        .from("permissions")
        .select("code")
        .in("id", permissionIds);

      const codes = new Set((permCodes || []).map(p => p.code));
      setPermissions(codes);
      setIsLoading(false);
    } catch (error) {
      console.error("[useUserPermissions] Error loading permissions:", error);
      setPermissions(new Set());
      setIsLoading(false);
    }
  }, [isPlatformAdmin, effectiveTenant?.id, tenantLoading]);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  const hasPermission = useCallback((code: string): boolean => {
    if (isPlatformAdmin) return true;
    return permissions.has(code);
  }, [permissions, isPlatformAdmin]);

  const hasAnyPermission = useCallback((codes: string[]): boolean => {
    if (isPlatformAdmin) return true;
    return codes.some(code => permissions.has(code));
  }, [permissions, isPlatformAdmin]);

  const hasAllPermissions = useCallback((codes: string[]): boolean => {
    if (isPlatformAdmin) return true;
    return codes.every(code => permissions.has(code));
  }, [permissions, isPlatformAdmin]);

  return {
    permissions,
    hasPermission,
    hasAnyPermission,
    hasAllPermissions,
    isLoading,
    isAdmin,
    isTenantAdmin,
    hasCustomRole,
    refresh: loadPermissions,
  };
}

/**
 * Permission codes for common operations.
 * Use these constants instead of magic strings.
 */
export const PERMISSION_CODES = {
  // Tabs
  TAB_MAP: "tab_map",
  TAB_LOAD_HUNTER: "tab_load_hunter",
  TAB_LOADS: "tab_loads",
  TAB_FLEET_FINANCIALS: "tab_fleet_financials",
  TAB_CARRIER_DASHBOARD: "tab_carrier_dashboard",
  TAB_BUSINESS: "tab_business",
  TAB_ACCOUNTING: "tab_accounting",
  TAB_ANALYTICS: "tab_analytics",
  TAB_MAINTENANCE: "tab_maintenance",
  TAB_DEVELOPMENT: "tab_development",
  TAB_CHANGELOG: "tab_changelog",
  TAB_SETTINGS: "tab_settings",
  
  // Settings subtabs
  SETTINGS_USERS: "settings_users",
  SETTINGS_COMPANY: "company_edit",
  SETTINGS_COMPANY_VIEW: "company_view",
  SETTINGS_LOCATIONS: "locations_edit",
  SETTINGS_LOCATIONS_VIEW: "locations_view",
  SETTINGS_ROLE_BUILDER: "tab_role_builder",
  SETTINGS_INTEGRATIONS: "integrations_edit",
  SETTINGS_INTEGRATIONS_VIEW: "integrations_view",
  
  // Inspector/Admin (platform admin only)
  TAB_INSPECTOR: "tab_inspector",
  TAB_PLATFORM_ADMIN: "tab_platform_admin",
  TAB_ROLLOUTS: "tab_rollouts",
  TAB_USAGE: "tab_usage",
} as const;
