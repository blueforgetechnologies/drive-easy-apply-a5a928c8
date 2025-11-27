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
    <div className="space-y-3">
      <div>
        <h2 className="text-lg font-bold">Business Manager</h2>
        <p className="text-xs text-muted-foreground">
          Manage assets, carriers, payees, drivers, dispatchers, customers, and permissions
        </p>
      </div>

      <Tabs value={activeSubTab} onValueChange={handleSubTabChange}>
        <TabsList className="h-7">
          <TabsTrigger value="assets" className="text-xs px-2">Assets</TabsTrigger>
          <TabsTrigger value="carriers" className="text-xs px-2">Carriers</TabsTrigger>
          <TabsTrigger value="payees" className="text-xs px-2">Payees</TabsTrigger>
          <TabsTrigger value="drivers" className="text-xs px-2">Drivers</TabsTrigger>
          <TabsTrigger value="dispatchers" className="text-xs px-2">Dispatchers</TabsTrigger>
          <TabsTrigger value="customers" className="text-xs px-2">Customers</TabsTrigger>
          <TabsTrigger value="roles" className="text-xs px-2">Roles</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="mt-3">
          <VehiclesTab />
        </TabsContent>

        <TabsContent value="carriers" className="mt-3">
          <CarriersTab />
        </TabsContent>

        <TabsContent value="payees" className="mt-3">
          <PayeesTab />
        </TabsContent>

        <TabsContent value="drivers" className="mt-3">
          <DriversTab />
        </TabsContent>

        <TabsContent value="dispatchers" className="mt-3">
          <DispatchersTab />
        </TabsContent>

        <TabsContent value="customers" className="mt-3">
          <CustomersTab />
        </TabsContent>

        <TabsContent value="roles" className="mt-3">
          <PlaceholderTab 
            title="Roles & Permissions"
            description="Manage user roles and permissions for system access control"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
}
