import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, Map, Mail, Sparkles, Database } from "lucide-react";
import { UsageMonthFilter } from "@/components/UsageMonthFilter";
import UsageCostsTab from "./UsageCostsTab";
import LovableCloudAITab from "./LovableCloudAITab";

// Sub-tab components for each cost category
import { UsageOverviewTab } from "@/components/usage/UsageOverviewTab";
import { UsageMapboxTab } from "@/components/usage/UsageMapboxTab";
import { UsageEmailTab } from "@/components/usage/UsageEmailTab";

const UsageTab = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSubTab, setActiveSubTab] = useState<string>("overview");
  
  // Default to current month
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);

  useEffect(() => {
    const subtab = searchParams.get("subtab");
    if (subtab && ["overview", "mapbox", "email", "ai", "cloud"].includes(subtab)) {
      setActiveSubTab(subtab);
    }
    
    const month = searchParams.get("month");
    if (month && /^\d{4}-\d{2}$/.test(month)) {
      setSelectedMonth(month);
    }
  }, [searchParams]);

  const handleSubTabChange = (value: string) => {
    setActiveSubTab(value);
    const newParams = new URLSearchParams(searchParams);
    newParams.set("subtab", value);
    setSearchParams(newParams);
  };

  const handleMonthChange = (month: string) => {
    setSelectedMonth(month);
    const newParams = new URLSearchParams(searchParams);
    newParams.set("month", month);
    setSearchParams(newParams);
  };

  const subTabs = [
    { value: "overview", label: "Overview", icon: LayoutDashboard },
    { value: "mapbox", label: "Mapbox", icon: Map },
    { value: "email", label: "Email", icon: Mail },
    { value: "ai", label: "AI", icon: Sparkles },
    { value: "cloud", label: "Cloud", icon: Database },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Usage & Costs</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor your service usage and costs
          </p>
        </div>
        
        <UsageMonthFilter
          selectedMonth={selectedMonth}
          onMonthChange={handleMonthChange}
        />
      </div>

      <Tabs value={activeSubTab} onValueChange={handleSubTabChange} className="space-y-4">
        <TabsList className="h-auto flex-wrap justify-start gap-1 p-1 bg-muted/50">
          {subTabs.map((tab) => {
            const Icon = tab.icon;
            return (
              <TabsTrigger
                key={tab.value}
                value={tab.value}
                className="gap-2 data-[state=active]:bg-background"
              >
                <Icon className="h-4 w-4" />
                {tab.label}
              </TabsTrigger>
            );
          })}
        </TabsList>

        <TabsContent value="overview" className="mt-4">
          <UsageOverviewTab selectedMonth={selectedMonth} />
        </TabsContent>

        <TabsContent value="mapbox" className="mt-4">
          <UsageMapboxTab selectedMonth={selectedMonth} />
        </TabsContent>

        <TabsContent value="email" className="mt-4">
          <UsageEmailTab selectedMonth={selectedMonth} />
        </TabsContent>

        <TabsContent value="ai" className="mt-4">
          <LovableCloudAITab />
        </TabsContent>

        <TabsContent value="cloud" className="mt-4">
          <LovableCloudAITab />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default UsageTab;
