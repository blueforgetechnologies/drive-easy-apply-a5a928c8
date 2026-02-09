import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, FileCheck } from "lucide-react";
import { format } from "date-fns";
import { Skeleton } from "@/components/ui/skeleton";
import AuditDetailInline from "@/components/AuditDetailInline";
import { useTenantQuery } from "@/hooks/useTenantQuery";

export default function ReadyForAuditTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);
  const { tenantId, shouldFilter, isReady } = useTenantQuery();

  const { data: loads, isLoading } = useQuery({
    queryKey: ["ready-for-audit-loads", tenantId],
    queryFn: async () => {
      // ============================================================
      // READY FOR AUDIT QUERY LOGIC
      // ============================================================
      // This query captures loads that need billing audit, including:
      // 1. Loads explicitly marked ready_for_audit (normal workflow)
      // 2. Loads marked set_aside (temporarily deferred)
      // 3. ANY load with financial_status='pending_invoice' regardless of operational status
      //    - This is the KEY CHANGE: allows "Return to Audit" to work without
      //      changing loads.status (operational lifecycle is preserved)
      //    - e.g., a closed load can appear here if its invoice was returned
      // 
      // Exclusion: loads already invoiced (financial_status='invoiced')
      // ============================================================
      let query = supabase
        .from("loads")
        .select(`
          *,
          customers(name),
          carriers(name),
          vehicles(vehicle_number),
          dispatchers:assigned_dispatcher_id(first_name, last_name),
          load_owner:load_owner_id(first_name, last_name),
          driver:assigned_driver_id(personal_info)
        `)
        // Include: ready_for_audit, set_aside, OR any load with pending_invoice financial status
        // The financial_status check is the primary billing-ready indicator
        .or("status.in.(ready_for_audit,set_aside),financial_status.eq.pending_invoice")
        // Exclude already-invoiced loads. Use .or() to allow NULLs through
        // (PostgREST .neq() excludes NULLs, which would hide ready_for_audit loads with no financial_status)
        .or("financial_status.is.null,financial_status.neq.invoiced")
        .order("completed_at", { ascending: false });

      // Apply tenant scoping
      if (shouldFilter && tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data;
    },
    enabled: isReady,
  });

  const filteredLoads = loads?.filter((load) => {
    const search = searchTerm.toLowerCase();
    return (
      load.load_number?.toLowerCase().includes(search) ||
      load.customers?.name?.toLowerCase().includes(search) ||
      load.carriers?.name?.toLowerCase().includes(search) ||
      load.pickup_city?.toLowerCase().includes(search) ||
      load.delivery_city?.toLowerCase().includes(search) ||
      load.reference_number?.toLowerCase().includes(search)
    );
  });

  const allLoadIds = filteredLoads?.map((load) => load.id) || [];

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const formatDate = (date: string | null) => {
    if (!date) return "";
    return format(new Date(date), "MMM d, yyyy");
  };

  const getDriverName = (driver: any) => {
    if (!driver?.personal_info) return "";
    const info = driver.personal_info as any;
    return `${info.first_name || ""} ${info.last_name || ""}`.trim() || "";
  };

  if (isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-10 w-full max-w-sm" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {/* Filter Bar */}
      <div className="flex items-center justify-end gap-2">
        <Badge variant="secondary" className="text-xs py-0.5">
          {filteredLoads?.length || 0} loads
        </Badge>
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search loads..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-8 h-7 text-sm"
          />
        </div>
      </div>

      {!selectedLoadId && (
        <div className="rounded-lg border overflow-hidden shadow-lg">
          <Table className="text-sm">
            <TableHeader>
              <TableRow className="bg-muted/50 backdrop-blur-sm border-b-0">
                <TableHead className="text-primary font-semibold text-xs py-2 px-3">
                  <div>Our Load ID</div>
                  <div className="text-muted-foreground font-normal">Customer Load</div>
                </TableHead>
                <TableHead className="text-primary font-semibold text-xs py-2 px-3">
                  <div>Carrier</div>
                  <div className="text-muted-foreground font-normal">Customer</div>
                </TableHead>
                <TableHead className="text-primary font-semibold text-xs py-2 px-3">
                  <div>Origin</div>
                  <div className="text-muted-foreground font-normal">Destination</div>
                </TableHead>
                <TableHead className="text-primary font-semibold text-xs py-2 px-3">
                  <div>Pick Up</div>
                  <div className="text-muted-foreground font-normal">Drop Off Date</div>
                </TableHead>
                <TableHead className="text-primary font-semibold text-xs py-2 px-3">
                  <div>Rate</div>
                </TableHead>
                <TableHead className="text-primary font-semibold text-xs py-2 px-3">
                  <div>Load Owner</div>
                  <div className="text-muted-foreground font-normal">Dispatcher</div>
                </TableHead>
                <TableHead className="text-primary font-semibold text-xs py-2 px-3">
                  <div>Truck ID</div>
                  <div className="text-muted-foreground font-normal">Driver</div>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredLoads?.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="py-12 text-center">
                    <div className="flex flex-col items-center justify-center text-muted-foreground">
                      <FileCheck className="h-10 w-10 mb-3 opacity-50" />
                      <p className="text-base font-medium">Nothing to audit</p>
                      <p className="text-sm">Loads marked as "Ready for Audit" will appear here</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                filteredLoads?.map((load) => {
                  const loadOwner = load.load_owner as any;
                  const dispatcher = load.dispatchers as any;
                  const loadOwnerName = loadOwner 
                    ? `${loadOwner.first_name || ""} ${loadOwner.last_name || ""}`.trim()
                    : "";
                  const dispatcherName = dispatcher 
                    ? `${dispatcher.first_name || ""} ${dispatcher.last_name || ""}`.trim()
                    : "";
                  const driverName = getDriverName(load.driver);
                  const isSetAside = load.status === "set_aside";
                  // Returned load: operational status is NOT ready_for_audit but financial_status is pending_invoice
                  // This indicates a load whose invoice was returned/cancelled
                  const isReturned = load.status !== "ready_for_audit" && 
                                     load.status !== "set_aside" && 
                                     load.financial_status === "pending_invoice";

                  return (
                    <TableRow 
                      key={load.id} 
                      className={`cursor-pointer hover:bg-muted/50 transition-colors ${
                        isReturned 
                          ? "bg-blue-50 dark:bg-blue-950/20 border-l-4 border-l-blue-500" 
                          : isSetAside 
                            ? "bg-amber-50 dark:bg-amber-950/20 border-l-4 border-l-amber-500" 
                            : "border-l-4 border-l-primary"
                      }`}
                      onClick={() => setSelectedLoadId(load.id)}
                    >
                      <TableCell className="py-2 px-3">
                        <div className="flex items-center gap-2">
                          <div className="font-medium text-sm">{load.load_number}</div>
                          {isReturned && (
                            <span className="badge-puffy badge-puffy-blue text-[10px]" title="Invoice was cancelled - load returned to audit">
                              Returned
                            </span>
                          )}
                          {isSetAside && !isReturned && (
                            <span className="badge-puffy badge-puffy-amber text-[10px]">
                              Set Aside
                            </span>
                          )}
                        </div>
                        <div className="text-muted-foreground text-xs">{load.reference_number || ""}</div>
                      </TableCell>
                      <TableCell className="py-2 px-3">
                        <div className="font-semibold text-sm">{load.carriers?.name || ""}</div>
                        <div className="text-muted-foreground text-xs">{load.customers?.name || ""}</div>
                      </TableCell>
                      <TableCell className="py-2 px-3">
                        <div className="text-sm">{load.pickup_city ? `${load.pickup_city}, ${load.pickup_state || ""}`.trim() : ""}</div>
                        <div className="text-muted-foreground text-xs">
                          {load.delivery_city ? `${load.delivery_city}, ${load.delivery_state || ""}`.trim() : ""}
                        </div>
                      </TableCell>
                      <TableCell className="py-2 px-3">
                        <div className="text-sm">{formatDate(load.pickup_date)}</div>
                        <div className="text-muted-foreground text-xs">{formatDate(load.delivery_date)}</div>
                      </TableCell>
                      <TableCell className="py-2 px-3">
                        <div className="font-medium text-sm">{formatCurrency(load.rate)}</div>
                      </TableCell>
                      <TableCell className="py-2 px-3">
                        <div className="font-medium text-sm">{loadOwnerName}</div>
                        <div className="text-muted-foreground text-xs">{dispatcherName}</div>
                      </TableCell>
                      <TableCell className="py-2 px-3">
                        <div className="font-medium text-sm">{load.vehicles?.vehicle_number || ""}</div>
                        <div className="text-muted-foreground text-xs">{driverName}</div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      )}

      {selectedLoadId && (
        <AuditDetailInline
          loadId={selectedLoadId}
          onClose={() => setSelectedLoadId(null)}
          allLoadIds={allLoadIds}
          onNavigate={(id) => setSelectedLoadId(id)}
        />
      )}
    </div>
  );
}
