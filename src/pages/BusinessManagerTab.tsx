import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useTenantAlertCounts } from "@/hooks/useTenantAlertCounts";
import VehiclesTab from "./VehiclesTab";
import CarriersTab from "./CarriersTab";
import PayeesTab from "./PayeesTab";
import DriversTab from "./DriversTab";
import DispatchersTab from "./DispatchersTab";
import CustomersTab from "./CustomersTab";

export default function BusinessManagerTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSubTab, setActiveSubTab] = useState<string>("assets");
  
  // Use tenant-scoped alert counts hook
  const { vehicleAlerts: assetAlertCount, carrierAlerts: carrierAlertCount } = useTenantAlertCounts();

  useEffect(() => {
    const subTab = searchParams.get("subtab");
    const validSubTabs = ["assets", "carriers", "payees", "drivers", "dispatchers", "customers"];
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