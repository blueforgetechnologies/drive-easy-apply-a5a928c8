import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, X } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";

interface ChecklistItem {
  id: string;
  label: string;
  status: "match" | "fail" | null;
}

interface AuditDetailInlineProps {
  loadId: string;
  onClose: () => void;
  allLoadIds: string[];
  onNavigate: (loadId: string) => void;
}

export default function AuditDetailInline({ loadId, onClose, allLoadIds, onNavigate }: AuditDetailInlineProps) {
  const queryClient = useQueryClient();

  const [notes, setNotes] = useState("");
  const [rateConfirmation, setRateConfirmation] = useState<ChecklistItem[]>([
    { id: "customer_load_id", label: "Customer Load ID", status: null },
    { id: "carrier", label: "Carrier", status: null },
    { id: "broker", label: "Broker", status: null },
    { id: "dates", label: "Dates", status: null },
    { id: "origin", label: "Origin", status: null },
    { id: "destination", label: "Destination", status: null },
    { id: "rate", label: "Rate", status: null },
  ]);
  const [billOfLading, setBillOfLading] = useState<ChecklistItem[]>([
    { id: "bol_carrier", label: "Carrier", status: null },
    { id: "bol_origin", label: "Origin", status: null },
    { id: "bol_destinations", label: "Destinations", status: null },
  ]);

  const { data: load, isLoading } = useQuery({
    queryKey: ["audit-load", loadId],
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
          driver:assigned_driver_id(personal_info),
          load_documents(*)
        `)
        .eq("id", loadId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!loadId,
  });

  const updateStatusMutation = useMutation({
    mutationFn: async (newStatus: string) => {
      const { error } = await supabase
        .from("loads")
        .update({ 
          status: newStatus,
          billing_notes: notes || load?.billing_notes 
        })
        .eq("id", loadId);
      if (error) throw error;
    },
    onSuccess: (_, newStatus) => {
      queryClient.invalidateQueries({ queryKey: ["ready-for-audit-loads"] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      if (newStatus === "completed") {
        toast.success("Audit approved!");
      } else {
        toast.error("Audit failed - Load requires action");
      }
      onClose();
    },
    onError: () => {
      toast.error("Failed to update load status");
    },
  });

  const currentIndex = allLoadIds.findIndex((id) => id === loadId);
  const totalLoads = allLoadIds.length;

  const navigateToLoad = (index: number) => {
    if (index >= 0 && index < allLoadIds.length) {
      onNavigate(allLoadIds[index]);
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return "";
    return format(new Date(date), "MMM d, yyyy");
  };

  const formatCurrency = (amount: number | null) => {
    if (!amount) return "";
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency: "USD",
    }).format(amount);
  };

  const getDriverName = (driver: any) => {
    if (!driver?.personal_info) return "";
    const info = driver.personal_info as any;
    return `${info.first_name || ""} ${info.last_name || ""}`.trim();
  };

  const updateChecklistItem = (
    list: ChecklistItem[],
    setList: React.Dispatch<React.SetStateAction<ChecklistItem[]>>,
    itemId: string,
    status: "match" | "fail"
  ) => {
    setList(list.map((item) => 
      item.id === itemId ? { ...item, status } : item
    ));
  };

  const ChecklistButton = ({ 
    status, 
    type, 
    onClick 
  }: { 
    status: "match" | "fail" | null; 
    type: "match" | "fail"; 
    onClick: () => void;
  }) => (
    <button
      onClick={onClick}
      className={`px-3 py-1 text-xs font-medium rounded transition-colors ${
        status === type
          ? type === "match"
            ? "bg-emerald-500 text-white"
            : "bg-gray-400 text-white"
          : type === "match"
            ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
            : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      {type === "match" ? "Match" : "Fail"}
    </button>
  );

  if (isLoading) {
    return (
      <div className="space-y-4 mt-4">
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  if (!load) {
    return (
      <div className="mt-4">
        <p className="text-muted-foreground">Load not found</p>
      </div>
    );
  }

  const loadOwner = load.load_owner as any;
  const dispatcher = load.dispatchers as any;
  const loadOwnerName = loadOwner 
    ? `${loadOwner.first_name || ""} ${loadOwner.last_name || ""}`.trim()
    : "";
  const dispatcherName = dispatcher 
    ? `${dispatcher.first_name || ""} ${dispatcher.last_name || ""}`.trim()
    : "";
  const carrier = load.carriers as any;
  const customer = load.customers as any;
  const vehicle = load.vehicles as any;

  return (
    <div className="space-y-4 mt-4">
      {/* Close button row */}
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1">
          <X className="h-4 w-4" />
          Close Audit
        </Button>
      </div>

      {/* Header */}
      <div className="border rounded-lg overflow-hidden">
        <table className="w-full">
          <thead>
            <tr className="border-b">
              <th className="text-left p-3 text-primary font-medium text-sm">Our Load ID</th>
              <th className="text-left p-3 text-primary font-medium text-sm">Carrier</th>
              <th className="text-left p-3 text-primary font-medium text-sm">Origin</th>
              <th className="text-left p-3 text-primary font-medium text-sm">Pick Up</th>
              <th className="text-left p-3 text-primary font-medium text-sm">Rate</th>
              <th className="text-left p-3 text-primary font-medium text-sm">Load Owner</th>
              <th className="text-left p-3 text-primary font-medium text-sm">Truck ID</th>
            </tr>
            <tr className="bg-muted/30">
              <th className="text-left p-3 text-primary font-medium text-sm pt-0">Customer Load</th>
              <th className="text-left p-3 text-primary font-medium text-sm pt-0">Customer</th>
              <th className="text-left p-3 text-primary font-medium text-sm pt-0">Destination</th>
              <th className="text-left p-3 text-primary font-medium text-sm pt-0">Drop Off Date</th>
              <th className="text-left p-3"></th>
              <th className="text-left p-3 text-primary font-medium text-sm pt-0">Dispatcher</th>
              <th className="text-left p-3 text-primary font-medium text-sm pt-0">Driver</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td className="p-3 align-top">
                <div className="font-medium">{load.load_number}</div>
                <div className="text-muted-foreground text-sm">{load.reference_number || ""}</div>
              </td>
              <td className="p-3 align-top">
                <div className="font-semibold">{carrier?.name || ""}</div>
                <div className="text-muted-foreground text-sm">{customer?.name || ""}</div>
              </td>
              <td className="p-3 align-top">
                <div>{load.pickup_city ? `${load.pickup_city}, ${load.pickup_state || ""}` : ""}</div>
                <div className="text-muted-foreground text-sm">
                  {load.delivery_city ? `${load.delivery_city}, ${load.delivery_state || ""}` : ""}
                </div>
              </td>
              <td className="p-3 align-top">
                <div>{formatDate(load.pickup_date)}</div>
                <div className="text-muted-foreground text-sm">{formatDate(load.delivery_date)}</div>
              </td>
              <td className="p-3 align-top">
                <div className="font-medium">{formatCurrency(load.rate)}</div>
              </td>
              <td className="p-3 align-top">
                <div className="font-medium">{loadOwnerName}</div>
                <div className="text-muted-foreground text-sm">{dispatcherName}</div>
              </td>
              <td className="p-3 align-top">
                <div className="font-medium">{vehicle?.vehicle_number || ""}</div>
                <div className="text-muted-foreground text-sm">{getDriverName(load.driver)}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Main Content */}
      <div className="flex gap-6">
        {/* Left Sidebar */}
        <div className="w-80 flex-shrink-0 space-y-6">
          {/* Navigation */}
          <div className="flex items-center gap-2 text-primary">
            <button 
              onClick={() => navigateToLoad(0)} 
              disabled={currentIndex <= 0}
              className="hover:bg-muted p-1 rounded disabled:opacity-30"
            >
              <ChevronsLeft className="h-4 w-4" />
            </button>
            <button 
              onClick={() => navigateToLoad(currentIndex - 1)} 
              disabled={currentIndex <= 0}
              className="hover:bg-muted p-1 rounded disabled:opacity-30"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-lg">
              {currentIndex + 1}/{totalLoads}
            </span>
            <button 
              onClick={() => navigateToLoad(currentIndex + 1)} 
              disabled={currentIndex >= totalLoads - 1}
              className="hover:bg-muted p-1 rounded disabled:opacity-30"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            <button 
              onClick={() => navigateToLoad(totalLoads - 1)} 
              disabled={currentIndex >= totalLoads - 1}
              className="hover:bg-muted p-1 rounded disabled:opacity-30"
            >
              <ChevronsRight className="h-4 w-4" />
            </button>
          </div>

          {/* Rate Confirmation Checklist */}
          <div className="space-y-2">
            <h3 className="text-primary font-semibold">Rate Confirmation</h3>
            {rateConfirmation.map((item) => (
              <div key={item.id} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <div className="flex gap-1">
                  <ChecklistButton
                    status={item.status}
                    type="match"
                    onClick={() => updateChecklistItem(rateConfirmation, setRateConfirmation, item.id, "match")}
                  />
                  <ChecklistButton
                    status={item.status}
                    type="fail"
                    onClick={() => updateChecklistItem(rateConfirmation, setRateConfirmation, item.id, "fail")}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Bill of Lading Checklist */}
          <div className="space-y-2">
            <h3 className="text-primary font-semibold">Bill of lading</h3>
            {billOfLading.map((item) => (
              <div key={item.id} className="flex items-center justify-between">
                <span className="text-sm text-muted-foreground">{item.label}</span>
                <div className="flex gap-1">
                  <ChecklistButton
                    status={item.status}
                    type="match"
                    onClick={() => updateChecklistItem(billOfLading, setBillOfLading, item.id, "match")}
                  />
                  <ChecklistButton
                    status={item.status}
                    type="fail"
                    onClick={() => updateChecklistItem(billOfLading, setBillOfLading, item.id, "fail")}
                  />
                </div>
              </div>
            ))}
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <h3 className="text-primary font-semibold">Notes</h3>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Add audit notes..."
              className="min-h-[100px] resize-none"
            />
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3">
            <Button
              onClick={() => updateStatusMutation.mutate("completed")}
              disabled={updateStatusMutation.isPending}
              className="bg-emerald-500 hover:bg-emerald-600 text-white flex-1"
            >
              Approve Audit
            </Button>
            <Button
              onClick={() => updateStatusMutation.mutate("action_needed")}
              disabled={updateStatusMutation.isPending}
              className="bg-rose-400 hover:bg-rose-500 text-white flex-1"
            >
              Fail Audit
            </Button>
          </div>
        </div>

        {/* Right Content - Document Tabs */}
        <div className="flex-1 border rounded-lg">
          <Tabs defaultValue="rate_confirmation" className="w-full">
            <TabsList className="w-full justify-start rounded-none border-b bg-muted/30 h-auto p-0">
              <TabsTrigger 
                value="rate_confirmation" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-white px-6 py-3"
              >
                Rate Confirmation
              </TabsTrigger>
              <TabsTrigger 
                value="bol_1" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-white px-6 py-3"
              >
                Bill of Landing 1
              </TabsTrigger>
              <TabsTrigger 
                value="bol_2" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-white px-6 py-3"
              >
                Bill of Landing 2
              </TabsTrigger>
            </TabsList>
            <TabsContent value="rate_confirmation" className="p-4 min-h-[400px]">
              <p className="text-muted-foreground">Rate Confirmation</p>
            </TabsContent>
            <TabsContent value="bol_1" className="p-4 min-h-[400px]">
              <p className="text-muted-foreground">Bill of Landing 1</p>
            </TabsContent>
            <TabsContent value="bol_2" className="p-4 min-h-[400px]">
              <p className="text-muted-foreground">Bill of Landing 2</p>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
