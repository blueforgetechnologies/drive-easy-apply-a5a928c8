import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { LayoutDashboard, Map, Mail, Sparkles, Database, Inbox, DollarSign, HeartPulse } from "lucide-react";
import { UsageMonthFilter } from "@/components/UsageMonthFilter";
import UsageCostsTab from "./UsageCostsTab";
import LovableCloudAITab from "./LovableCloudAITab";
import { useCloudCost } from "@/hooks/useCloudCost";
import { useUserCostSettings } from "@/hooks/useUserCostSettings";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Badge } from "@/components/ui/badge";

// Sub-tab components for each cost category
import { UsageOverviewTab } from "@/components/usage/UsageOverviewTab";
import { UsageMapboxTab } from "@/components/usage/UsageMapboxTab";
import { UsageEmailTab } from "@/components/usage/UsageEmailTab";
import { UsageGmailTab } from "@/components/usage/UsageGmailTab";
import { SystemHealthTab } from "@/components/usage/SystemHealthTab";

const MAPBOX_FREE_TIER = 100000;

const UsageTab = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSubTab, setActiveSubTab] = useState<string>("overview");
  
  // Default to current month
  const currentMonth = new Date().toISOString().slice(0, 7);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentMonth);

  // Get cloud cost and synced calibration settings from database
  const { cloudCost } = useCloudCost();
  const { mapboxCalibratedMultiplier } = useUserCostSettings();

  // Quick query for total cost calculation (all-time)
  const { data: quickStats } = useQuery({
    queryKey: ["usage-quick-stats"],
    queryFn: async () => {
      const [mapboxBilling, emailSent, aiTokens] = await Promise.all([
        supabase.from('mapbox_billing_history').select('total_cost'),
        supabase.from('email_send_tracking').select('*', { count: 'exact', head: true }),
        supabase.from('ai_usage_tracking').select('prompt_tokens, completion_tokens, model'),
      ]);
      
      const mapboxCost = mapboxBilling.data?.reduce((sum, r) => sum + Number(r.total_cost || 0), 0) || 0;
      
      const sentCount = emailSent.count || 0;
      const emailCost = Math.max(0, sentCount - 3000) * 0.001;
      
      let aiCost = 0;
      aiTokens.data?.forEach(row => {
        const isFlash = row.model?.toLowerCase().includes('flash');
        const inputCostPer1M = isFlash ? 0.075 : 1.25;
        const outputCostPer1M = isFlash ? 0.30 : 5.00;
        aiCost += ((row.prompt_tokens || 0) / 1_000_000) * inputCostPer1M;
        aiCost += ((row.completion_tokens || 0) / 1_000_000) * outputCostPer1M;
      });
      
      return { mapboxCost, emailCost, aiCost };
    },
    staleTime: 30000,
  });

  const mapboxCost = mapboxCalibratedMultiplier 
    ? (quickStats?.mapboxCost || 0) * mapboxCalibratedMultiplier 
    : (quickStats?.mapboxCost || 0);
  const totalEstimatedCost = mapboxCost + (quickStats?.emailCost || 0) + (quickStats?.aiCost || 0) + cloudCost;

  useEffect(() => {
    const subtab = searchParams.get("subtab");
    if (subtab && ["overview", "health", "mapbox", "gmail", "email", "ai", "cloud"].includes(subtab)) {
      setActiveSubTab(subtab);
    }
    
    const month = searchParams.get("month");
    if (month && (month === "all" || /^\d{4}-\d{2}$/.test(month))) {
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
    { value: "health", label: "System Health", icon: HeartPulse },
    { value: "mapbox", label: "Mapbox", icon: Map },
    { value: "gmail", label: "Gmail API", icon: Inbox },
    { value: "email", label: "Email", icon: Mail },
    { value: "ai", label: "AI", icon: Sparkles },
    { value: "cloud", label: "Cloud", icon: Database },
  ];

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold">Usage & Costs</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Monitor your service usage and costs
            </p>
          </div>
          <Badge variant="outline" className="h-fit px-3 py-1.5 text-lg font-semibold border-primary/30 bg-primary/5">
            <DollarSign className="h-4 w-4 mr-1" />
            {totalEstimatedCost.toFixed(2)}
          </Badge>
        </div>
        
        <UsageMonthFilter
          selectedMonth={selectedMonth}
          onMonthChange={handleMonthChange}
        />
      </div>

      <div className="flex items-center gap-0 flex-wrap">
        {subTabs.map((tab, index) => {
          const Icon = tab.icon;
          const isFirst = index === 0;
          const isLast = index === subTabs.length - 1;
          return (
            <button
              key={tab.value}
              onClick={() => handleSubTabChange(tab.value)}
              className={`h-[32px] px-4 text-[13px] font-medium border-0 flex items-center gap-2 transition-all ${
                isFirst ? 'rounded-l-full' : ''
              } ${
                isLast ? 'rounded-r-full' : ''
              } ${
                activeSubTab === tab.value 
                  ? 'btn-glossy-primary text-white' 
                  : 'btn-glossy text-gray-700 hover:opacity-90'
              }`}
            >
              <Icon className="h-4 w-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      <Tabs value={activeSubTab} onValueChange={handleSubTabChange} className="space-y-4">

        <TabsContent value="overview" className="mt-4">
          <UsageOverviewTab selectedMonth={selectedMonth} />
        </TabsContent>

        <TabsContent value="health" className="mt-4">
          <SystemHealthTab />
        </TabsContent>

        <TabsContent value="mapbox" className="mt-4">
          <UsageMapboxTab selectedMonth={selectedMonth} />
        </TabsContent>

        <TabsContent value="gmail" className="mt-4">
          <UsageGmailTab selectedMonth={selectedMonth} />
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
