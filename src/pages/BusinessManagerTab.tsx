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
  const [assetAlertCount, setAssetAlertCount] = useState<number>(0);
  const [carrierAlertCount, setCarrierAlertCount] = useState<number>(0);

  useEffect(() => {
    const subTab = searchParams.get("subtab");
    const validSubTabs = ["assets", "carriers", "payees", "drivers", "dispatchers", "customers"];
    if (subTab && validSubTabs.includes(subTab)) {
      setActiveSubTab(subTab);
    }
    loadAlerts();
  }, [searchParams]);

  const loadAlerts = async () => {
    // Load vehicle alerts
    const { data: vehicles } = await supabase
      .from("vehicles")
      .select("oil_change_remaining, insurance_expiry, registration_expiry")
      .eq("status", "active");

    let vehicleCount = 0;
    if (vehicles) {
      const today = new Date();
      today.setHours(0, 0, 0, 0);

      vehicles.forEach(vehicle => {
        // Oil change due or overdue
        if (vehicle.oil_change_remaining !== null && vehicle.oil_change_remaining <= 0) {
          vehicleCount++;
        }
        // Insurance expired
        if (vehicle.insurance_expiry) {
          const insuranceDate = new Date(vehicle.insurance_expiry);
          insuranceDate.setHours(0, 0, 0, 0);
          if (insuranceDate < today) {
            vehicleCount++;
          }
        }
        // Registration expired
        if (vehicle.registration_expiry) {
          const registrationDate = new Date(vehicle.registration_expiry);
          registrationDate.setHours(0, 0, 0, 0);
          if (registrationDate < today) {
            vehicleCount++;
          }
        }
      });
    }
    setAssetAlertCount(vehicleCount);

    // Load carrier alerts (NOT AUTHORIZED status for active/pending carriers)
    const { data: carriers } = await supabase
      .from("carriers")
      .select("safer_status, status")
      .in("status", ["active", "pending"]);

    let carrierCount = 0;
    if (carriers) {
      carrierCount = carriers.filter(
        (carrier) => carrier.safer_status?.toUpperCase().includes("NOT AUTHORIZED")
      ).length;
    }
    setCarrierAlertCount(carrierCount);
  };

  const handleSubTabChange = (value: string) => {
    setActiveSubTab(value);
    setSearchParams({ subtab: value });
  };

  return (
    <div className="space-y-4">
      <div className="mobile-page-header">
        <div>
          <h2 className="mobile-page-title">Business Manager</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Manage assets, carriers, payees, drivers, dispatchers, and customers
          </p>
        </div>
      </div>

      <Tabs value={activeSubTab} onValueChange={handleSubTabChange}>
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <TabsList className="w-max sm:w-auto">
            <TabsTrigger value="assets" className="relative text-xs sm:text-sm">
              Assets
              {assetAlertCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 text-[9px] sm:text-[10px] font-bold text-white bg-red-500 rounded-full">
                  {assetAlertCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="carriers" className="relative text-xs sm:text-sm">
              Carriers
              {carrierAlertCount > 0 && (
                <span className="ml-1 inline-flex items-center justify-center w-4 h-4 sm:w-5 sm:h-5 text-[9px] sm:text-[10px] font-bold text-white bg-red-500 rounded-full">
                  {carrierAlertCount}
                </span>
              )}
            </TabsTrigger>
            <TabsTrigger value="payees" className="text-xs sm:text-sm">Payees</TabsTrigger>
            <TabsTrigger value="drivers" className="text-xs sm:text-sm">Drivers</TabsTrigger>
            <TabsTrigger value="dispatchers" className="text-xs sm:text-sm">Dispatchers</TabsTrigger>
            <TabsTrigger value="customers" className="text-xs sm:text-sm">Customers</TabsTrigger>
          </TabsList>
        </div>

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