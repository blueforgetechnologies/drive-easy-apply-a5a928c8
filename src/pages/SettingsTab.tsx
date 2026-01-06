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
import { useTenantContext } from "@/contexts/TenantContext";
import { useTenantFilter } from "@/hooks/useTenantFilter";
import { supabase } from "@/integrations/supabase/client";

export default function SettingsTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSubTab, setActiveSubTab] = useState<string>("users");
  const { isPlatformAdmin } = useTenantContext();
  const { tenantId, isInternalChannel } = useTenantFilter();
  const [canManageAccess, setCanManageAccess] = useState(false);

  // Gmail mapping visible only to platform admins in internal channel
  const canSeeGmailMapping = isPlatformAdmin && isInternalChannel;

  // Check if user can see Feature Access tab
  useEffect(() => {
    const checkPermission = async () => {
      if (isPlatformAdmin) {
        setCanManageAccess(true);
        return;
      }

      if (!tenantId) {
        setCanManageAccess(false);
        return;
      }

      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        setCanManageAccess(false);
        return;
      }

      // Check if user is admin/owner in this tenant
      const { data } = await supabase
        .from("tenant_users")
        .select("role")
        .eq("tenant_id", tenantId)
        .eq("user_id", user.id)
        .eq("is_active", true)
        .maybeSingle();

      setCanManageAccess(data?.role === "admin" || data?.role === "owner");
    };

    checkPermission();
  }, [isPlatformAdmin, tenantId]);

  useEffect(() => {
    const subTab = searchParams.get("subtab");
    const validSubTabs = ["users", "company", "locations", "roles", "preferences", "integrations", "access", "gmail-mapping"];
    if (subTab && validSubTabs.includes(subTab)) {
      // Only allow access subtab if user can manage it
      if (subTab === "access" && !canManageAccess) {
        setActiveSubTab("users");
      } else if (subTab === "gmail-mapping" && !canSeeGmailMapping) {
        setActiveSubTab("users");
      } else {
        setActiveSubTab(subTab);
      }
    }
  }, [searchParams, canManageAccess, canSeeGmailMapping]);

  const handleSubTabChange = (value: string) => {
    setActiveSubTab(value);
    setSearchParams({ subtab: value });
  };

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
            <TabsTrigger value="users" className="text-xs sm:text-sm">Users</TabsTrigger>
            <TabsTrigger value="company" className="text-xs sm:text-sm">Company</TabsTrigger>
            <TabsTrigger value="locations" className="text-xs sm:text-sm">Locations</TabsTrigger>
            <TabsTrigger value="roles" className="text-xs sm:text-sm">Role Builder</TabsTrigger>
            <TabsTrigger value="preferences" className="text-xs sm:text-sm">Preferences</TabsTrigger>
            <TabsTrigger value="integrations" className="text-xs sm:text-sm">Integrations</TabsTrigger>
            {canManageAccess && (
              <TabsTrigger value="access" className="text-xs sm:text-sm">Feature Access</TabsTrigger>
            )}
            {canSeeGmailMapping && (
              <TabsTrigger value="gmail-mapping" className="text-xs sm:text-sm">Gmail Mapping</TabsTrigger>
            )}
          </TabsList>
        </div>

        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>

        <TabsContent value="company" className="mt-4">
          <CompanyProfileTab />
        </TabsContent>

        <TabsContent value="locations" className="mt-4">
          <LocationsTab />
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          <RoleBuilderTab />
        </TabsContent>

        <TabsContent value="preferences" className="mt-4">
          <PreferencesTab />
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <IntegrationsTab />
        </TabsContent>

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
      </Tabs>
    </div>
  );
}
