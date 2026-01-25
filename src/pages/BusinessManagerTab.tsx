import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
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

  // Tab configuration with glossy styling
  const tabs = [
    { 
      key: "assets", 
      label: "Assets", 
      alertCount: assetAlertCount,
      activeClass: "btn-glossy-primary", 
      badgeClass: "badge-inset-primary", 
      softBadgeClass: "badge-inset-soft-blue",
      alertBadgeClass: "badge-inset-danger"
    },
    { 
      key: "carriers", 
      label: "Carriers", 
      alertCount: carrierAlertCount,
      activeClass: "btn-glossy-primary", 
      badgeClass: "badge-inset-primary", 
      softBadgeClass: "badge-inset-soft-blue",
      alertBadgeClass: "badge-inset-danger"
    },
    { 
      key: "payees", 
      label: "Payees", 
      alertCount: 0,
      activeClass: "btn-glossy-primary", 
      badgeClass: "badge-inset-primary", 
      softBadgeClass: "badge-inset-soft-blue",
      alertBadgeClass: "badge-inset-danger"
    },
    { 
      key: "drivers", 
      label: "Drivers", 
      alertCount: 0,
      activeClass: "btn-glossy-primary", 
      badgeClass: "badge-inset-primary", 
      softBadgeClass: "badge-inset-soft-blue",
      alertBadgeClass: "badge-inset-danger"
    },
    { 
      key: "dispatchers", 
      label: "Dispatchers", 
      alertCount: 0,
      activeClass: "btn-glossy-primary", 
      badgeClass: "badge-inset-primary", 
      softBadgeClass: "badge-inset-soft-blue",
      alertBadgeClass: "badge-inset-danger"
    },
    { 
      key: "customers", 
      label: "Customers", 
      alertCount: 0,
      activeClass: "btn-glossy-primary", 
      badgeClass: "badge-inset-primary", 
      softBadgeClass: "badge-inset-soft-blue",
      alertBadgeClass: "badge-inset-danger"
    },
  ];

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

      {/* Glossy Tab Navigation - matching Loads filter style */}
      <div className="flex items-center gap-0 overflow-x-auto pb-1">
        {tabs.map((tab) => (
          <Button
            key={tab.key}
            variant="ghost"
            size="sm"
            onClick={() => handleSubTabChange(tab.key)}
            className={`h-[30px] px-3 text-[13px] font-medium gap-1.5 rounded-none first:rounded-l-full last:rounded-r-full border-0 ${
              activeSubTab === tab.key 
                ? `${tab.activeClass} text-white` 
                : 'btn-glossy text-gray-700'
            }`}
          >
            {tab.label}
            {tab.alertCount > 0 && (
              <span className={`${activeSubTab === tab.key ? 'badge-inset-danger' : 'badge-inset-soft-red'} text-[10px] h-5`}>
                {tab.alertCount}
              </span>
            )}
          </Button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="mt-4">
        {activeSubTab === "assets" && <VehiclesTab />}
        {activeSubTab === "carriers" && <CarriersTab />}
        {activeSubTab === "payees" && <PayeesTab />}
        {activeSubTab === "drivers" && <DriversTab />}
        {activeSubTab === "dispatchers" && <DispatchersTab />}
        {activeSubTab === "customers" && <CustomersTab />}
      </div>
    </div>
  );
}