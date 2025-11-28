import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { supabase } from "@/integrations/supabase/client";
import VehiclesTab from "./VehiclesTab";
import CarriersTab from "./CarriersTab";
import PayeesTab from "./PayeesTab";
import DriversTab from "./DriversTab";
import DispatchersTab from "./DispatchersTab";
import CustomersTab from "./CustomersTab";

export default function BusinessManagerTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSubTab, setActiveSubTab] = useState<string>("assets");
  const [alertCount, setAlertCount] = useState<number>(0);

  useEffect(() => {
    const subTab = searchParams.get("subtab");
    const validSubTabs = ["assets", "carriers", "payees", "drivers", "dispatchers", "customers"];
    if (subTab && validSubTabs.includes(subTab)) {
      setActiveSubTab(subTab);
    }
    loadAlerts();
  }, [searchParams]);

  const loadAlerts = async () => {
    const { data: vehicles } = await supabase
      .from("vehicles")
      .select("oil_change_remaining, insurance_expiry, registration_expiry")
      .eq("status", "active");

    if (!vehicles) {
      setAlertCount(0);
      return;
    }

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    let count = 0;
    vehicles.forEach(vehicle => {
      // Oil change due or overdue
      if (vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining <= 0) {
        count++;
      }
      // Insurance expired
      if (vehicle.insurance_expiry) {
        const insuranceDate = new Date(vehicle.insurance_expiry);
        insuranceDate.setHours(0, 0, 0, 0);
        if (insuranceDate < today) {
          count++;
        }
      }
      // Registration expired
      if (vehicle.registration_expiry) {
        const registrationDate = new Date(vehicle.registration_expiry);
        registrationDate.setHours(0, 0, 0, 0);
        if (registrationDate < today) {
          count++;
        }
      }
    });

    setAlertCount(count);
  };

  const handleSubTabChange = (value: string) => {
    setActiveSubTab(value);
    setSearchParams({ subtab: value });
  };

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Business Manager</h2>
        <p className="text-sm text-muted-foreground">
          Manage assets, carriers, payees, drivers, dispatchers, and customers
        </p>
      </div>

      <Tabs value={activeSubTab} onValueChange={handleSubTabChange}>
        <TabsList>
          <TabsTrigger value="assets" className="relative">
            Assets
            {alertCount > 0 && (
              <span className="ml-1.5 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold text-white bg-red-500 rounded-full">
                {alertCount}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="carriers">Carriers</TabsTrigger>
          <TabsTrigger value="payees">Payees</TabsTrigger>
          <TabsTrigger value="drivers">Drivers</TabsTrigger>
          <TabsTrigger value="dispatchers">Dispatchers</TabsTrigger>
          <TabsTrigger value="customers">Customers</TabsTrigger>
        </TabsList>

        <TabsContent value="assets" className="mt-4">
          <VehiclesTab />
        </TabsContent>

        <TabsContent value="carriers" className="mt-4">
          <CarriersTab />
        </TabsContent>

        <TabsContent value="payees" className="mt-4">
          <PayeesTab />
        </TabsContent>

        <TabsContent value="drivers" className="mt-4">
          <DriversTab />
        </TabsContent>

        <TabsContent value="dispatchers" className="mt-4">
          <DispatchersTab />
        </TabsContent>

        <TabsContent value="customers" className="mt-4">
          <CustomersTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
