import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowLeft, FileText, Download, ExternalLink, Sparkles, Loader2, AlertCircle, CheckCircle2, XCircle, Receipt } from "lucide-react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { format } from "date-fns";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { AuditDocumentViewer } from "@/components/audit/AuditDocumentViewer";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import AuditCreateInvoiceDialog from "@/components/AuditCreateInvoiceDialog";


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
  const [, setSearchParams] = useSearchParams();

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
  const [isVerifying, setIsVerifying] = useState(false);
  const [verifyError, setVerifyError] = useState<{ title: string; message: string; suggestion?: string } | null>(null);
  const [createInvoiceDialogOpen, setCreateInvoiceDialogOpen] = useState(false);


  const { data: load, isLoading } = useQuery({
    queryKey: ["audit-load", loadId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("loads")
        .select(`
          *,
          customers(id, name, email, billing_email, otr_approval_status, factoring_approval),
          carriers(name),
          vehicles(vehicle_number),
          dispatchers:assigned_dispatcher_id(first_name, last_name),
          load_owner:load_owner_id(first_name, last_name),
          driver:assigned_driver_id(personal_info),
          load_documents(id, document_type, file_name, file_url)
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
      const updateData: any = { 
        status: newStatus,
        billing_notes: notes || load?.billing_notes 
      };
      
      // When failing a load, clear financial_status so it doesn't remain in Ready for Audit
      if (newStatus === "action_needed") {
        updateData.financial_status = null;
      }
      
      const { error } = await supabase
        .from("loads")
        .update(updateData)
        .eq("id", loadId);
      if (error) throw error;
    },
    onSuccess: (_, newStatus) => {
      queryClient.invalidateQueries({ queryKey: ["ready-for-audit-loads"] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      if (newStatus === "set_aside") {
        toast.info("Load set aside for later review");
        onClose();
      } else {
        toast.error("Audit failed - Load requires action");
        onClose();
      }
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

  // AI Verify function
  const handleAIVerify = async () => {
    if (!load) return;
    
    const documents = (load.load_documents as any[]) || [];
    const rateConfirmationDocs = documents.filter((doc: any) => doc.document_type === "rate_confirmation");
    const bolDocs = documents.filter((doc: any) => doc.document_type === "bill_of_lading");
    
    if (rateConfirmationDocs.length === 0 && bolDocs.length === 0) {
      setVerifyError({
        title: "No Documents Found",
        message: "There are no Rate Confirmation or Bill of Lading documents to verify.",
        suggestion: "Please upload documents from the load detail page first."
      });
      return;
    }

    setIsVerifying(true);
    setVerifyError(null);
    
    const carrier = load.carriers as any;
    const customer = load.customers as any;
    const errors: string[] = [];
    let rcSuccess = false;
    let bolSuccess = false;

    const loadData = {
      reference_number: load.reference_number,
      carrier_name: carrier?.name,
      customer_name: customer?.name,
      pickup_date: load.pickup_date,
      delivery_date: load.delivery_date,
      pickup_city: load.pickup_city,
      pickup_state: load.pickup_state,
      delivery_city: load.delivery_city,
      delivery_state: load.delivery_state,
      rate: load.rate,
    };

    try {
      // Get signed URLs for documents
      const getSignedUrl = async (fileUrl: string) => {
        if (fileUrl.startsWith("http://") || fileUrl.startsWith("https://")) {
          return fileUrl;
        }
        const { data, error } = await supabase.storage
          .from("load-documents")
          .createSignedUrl(fileUrl, 3600);
        if (error) throw error;
        return data.signedUrl;
      };

      // Verify Rate Confirmation
      if (rateConfirmationDocs.length > 0) {
        const rcDoc = rateConfirmationDocs[0];
        const rcUrl = await getSignedUrl(rcDoc.file_url);
        
        const { data: rcResult, error: rcError } = await supabase.functions.invoke(
          "audit-verify-documents",
          {
            body: {
              documentUrl: rcUrl,
              documentType: "rate_confirmation",
              loadData,
              fileName: rcDoc.file_name,
            },
          }
        );

        if (rcError) {
          console.error("RC verification error:", rcError);
          errors.push(`Rate Confirmation: ${rcError.message || 'Unknown error'}`);
        } else if (!rcResult?.success) {
          // Handle specific error from edge function
          errors.push(`Rate Confirmation: ${rcResult?.error || 'Verification failed'}`);
          if (rcResult?.suggestion) {
            errors.push(`Suggestion: ${rcResult.suggestion}`);
          }
        } else if (rcResult?.result) {
          const result = rcResult.result;
          setRateConfirmation(prev => prev.map(item => {
            const status = result[item.id];
            if (status === "match" || status === "fail") {
              return { ...item, status };
            }
            return item;
          }));
          rcSuccess = true;
          
          // Add reasoning to notes if available
          if (result.reasoning) {
            setNotes(prev => prev ? `${prev}\n\nAI RC Verify: ${result.reasoning}` : `AI RC Verify: ${result.reasoning}`);
          }
        }
      }

      // Verify Bill of Lading
      if (bolDocs.length > 0) {
        const bolDoc = bolDocs[0];
        const bolUrl = await getSignedUrl(bolDoc.file_url);
        
        const { data: bolResult, error: bolError } = await supabase.functions.invoke(
          "audit-verify-documents",
          {
            body: {
              documentUrl: bolUrl,
              documentType: "bill_of_lading",
              loadData,
              fileName: bolDoc.file_name,
            },
          }
        );

        if (bolError) {
          console.error("BOL verification error:", bolError);
          errors.push(`Bill of Lading: ${bolError.message || 'Unknown error'}`);
        } else if (!bolResult?.success) {
          errors.push(`Bill of Lading: ${bolResult?.error || 'Verification failed'}`);
          if (bolResult?.suggestion) {
            errors.push(`Suggestion: ${bolResult.suggestion}`);
          }
        } else if (bolResult?.result) {
          const result = bolResult.result;
          setBillOfLading(prev => prev.map(item => {
            // Map the item IDs to the API response keys
            const keyMap: Record<string, string> = {
              "bol_carrier": "carrier",
              "bol_origin": "origin",
              "bol_destinations": "destinations",
            };
            const apiKey = keyMap[item.id];
            const status = result[apiKey];
            if (status === "match" || status === "fail") {
              return { ...item, status };
            }
            return item;
          }));
          bolSuccess = true;
          
          // Add reasoning to notes if available
          if (result.reasoning) {
            setNotes(prev => prev ? `${prev}\n\nAI BOL Verify: ${result.reasoning}` : `AI BOL Verify: ${result.reasoning}`);
          }
        }
      }

      // Show results
      if (errors.length > 0) {
        setVerifyError({
          title: "AI Verification Issue",
          message: errors.join('\n\n'),
          suggestion: "PDF documents cannot be analyzed directly. Please upload image versions (PNG, JPEG) or manually verify using the Match/Fail buttons."
        });
      } else if (rcSuccess || bolSuccess) {
        toast.success(`AI verification complete! ${rcSuccess ? 'RC ✓' : ''} ${bolSuccess ? 'BOL ✓' : ''}`);
      }

    } catch (error) {
      console.error("AI verification error:", error);
      setVerifyError({
        title: "Verification Failed",
        message: error instanceof Error ? error.message : "An unexpected error occurred",
        suggestion: "Please try again or manually verify using the Match/Fail buttons."
      });
    } finally {
      setIsVerifying(false);
    }
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
      type="button"
      onClick={onClick}
      className={`px-3.5 py-1.5 text-xs font-semibold rounded-lg transition-all duration-200 backdrop-blur-sm border shadow-sm ${
        status === type
          ? type === "match"
            ? "bg-gradient-to-b from-emerald-400 to-emerald-600 text-white border-emerald-400/50 shadow-emerald-500/30 shadow-md"
            : "bg-gradient-to-b from-rose-400 to-rose-600 text-white border-rose-400/50 shadow-rose-500/30 shadow-md"
          : "bg-gradient-to-b from-white/80 to-muted/60 text-muted-foreground border-border/50 hover:from-white hover:to-muted/80 hover:shadow-md hover:border-border"
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

  // Organize documents by type
  const documents = (load.load_documents as any[]) || [];
  const rateConfirmationDocs = documents.filter((doc: any) => doc.document_type === "rate_confirmation");
  const bolDocs = documents.filter((doc: any) => doc.document_type === "bill_of_lading");


  const renderNoDocument = (type: string) => (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] text-muted-foreground">
      <FileText className="h-8 w-8 mb-2 opacity-50" />
      <p className="text-sm font-medium">No {type} uploaded</p>
      <p className="text-xs">Upload documents from the load detail page</p>
    </div>
  );

  return (
    <div className="space-y-2 mt-2">
      {/* Back button */}
      <div className="flex justify-start">
        <Button variant="ghost" size="sm" onClick={onClose} className="gap-1 h-7 text-xs">
          <ArrowLeft className="h-3.5 w-3.5" />
          Back
        </Button>
      </div>

      {/* Header Table - Glass effect with separate header and data rows */}
      <div className="rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow className="bg-muted/50 backdrop-blur-sm">
              <TableHead className="text-primary text-xs py-2 px-3">
                <div>Our Load ID</div>
                <div className="text-muted-foreground">Customer Load</div>
              </TableHead>
              <TableHead className="text-primary text-xs py-2 px-3">
                <div>Carrier</div>
                <div className="text-muted-foreground">Customer</div>
              </TableHead>
              <TableHead className="text-primary text-xs py-2 px-3">
                <div>Origin</div>
                <div className="text-muted-foreground">Destination</div>
              </TableHead>
              <TableHead className="text-primary text-xs py-2 px-3">
                <div>Pick Up</div>
                <div className="text-muted-foreground">Drop Off Date</div>
              </TableHead>
              <TableHead className="text-primary text-xs py-2 px-3">
                <div>Rate</div>
              </TableHead>
              <TableHead className="text-primary text-xs py-2 px-3">
                <div>Load Owner</div>
                <div className="text-muted-foreground">Dispatcher</div>
              </TableHead>
              <TableHead className="text-primary text-xs py-2 px-3">
                <div>Truck ID</div>
                <div className="text-muted-foreground">Driver</div>
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow className="border-l-4 border-l-primary">
              <TableCell className="py-2 px-3">
                <div className="font-medium text-sm">{load.load_number}</div>
                <div className="text-muted-foreground text-xs">{load.reference_number || "-"}</div>
              </TableCell>
              <TableCell className="py-2 px-3">
                <div className="font-semibold text-sm">{carrier?.name || "-"}</div>
                <div className="text-muted-foreground text-xs">{customer?.name || "-"}</div>
              </TableCell>
              <TableCell className="py-2 px-3">
                <div className="text-sm">{load.pickup_city ? `${load.pickup_city}, ${load.pickup_state || ""}` : "-"}</div>
                <div className="text-muted-foreground text-xs">{load.delivery_city ? `${load.delivery_city}, ${load.delivery_state || ""}` : "-"}</div>
              </TableCell>
              <TableCell className="py-2 px-3">
                <div className="text-sm">{formatDate(load.pickup_date)}</div>
                <div className="text-muted-foreground text-xs">{formatDate(load.delivery_date)}</div>
              </TableCell>
              <TableCell className="py-2 px-3">
                <div className="font-medium text-sm">{formatCurrency(load.rate)}</div>
              </TableCell>
              <TableCell className="py-2 px-3">
                <div className="font-medium text-sm">{loadOwnerName || "-"}</div>
                <div className="text-muted-foreground text-xs">{dispatcherName || "-"}</div>
              </TableCell>
              <TableCell className="py-2 px-3">
                <div className="font-medium text-sm">{vehicle?.vehicle_number || "-"}</div>
                <div className="text-muted-foreground text-xs">{getDriverName(load.driver) || "-"}</div>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>

      {/* Main Content */}
      <div className="flex gap-4">
        {/* Left Sidebar - Glass Card */}
        <div className="w-64 flex-shrink-0">
          <div className="bg-card/80 backdrop-blur-xl border rounded-xl shadow-lg p-3 space-y-0 divide-y divide-border">
            {/* Navigation */}
            <div className="flex items-center justify-center gap-1 pb-2">
              <button 
                onClick={() => navigateToLoad(0)} 
                disabled={currentIndex <= 0}
                className="hover:bg-primary/10 p-1 rounded disabled:opacity-30 transition-colors"
              >
                <ChevronsLeft className="h-3.5 w-3.5 text-primary" />
              </button>
              <button 
                onClick={() => navigateToLoad(currentIndex - 1)} 
                disabled={currentIndex <= 0}
                className="hover:bg-primary/10 p-1 rounded disabled:opacity-30 transition-colors"
              >
                <ChevronLeft className="h-3.5 w-3.5 text-primary" />
              </button>
              <span className="text-xs font-medium px-2 py-0.5 bg-muted rounded-full">
                {currentIndex + 1} / {totalLoads}
              </span>
              <button 
                onClick={() => navigateToLoad(currentIndex + 1)} 
                disabled={currentIndex >= totalLoads - 1}
                className="hover:bg-primary/10 p-1 rounded disabled:opacity-30 transition-colors"
              >
                <ChevronRight className="h-3.5 w-3.5 text-primary" />
              </button>
              <button 
                onClick={() => navigateToLoad(totalLoads - 1)} 
                disabled={currentIndex >= totalLoads - 1}
                className="hover:bg-primary/10 p-1 rounded disabled:opacity-30 transition-colors"
              >
                <ChevronsRight className="h-3.5 w-3.5 text-primary" />
              </button>
            </div>

            {/* AI Verify Button */}
            <div className="py-2">
              <button
                type="button"
                onClick={handleAIVerify}
                disabled={isVerifying}
                className="w-full h-9 text-xs font-semibold rounded-lg bg-gradient-to-r from-violet-500 to-purple-600 hover:from-violet-600 hover:to-purple-700 text-white shadow-md shadow-purple-500/25 disabled:opacity-50 transition-all flex items-center justify-center gap-2"
              >
                {isVerifying ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Verifying...
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    AI Auto-Verify
                  </>
                )}
              </button>
            </div>

            {/* Rate Confirmation Checklist */}
            <div className="py-2">
              <h3 className="text-primary font-semibold text-xs mb-1.5">Rate Confirmation</h3>
              <div className="divide-y divide-border/50">
                {rateConfirmation.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-1 hover:bg-muted/30 transition-colors">
                    <span className="text-xs">{item.label}</span>
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
            </div>

            {/* Bill of Lading Checklist */}
            <div className="py-2">
              <h3 className="text-primary font-semibold text-xs mb-1.5">Bill of Lading</h3>
              <div className="divide-y divide-border/50">
                {billOfLading.map((item) => (
                  <div key={item.id} className="flex items-center justify-between py-1 hover:bg-muted/30 transition-colors">
                    <span className="text-xs">{item.label}</span>
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
            </div>

            {/* Notes */}
            <div className="py-2">
              <h3 className="text-primary font-semibold text-xs mb-1.5">Notes</h3>
              <Textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Add audit notes..."
                className="min-h-[80px] resize-none text-xs bg-muted/30 border-muted-foreground/20 focus:border-primary/50"
              />
            </div>

            {/* Primary Action: Audit & Create Invoice */}
            <div className="py-2">
              <button
                type="button"
                onClick={() => setCreateInvoiceDialogOpen(true)}
                className="w-full h-10 text-xs font-semibold rounded-lg bg-gradient-to-r from-primary to-primary/80 hover:from-primary/90 hover:to-primary/70 text-primary-foreground shadow-md shadow-primary/25 transition-all flex items-center justify-center gap-2"
              >
                <Receipt className="h-4 w-4" />
                Audit & Create Invoice
              </button>
            </div>

            {/* Secondary Actions */}
            <div className="flex pt-2 gap-1">
              <button
                type="button"
                onClick={() => updateStatusMutation.mutate("set_aside")}
                disabled={updateStatusMutation.isPending}
                className="flex-1 h-8 text-xs font-medium rounded-lg bg-gradient-to-b from-amber-400 to-amber-600 hover:from-amber-500 hover:to-amber-700 text-white shadow-sm shadow-amber-500/25 disabled:opacity-50 transition-all"
              >
                Set Aside
              </button>
              <button
                type="button"
                onClick={() => updateStatusMutation.mutate("action_needed")}
                disabled={updateStatusMutation.isPending}
                className="flex-1 h-8 text-xs font-medium rounded-lg bg-gradient-to-b from-rose-400 to-rose-600 hover:from-rose-500 hover:to-rose-700 text-white shadow-sm shadow-rose-500/25 disabled:opacity-50 transition-all"
              >
                Fail
              </button>
            </div>
          </div>
        </div>

        {/* Right Content - Document Tabs */}
        <div className="flex-1 border rounded-lg overflow-hidden shadow-lg flex flex-col min-h-[700px]">
          <Tabs defaultValue="rate_confirmation" className="w-full h-full flex flex-col flex-1">
            <TabsList className="w-full justify-start rounded-none border-b bg-background h-auto p-0 flex-shrink-0">
              <TabsTrigger 
                value="rate_confirmation" 
                className="rounded-t-lg rounded-b-none px-6 py-3 font-medium transition-all border border-b-0 hover:bg-primary/20 data-[state=inactive]:text-primary/70 data-[state=inactive]:border-primary/20 data-[state=inactive]:bg-primary/5 data-[state=active]:border-primary/50 data-[state=active]:bg-gradient-to-b data-[state=active]:from-primary data-[state=active]:to-primary/80 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-primary/25"
              >
                Rate Confirmation {rateConfirmationDocs.length > 0 && `(${rateConfirmationDocs.length})`}
              </TabsTrigger>
              {bolDocs.map((doc, index) => (
                <TabsTrigger 
                  key={doc.id}
                  value={`bol_${index}`}
                  className="rounded-t-lg rounded-b-none px-6 py-3 font-medium transition-all border border-b-0 hover:bg-primary/20 data-[state=inactive]:text-primary/70 data-[state=inactive]:border-primary/20 data-[state=inactive]:bg-primary/5 data-[state=active]:border-primary/50 data-[state=active]:bg-gradient-to-b data-[state=active]:from-primary data-[state=active]:to-primary/80 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-primary/25"
                >
                  Bill of Lading {index + 1}
                </TabsTrigger>
              ))}
              {bolDocs.length === 0 && (
                <TabsTrigger 
                  value="bol_empty"
                  className="rounded-t-lg rounded-b-none px-6 py-3 font-medium transition-all border border-b-0 hover:bg-primary/20 data-[state=inactive]:text-primary/70 data-[state=inactive]:border-primary/20 data-[state=inactive]:bg-primary/5 data-[state=active]:border-primary/50 data-[state=active]:bg-gradient-to-b data-[state=active]:from-primary data-[state=active]:to-primary/80 data-[state=active]:text-white data-[state=active]:shadow-md data-[state=active]:shadow-primary/25"
                >
                  Bill of Lading
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="rate_confirmation" className="flex-1 overflow-auto m-0">
              {rateConfirmationDocs.length > 0 
                ? <AuditDocumentViewer doc={rateConfirmationDocs[0]} />
                : renderNoDocument("Rate Confirmation")
              }
            </TabsContent>
            {bolDocs.map((doc, index) => (
              <TabsContent key={doc.id} value={`bol_${index}`} className="flex-1 overflow-auto m-0">
                <AuditDocumentViewer doc={doc} />
              </TabsContent>
            ))}
            {bolDocs.length === 0 && (
              <TabsContent value="bol_empty" className="flex-1 overflow-auto m-0">
                {renderNoDocument('Bill of Lading')}
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>

      {/* AI Verification Error Dialog */}
      <Dialog open={!!verifyError} onOpenChange={(open) => !open && setVerifyError(null)}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="h-5 w-5" />
              {verifyError?.title}
            </DialogTitle>
            <DialogDescription className="space-y-3 pt-2">
              <p className="whitespace-pre-wrap text-sm">{verifyError?.message}</p>
              {verifyError?.suggestion && (
                <div className="bg-muted p-3 rounded-lg border">
                  <p className="text-xs font-medium text-foreground">💡 Suggestion:</p>
                  <p className="text-xs text-muted-foreground mt-1">{verifyError.suggestion}</p>
                </div>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="flex justify-end gap-2 mt-4">
            <Button variant="outline" onClick={() => setVerifyError(null)}>
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Audit & Create Invoice Dialog */}
      <AuditCreateInvoiceDialog
        open={createInvoiceDialogOpen}
        onOpenChange={setCreateInvoiceDialogOpen}
        load={load ? {
          id: load.id,
          load_number: load.load_number,
          reference_number: load.reference_number,
          rate: load.rate,
          customer_id: load.customer_id,
          pickup_city: load.pickup_city,
          pickup_state: load.pickup_state,
          delivery_city: load.delivery_city,
          delivery_state: load.delivery_state,
          customers: load.customers as any,
          load_documents: (load.load_documents as any[]) || [],
        } : null}
        auditNotes={notes}
        rateConfirmationItems={rateConfirmation}
        billOfLadingItems={billOfLading}
      />
    </div>
  );
}
