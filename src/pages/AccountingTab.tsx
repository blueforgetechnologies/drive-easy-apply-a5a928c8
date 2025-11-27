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
    <div className="space-y-4">
      <div>
        <h2 className="text-xl font-bold">Accounting</h2>
        <p className="text-sm text-muted-foreground">
          Manage invoices, settlements, and audit logs
        </p>
      </div>

      <Tabs value={activeSubTab} onValueChange={handleSubTabChange}>
        <TabsList>
          <TabsTrigger value="invoices">Invoices</TabsTrigger>
          <TabsTrigger value="settlements">Settlements</TabsTrigger>
          <TabsTrigger value="audit">Audit Logs</TabsTrigger>
        </TabsList>

        <TabsContent value="invoices" className="mt-4">
          <InvoicesTab />
        </TabsContent>

        <TabsContent value="settlements" className="mt-4">
          <SettlementsTab />
        </TabsContent>

        <TabsContent value="audit" className="mt-4">
          <AuditLogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
