import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import UsersTab from "./UsersTab";
import CompanyProfileTab from "./CompanyProfileTab";
import LocationsTab from "./LocationsTab";
import PlaceholderTab from "./PlaceholderTab";
import IntegrationsTab from "./IntegrationsTab";
import UsageCostsTab from "./UsageCostsTab";

export default function SettingsTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSubTab, setActiveSubTab] = useState<string>("users");

  useEffect(() => {
    const subTab = searchParams.get("subtab");
    const validSubTabs = ["users", "company", "locations", "roles", "integrations", "usage"];
    if (subTab && validSubTabs.includes(subTab)) {
      setActiveSubTab(subTab);
    }
  }, [searchParams]);

  const handleSubTabChange = (value: string) => {
    setActiveSubTab(value);
    setSearchParams({ subtab: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Settings</h2>
        <p className="text-sm text-muted-foreground">
          Manage users, company profile, locations, and role permissions
        </p>
      </div>

      <Tabs value={activeSubTab} onValueChange={handleSubTabChange}>
        <TabsList>
          <TabsTrigger value="users">Users</TabsTrigger>
          <TabsTrigger value="company">Company</TabsTrigger>
          <TabsTrigger value="locations">Locations</TabsTrigger>
          <TabsTrigger value="integrations">Integrations</TabsTrigger>
          <TabsTrigger value="usage">Usage & Costs</TabsTrigger>
          <TabsTrigger value="roles">Roles</TabsTrigger>
        </TabsList>

        <TabsContent value="users" className="mt-4">
          <UsersTab />
        </TabsContent>

        <TabsContent value="company" className="mt-4">
          <CompanyProfileTab />
        </TabsContent>

        <TabsContent value="locations" className="mt-4">
          <LocationsTab />
        </TabsContent>

        <TabsContent value="integrations" className="mt-4">
          <IntegrationsTab />
        </TabsContent>

        <TabsContent value="usage" className="mt-4">
          <UsageCostsTab />
        </TabsContent>

        <TabsContent value="roles" className="mt-4">
          <PlaceholderTab 
            title="Roles & Permissions"
            description="Manage user roles and permissions for system access control"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
