import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import VehiclesTab from "./VehiclesTab";
import CarriersTab from "./CarriersTab";
import PayeesTab from "./PayeesTab";
import DriversTab from "./DriversTab";
import DispatchersTab from "./DispatchersTab";
import CustomersTab from "./CustomersTab";
import PlaceholderTab from "./PlaceholderTab";

export default function BusinessManagerTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSubTab, setActiveSubTab] = useState<string>("assets");

  useEffect(() => {
    const subTab = searchParams.get("subtab");
    const validSubTabs = ["assets", "carriers", "payees", "drivers", "dispatchers", "customers", "roles"];
    if (subTab && validSubTabs.includes(subTab)) {
      setActiveSubTab(subTab);
    }
  }, [searchParams]);

  const handleSubTabChange = (value: string) => {
    setActiveSubTab(value);
    setSearchParams({ subtab: value });
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Business Manager</h2>
        <p className="text-muted-foreground">
          Manage assets, carriers, payees, drivers, dispatchers, customers, and permissions
        </p>
      </div>

      <Tabs value={activeSubTab} onValueChange={handleSubTabChange}>
        <TabsList>
          <TabsTrigger value="assets">Assets</TabsTrigger>
          <TabsTrigger value="carriers">Carriers</TabsTrigger>
          <TabsTrigger value="payees">Payees</TabsTrigger>
          <TabsTrigger value="drivers">Drivers</TabsTrigger>
          <TabsTrigger value="dispatchers">Dispatchers</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
          <TabsTrigger value="roles">Roles/Permission</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="mt-6">
          <VehiclesTab />
        </TabsContent>

        <TabsContent value="carriers" className="mt-6">
          <CarriersTab />
        </TabsContent>

        <TabsContent value="payees" className="mt-6">
          <PayeesTab />
        </TabsContent>

        <TabsContent value="drivers" className="mt-6">
          <DriversTab />
        </TabsContent>

        <TabsContent value="dispatchers" className="mt-6">
          <DispatchersTab />
        </TabsContent>

        <TabsContent value="customers" className="mt-6">
          <CustomersTab />
        </TabsContent>

        <TabsContent value="roles" className="mt-6">
          <PlaceholderTab 
            title="Roles & Permissions"
            description="Manage user roles and permissions for system access control"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
