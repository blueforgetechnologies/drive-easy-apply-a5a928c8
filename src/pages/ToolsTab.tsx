import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Ruler } from "lucide-react";
import FreightCalculatorTab from "./FreightCalculatorTab";

export default function ToolsTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSubTab, setActiveSubTab] = useState(searchParams.get('subtab') || 'freight-calc');

  const handleSubTabChange = (value: string) => {
    setActiveSubTab(value);
    const next = new URLSearchParams(searchParams);
    next.set("subtab", value);
    setSearchParams(next);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Tools</h1>
        <p className="text-muted-foreground">Calculators and utilities</p>
      </div>

      <Tabs value={activeSubTab} onValueChange={handleSubTabChange}>
        <TabsList>
          <TabsTrigger value="freight-calc" className="gap-2">
            <Ruler className="h-4 w-4" />
            Freight Calculator
          </TabsTrigger>
        </TabsList>

        <TabsContent value="freight-calc" className="mt-6">
          <FreightCalculatorTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
