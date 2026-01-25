import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { useTenantAlertCounts } from "@/hooks/useTenantAlertCounts";
import { useBusinessManagerCounts } from "@/hooks/useBusinessManagerCounts";
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
  
  // Use tenant-scoped entity counts
  const counts = useBusinessManagerCounts();

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

  // Tab configuration with glossy styling and counts
  const tabs = [
    { 
      key: "assets", 
      label: "Assets", 
      count: counts.assets,
      alertCount: assetAlertCount,
      activeClass: "btn-glossy-primary", 
      badgeClass: "badge-inset-primary", 
      softBadgeClass: "badge-inset-soft-blue",
    },
    { 
      key: "carriers", 
      label: "Carriers", 
      count: counts.carriers,
      alertCount: carrierAlertCount,
      activeClass: "btn-glossy-primary", 
      badgeClass: "badge-inset-primary", 
      softBadgeClass: "badge-inset-soft-blue",
    },
    { 
      key: "payees", 
      label: "Payees", 
      count: counts.payees,
      alertCount: 0,
      activeClass: "btn-glossy-primary", 
      badgeClass: "badge-inset-primary", 
      softBadgeClass: "badge-inset-soft-blue",
    },
    { 
      key: "drivers", 
      label: "Drivers", 
      count: counts.drivers,
      alertCount: 0,
      activeClass: "btn-glossy-primary", 
      badgeClass: "badge-inset-primary", 
      softBadgeClass: "badge-inset-soft-blue",
    },
    { 
      key: "dispatchers", 
      label: "Dispatchers", 
      count: counts.dispatchers,
      alertCount: 0,
      activeClass: "btn-glossy-primary", 
      badgeClass: "badge-inset-primary", 
      softBadgeClass: "badge-inset-soft-blue",
    },
    { 
      key: "customers", 
      label: "Customers", 
      count: counts.customers,
      alertCount: 0,
      activeClass: "btn-glossy-primary", 
      badgeClass: "badge-inset-primary", 
      softBadgeClass: "badge-inset-soft-blue",
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
            {/* Entity count badge */}
            <span className={`${activeSubTab === tab.key ? tab.badgeClass : tab.softBadgeClass} text-[10px] h-5`}>
              {tab.count}
            </span>
            {/* Alert count badge (red) - only if there are alerts */}
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
