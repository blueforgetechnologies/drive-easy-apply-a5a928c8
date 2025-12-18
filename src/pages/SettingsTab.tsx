import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import UsersTab from "./UsersTab";
import CompanyProfileTab from "./CompanyProfileTab";
import LocationsTab from "./LocationsTab";
import RoleBuilderTab from "./RoleBuilderTab";

export default function SettingsTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSubTab, setActiveSubTab] = useState<string>("users");

  useEffect(() => {
    const subTab = searchParams.get("subtab");
    const validSubTabs = ["users", "company", "locations", "roles"];
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
            <TabsTrigger value="roles" className="text-xs sm:text-sm">Roles</TabsTrigger>
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
      </Tabs>
    </div>
  );
}