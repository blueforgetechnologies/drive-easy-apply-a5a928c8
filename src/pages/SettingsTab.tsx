import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import UsersTab from "./UsersTab";
import CompanyProfileTab from "./CompanyProfileTab";
import LocationsTab from "./LocationsTab";
import RoleBuilderTab from "./RoleBuilderTab";
import PreferencesTab from "./PreferencesTab";
import IntegrationsTab from "./IntegrationsTab";
import { FeatureAccessManager } from "@/components/FeatureAccessManager";
import { GmailTenantMapping } from "@/components/GmailTenantMapping";
import { WorkerControlPanel } from "@/components/WorkerControlPanel";
import { useTenantContext } from "@/contexts/TenantContext";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { useUserPermissions, PERMISSION_CODES } from "@/hooks/useUserPermissions";

export default function SettingsTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSubTab, setActiveSubTab] = useState<string>("users");
  const { isPlatformAdmin } = useTenantContext();
  const { tenantId, isInternalChannel } = useTenantFilter();
  
  // Load user permissions
  const { 
    hasPermission, 
    isTenantAdmin, 
    isLoading: permissionsLoading 
  } = useUserPermissions();

  // Gmail mapping visible only to platform admins in internal channel
  const canSeeGmailMapping = isPlatformAdmin && isInternalChannel;
  
  // Feature Access: platform admins or tenant admins/owners
  const canManageAccess = isPlatformAdmin || isTenantAdmin;
  
  // Role Builder: platform admins or users with specific permission
  const canSeeRoleBuilder = isPlatformAdmin || isTenantAdmin || hasPermission(PERMISSION_CODES.SETTINGS_ROLE_BUILDER);
  
  // Company: view or edit permissions
  const canSeeCompany = isPlatformAdmin || hasPermission(PERMISSION_CODES.SETTINGS_COMPANY) || hasPermission(PERMISSION_CODES.SETTINGS_COMPANY_VIEW);
  
  // Locations: view or edit permissions
  const canSeeLocations = isPlatformAdmin || hasPermission(PERMISSION_CODES.SETTINGS_LOCATIONS) || hasPermission(PERMISSION_CODES.SETTINGS_LOCATIONS_VIEW);
  
  // Integrations: view or edit permissions
  const canSeeIntegrations = isPlatformAdmin || hasPermission(PERMISSION_CODES.SETTINGS_INTEGRATIONS) || hasPermission(PERMISSION_CODES.SETTINGS_INTEGRATIONS_VIEW);
  
  // Users: platform admins, tenant admins, or users with permission
  const canSeeUsers = isPlatformAdmin || isTenantAdmin || hasPermission("settings_users");
  
  // Preferences: everyone can see their own preferences
  const canSeePreferences = true;

  useEffect(() => {
    const subTab = searchParams.get("subtab");
    const validSubTabs = ["users", "company", "locations", "roles", "preferences", "integrations", "access", "gmail-mapping", "workers"];
    
    if (subTab && validSubTabs.includes(subTab)) {
      // Validate access to the requested subtab
      if (subTab === "users" && !canSeeUsers) {
        setActiveSubTab(getFirstAccessibleTab());
      } else if (subTab === "company" && !canSeeCompany) {
        setActiveSubTab(getFirstAccessibleTab());
      } else if (subTab === "locations" && !canSeeLocations) {
        setActiveSubTab(getFirstAccessibleTab());
      } else if (subTab === "roles" && !canSeeRoleBuilder) {
        setActiveSubTab(getFirstAccessibleTab());
      } else if (subTab === "integrations" && !canSeeIntegrations) {
        setActiveSubTab(getFirstAccessibleTab());
      } else if (subTab === "access" && !canManageAccess) {
        setActiveSubTab(getFirstAccessibleTab());
      } else if (subTab === "gmail-mapping" && !canSeeGmailMapping) {
        setActiveSubTab(getFirstAccessibleTab());
      } else if (subTab === "workers" && !isPlatformAdmin) {
        setActiveSubTab(getFirstAccessibleTab());
      } else {
        setActiveSubTab(subTab);
      }
    } else {
      setActiveSubTab(getFirstAccessibleTab());
    }
  }, [searchParams, canSeeUsers, canSeeCompany, canSeeLocations, canSeeRoleBuilder, canSeeIntegrations, canManageAccess, canSeeGmailMapping, isPlatformAdmin]);

  // Get the first tab the user can access
  const getFirstAccessibleTab = (): string => {
    if (canSeeUsers) return "users";
    if (canSeeCompany) return "company";
    if (canSeeLocations) return "locations";
    if (canSeeRoleBuilder) return "roles";
    if (canSeePreferences) return "preferences";
    if (canSeeIntegrations) return "integrations";
    if (canManageAccess) return "access";
    return "preferences"; // Fallback
  };

  const handleSubTabChange = (value: string) => {
    setActiveSubTab(value);
    setSearchParams({ subtab: value });
  };

  // Don't render tabs while permissions are loading
  if (permissionsLoading) {
    return (
      <div className="space-y-4">
        <div className="mobile-page-header">
          <div>
            <h2 className="mobile-page-title">Settings</h2>
            <p className="text-xs sm:text-sm text-muted-foreground">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Build visible tabs based on permissions
  const visibleTabs: { value: string; label: string }[] = [];
  if (canSeeUsers) visibleTabs.push({ value: "users", label: "Users" });
  if (canSeeCompany) visibleTabs.push({ value: "company", label: "Company" });
  if (canSeeLocations) visibleTabs.push({ value: "locations", label: "Locations" });
  if (canSeeRoleBuilder) visibleTabs.push({ value: "roles", label: "Role Builder" });
  if (canSeePreferences) visibleTabs.push({ value: "preferences", label: "Preferences" });
  if (canSeeIntegrations) visibleTabs.push({ value: "integrations", label: "Integrations" });
  if (canManageAccess) visibleTabs.push({ value: "access", label: "Feature Access" });
  if (canSeeGmailMapping) visibleTabs.push({ value: "gmail-mapping", label: "Gmail Mapping" });
  if (isPlatformAdmin) visibleTabs.push({ value: "workers", label: "Workers" });

  return (
    <div className="space-y-4">
      <div className="mobile-page-header">
        <div>
          <h2 className="mobile-page-title">Settings</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Manage users, company profile, locations, and role permissions
          </p>
        </div>
      </div>

      <Tabs value={activeSubTab} onValueChange={handleSubTabChange}>
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <TabsList className="w-max sm:w-auto">
            {visibleTabs.map(tab => (
              <TabsTrigger key={tab.value} value={tab.value} className="text-xs sm:text-sm">
                {tab.label}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        {canSeeUsers && (
          <TabsContent value="users" className="mt-4">
            <UsersTab />
          </TabsContent>
        )}

        {canSeeCompany && (
          <TabsContent value="company" className="mt-4">
            <CompanyProfileTab />
          </TabsContent>
        )}

        {canSeeLocations && (
          <TabsContent value="locations" className="mt-4">
            <LocationsTab />
          </TabsContent>
        )}

        {canSeeRoleBuilder && (
          <TabsContent value="roles" className="mt-4">
            <RoleBuilderTab />
          </TabsContent>
        )}

        {canSeePreferences && (
          <TabsContent value="preferences" className="mt-4">
            <PreferencesTab />
          </TabsContent>
        )}

        {canSeeIntegrations && (
          <TabsContent value="integrations" className="mt-4">
            <IntegrationsTab />
          </TabsContent>
        )}

        {canManageAccess && (
          <TabsContent value="access" className="mt-4">
            <FeatureAccessManager />
          </TabsContent>
        )}

        {canSeeGmailMapping && (
          <TabsContent value="gmail-mapping" className="mt-4">
            <GmailTenantMapping />
          </TabsContent>
        )}

        {isPlatformAdmin && (
          <TabsContent value="workers" className="mt-4">
            <WorkerControlPanel />
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}