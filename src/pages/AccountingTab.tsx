import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import InvoicesTab from "./InvoicesTab";
import SettlementsTab from "./SettlementsTab";
import AuditLogsTab from "./AuditLogsTab";
import ReadyForAuditTab from "./ReadyForAuditTab";

export default function AccountingTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSubTab, setActiveSubTab] = useState<string>("ready_for_audit");

  useEffect(() => {
    const subTab = searchParams.get("subtab");
    if (subTab && ["ready_for_audit", "invoices", "settlements", "audit"].includes(subTab)) {
      setActiveSubTab(subTab);
    }
  }, [searchParams]);

  const handleSubTabChange = (value: string) => {
    setActiveSubTab(value);
    setSearchParams({ subtab: value });
  };

  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-xl font-bold">Accounting</h2>
        <p className="text-xs text-muted-foreground">
          Manage invoices, settlements, and audit logs
        </p>
      </div>

      <Tabs value={activeSubTab} onValueChange={handleSubTabChange} defaultValue="ready_for_audit">
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <TabsList className="w-max sm:w-auto h-8">
            <TabsTrigger value="ready_for_audit" className="text-xs h-7 px-3">Ready for Audit</TabsTrigger>
            <TabsTrigger value="invoices" className="text-xs h-7 px-3">Invoices</TabsTrigger>
            <TabsTrigger value="settlements" className="text-xs h-7 px-3">Settlements</TabsTrigger>
            <TabsTrigger value="audit" className="text-xs h-7 px-3">Audit Logs</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="ready_for_audit" className="mt-2">
          <ReadyForAuditTab />
        </TabsContent>

        <TabsContent value="invoices" className="mt-2">
          <InvoicesTab />
        </TabsContent>

        <TabsContent value="settlements" className="mt-2">
          <SettlementsTab />
        </TabsContent>

        <TabsContent value="audit" className="mt-2">
          <AuditLogsTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}