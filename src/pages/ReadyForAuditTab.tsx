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

export default function ReadyForAuditTab() {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedLoadId, setSelectedLoadId] = useState<string | null>(null);

  const { data: loads, isLoading } = useQuery({
    queryKey: ["ready-for-audit-loads"],
    queryFn: async () => {
      const { data, error } = await supabase
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
        .eq("status", "ready_for_audit")
        .order("completed_at", { ascending: false });

      if (error) throw error;
      return data;
    },
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
    <div className="space-y-3">
      {/* Filter Bar */}
      <div className="flex items-center justify-end gap-2">
        <Badge variant="secondary" className="text-xs">
          {filteredLoads?.length || 0} loads
        </Badge>
        <div className="relative w-64">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search loads..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9 h-8"
          />
        </div>
      </div>

      {!selectedLoadId && (
        <>
          {filteredLoads?.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
              <FileCheck className="h-12 w-12 mb-4 opacity-50" />
              <p className="text-lg font-medium">No loads ready for audit</p>
              <p className="text-sm">Loads marked as "Ready for Audit" will appear here</p>
            </div>
          ) : (
            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 border-b-0">
                    <TableHead className="text-primary font-medium">Our Load ID</TableHead>
                    <TableHead className="text-primary font-medium">Carrier</TableHead>
                    <TableHead className="text-primary font-medium">Origin</TableHead>
                    <TableHead className="text-primary font-medium">Pick Up</TableHead>
                    <TableHead className="text-primary font-medium">Rate</TableHead>
                    <TableHead className="text-primary font-medium">Load Owner</TableHead>
                    <TableHead className="text-primary font-medium">Truck ID</TableHead>
                  </TableRow>
                  <TableRow className="bg-muted/50">
                    <TableHead className="text-primary font-medium pt-0">Customer Load</TableHead>
                    <TableHead className="text-primary font-medium pt-0">Customer</TableHead>
                    <TableHead className="text-primary font-medium pt-0">Destination</TableHead>
                    <TableHead className="text-primary font-medium pt-0">Drop Off Date</TableHead>
                    <TableHead></TableHead>
                    <TableHead className="text-primary font-medium pt-0">Dispatcher</TableHead>
                    <TableHead className="text-primary font-medium pt-0">Driver</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredLoads?.map((load) => {
                    const loadOwner = load.load_owner as any;
                    const dispatcher = load.dispatchers as any;
                    const loadOwnerName = loadOwner 
                      ? `${loadOwner.first_name || ""} ${loadOwner.last_name || ""}`.trim()
                      : "";
                    const dispatcherName = dispatcher 
                      ? `${dispatcher.first_name || ""} ${dispatcher.last_name || ""}`.trim()
                      : "";
                    const driverName = getDriverName(load.driver);

                    return (
                      <TableRow 
                        key={load.id} 
                        className="cursor-pointer hover:bg-muted/50 border-t"
                        onClick={() => setSelectedLoadId(load.id)}
                      >
                        <TableCell className="align-top py-3">
                          <div className="font-medium">{load.load_number}</div>
                          <div className="text-muted-foreground text-sm">{load.reference_number || ""}</div>
                        </TableCell>
                        <TableCell className="align-top py-3">
                          <div className="font-semibold">{load.carriers?.name || ""}</div>
                          <div className="text-muted-foreground text-sm">{load.customers?.name || ""}</div>
                        </TableCell>
                        <TableCell className="align-top py-3">
                          <div>{load.pickup_city ? `${load.pickup_city}, ${load.pickup_state || ""}`.trim() : ""}</div>
                          <div className="text-muted-foreground text-sm">
                            {load.delivery_city ? `${load.delivery_city}, ${load.delivery_state || ""}`.trim() : ""}
                          </div>
                        </TableCell>
                        <TableCell className="align-top py-3">
                          <div>{formatDate(load.pickup_date)}</div>
                          <div className="text-muted-foreground text-sm">{formatDate(load.delivery_date)}</div>
                        </TableCell>
                        <TableCell className="align-top py-3">
                          <div className="font-medium">{formatCurrency(load.rate)}</div>
                        </TableCell>
                        <TableCell className="align-top py-3">
                          <div className="font-medium">{loadOwnerName}</div>
                          <div className="text-muted-foreground text-sm">{dispatcherName}</div>
                        </TableCell>
                        <TableCell className="align-top py-3">
                          <div className="font-medium">{load.vehicles?.vehicle_number || ""}</div>
                          <div className="text-muted-foreground text-sm">{driverName}</div>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          )}
        </>
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
