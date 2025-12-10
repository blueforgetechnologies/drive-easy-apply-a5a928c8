import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import LoadAnalyticsTab from "./LoadAnalyticsTab";
import FreightCalculatorTab from "./FreightCalculatorTab";

export default function ToolsTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSubTab, setActiveSubTab] = useState("analytics");

  useEffect(() => {
    const subtab = searchParams.get("subtab");
    if (subtab && ["analytics", "freight-calc"].includes(subtab)) {
      setActiveSubTab(subtab);
    }
  }, [searchParams]);

  const handleSubTabChange = (value: string) => {
    setActiveSubTab(value);
    setSearchParams({ subtab: value });
  };

  return (
    <div className="space-y-4 p-4">
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-bold">Tools</h1>
        <p className="text-muted-foreground text-sm">Analytics and calculators</p>
      </div>

      <Tabs value={activeSubTab} onValueChange={handleSubTabChange}>
        <TabsList className="h-9">
          <TabsTrigger value="analytics" className="text-xs">Analytics</TabsTrigger>
          <TabsTrigger value="freight-calc" className="text-xs">Freight Calculator</TabsTrigger>
        </TabsList>

        <TabsContent value="analytics" className="mt-4">
          <LoadAnalyticsTab />
        </TabsContent>

        <TabsContent value="freight-calc" className="mt-4">
          <FreightCalculatorTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
