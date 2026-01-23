import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
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
          {[
            { key: "ready_for_audit", label: "Ready for Audit" },
            { key: "invoices", label: "Invoices" },
            { key: "settlements", label: "Settlements" },
            { key: "audit", label: "Audit Logs" },
          ].map((tab) => (
            <button
              key={tab.key}
              onClick={() => handleSubTabChange(tab.key)}
              className={`h-[28px] px-3 text-[12px] font-medium rounded-none first:rounded-l-full last:rounded-r-full border-0 transition-all ${
                activeSubTab === tab.key 
                  ? 'btn-glossy-primary text-white' 
                  : 'btn-glossy text-gray-700 hover:opacity-90'
              }`}
            >
              {tab.label}
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