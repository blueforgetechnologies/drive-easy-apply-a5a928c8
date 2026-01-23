import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import InvoicesTab from "./InvoicesTab";
import SettlementsTab from "./SettlementsTab";
import AuditLogsTab from "./AuditLogsTab";
import ReadyForAuditTab from "./ReadyForAuditTab";
import { useAccountingCounts } from "@/hooks/useAccountingCounts";

export default function AccountingTab() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeSubTab, setActiveSubTab] = useState<string>("ready_for_audit");
  const { readyForAudit, invoices, settlements, auditLogs } = useAccountingCounts();

  useEffect(() => {
    const subTab = searchParams.get("subtab");
    if (subTab && ["ready_for_audit", "invoices", "settlements", "audit"].includes(subTab)) {
      setActiveSubTab(subTab);
    } else if (!subTab) {
      const next = new URLSearchParams(searchParams);
      next.set("subtab", "ready_for_audit");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const handleSubTabChange = (value: string) => {
    setActiveSubTab(value);
    const next = new URLSearchParams(searchParams);
    next.set("subtab", value);
    setSearchParams(next);
  };

  const tabs = [
    { key: "ready_for_audit", label: "Ready for Audit", count: readyForAudit },
    { key: "invoices", label: "Invoices", count: invoices },
    { key: "settlements", label: "Settlements", count: settlements },
    { key: "audit", label: "Audit Logs", count: auditLogs },
  ];

  return (
    <div className="space-y-2">
      <div>
        <h2 className="text-xl font-bold">Accounting</h2>
        <p className="text-xs text-muted-foreground">
          Manage invoices, settlements, and audit logs
        </p>
      </div>

      <div className="overflow-x-auto -mx-3 px-3 sm:mx-0 sm:px-0">
        <div className="flex items-center gap-0 w-max sm:w-auto">
          {tabs.map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleSubTabChange(tab.key)}
              className={`h-[28px] px-3 text-[12px] font-medium rounded-none first:rounded-l-full last:rounded-r-full border-0 transition-all flex items-center gap-1.5 ${
                activeSubTab === tab.key 
                  ? 'btn-glossy-primary text-white' 
                  : 'btn-glossy text-gray-700 hover:opacity-90'
              }`}
            >
              {tab.label}
              <span className={`${activeSubTab === tab.key ? 'badge-inset-dark' : 'badge-inset'} text-[10px] h-5`}>
                {tab.count}
              </span>
            </button>
          ))}
        </div>
      </div>

      {activeSubTab === "ready_for_audit" && (
        <div className="mt-2">
          <ReadyForAuditTab />
        </div>
      )}

      {activeSubTab === "invoices" && (
        <div className="mt-2">
          <InvoicesTab />
        </div>
      )}

      {activeSubTab === "settlements" && (
        <div className="mt-2">
          <SettlementsTab />
        </div>
      )}

      {activeSubTab === "audit" && (
        <div className="mt-2">
          <AuditLogsTab />
        </div>
      )}
    </div>
  );
}