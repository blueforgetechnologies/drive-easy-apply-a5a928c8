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
    <div className="space-y-4">
      <div className="mobile-page-header">
        <div>
          <h2 className="mobile-page-title">Accounting</h2>
          <p className="text-xs sm:text-sm text-muted-foreground">
            Manage invoices, settlements, and audit logs
          </p>
        </div>
      </div>

      <Tabs value={activeSubTab} onValueChange={handleSubTabChange} defaultValue="ready_for_audit">
        <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
          <TabsList className="w-max sm:w-auto">
            <TabsTrigger value="ready_for_audit" className="text-xs sm:text-sm">Ready for Audit</TabsTrigger>
            <TabsTrigger value="invoices" className="text-xs sm:text-sm">Invoices</TabsTrigger>
            <TabsTrigger value="settlements" className="text-xs sm:text-sm">Settlements</TabsTrigger>
            <TabsTrigger value="audit" className="text-xs sm:text-sm">Audit Logs</TabsTrigger>
          </TabsList>
        </div>

        <TabsContent value="ready_for_audit" className="mt-4">
          <ReadyForAuditTab />
        </TabsContent>

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