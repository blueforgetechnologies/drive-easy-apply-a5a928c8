import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import InvoicesTab from "./InvoicesTab";
import SettlementsTab from "./SettlementsTab";
import AuditLogsTab from "./AuditLogsTab";

export default function AccountingTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSubTab, setActiveSubTab] = useState<string>("invoices");

  useEffect(() => {
    const subTab = searchParams.get("subtab");
    if (subTab && ["invoices", "settlements", "audit"].includes(subTab)) {
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
        <h2 className="text-lg font-bold">Accounting</h2>
        <p className="text-xs text-muted-foreground">
          Manage invoices, settlements, and audit logs
        </p>
      </div>

      <Tabs value={activeSubTab} onValueChange={handleSubTabChange}>
        <TabsList className="h-7">
          <TabsTrigger value="invoices" className="text-xs px-2">Invoices</TabsTrigger>
          <TabsTrigger value="settlements" className="text-xs px-2">Settlements</TabsTrigger>
          <TabsTrigger value="audit" className="text-xs px-2">Audit Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-3">
          <InvoicesTab />
        </TabsContent>

        <TabsContent value="settlements" className="mt-3">
          <SettlementsTab />
        </TabsContent>

        <TabsContent value="audit" className="mt-3">
          <AuditLogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
