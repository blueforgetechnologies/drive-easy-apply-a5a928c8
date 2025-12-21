import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, ArrowLeft, FileText, Download, ExternalLink, Loader2 } from "lucide-react";
import { format } from "date-fns";
import { toast } from "sonner";
import { Skeleton } from "@/components/ui/skeleton";
import { PDFImageViewer } from "@/components/PDFImageViewer";

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

  // Organize documents by type
  const documents = load.load_documents as any[] || [];
  const rateConfirmationDocs = documents.filter((doc: any) => doc.document_type === 'rate_confirmation');
  const bolDocs = documents.filter((doc: any) => doc.document_type === 'bill_of_lading');

  // Document Viewer Component that handles signed URLs
  const DocumentViewer = ({ doc }: { doc: any }) => {
    const [signedUrl, setSignedUrl] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
      const getSignedUrl = async () => {
        if (!doc?.file_url) {
          setLoading(false);
          return;
        }
        
        try {
          setLoading(true);
          setError(null);
          
          // If it's already a full URL, use it directly
          if (doc.file_url.startsWith('http://') || doc.file_url.startsWith('https://')) {
            setSignedUrl(doc.file_url);
            setLoading(false);
            return;
          }
          
          // Get signed URL from storage (1 hour expiry)
          const { data, error: urlError } = await supabase.storage
            .from('load-documents')
            .createSignedUrl(doc.file_url, 3600);
          
          if (urlError) throw urlError;
          setSignedUrl(data.signedUrl);
        } catch (err: any) {
          console.error('Error getting signed URL:', err);
          setError(err.message || 'Failed to load document');
        } finally {
          setLoading(false);
        }
      };
      
      getSignedUrl();
    }, [doc?.file_url]);

    if (!doc?.file_url) return null;
    
    const fileName = doc.file_name?.toLowerCase() || '';
    const isImage = fileName.endsWith('.jpg') || fileName.endsWith('.jpeg') || fileName.endsWith('.png') || fileName.endsWith('.gif') || fileName.endsWith('.webp');
    const isPdf = fileName.endsWith('.pdf');

    if (loading) {
      return (
        <div className="flex flex-col h-[1950px]">
          <div className="flex-1 flex items-center justify-center">
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <p className="text-xs text-muted-foreground">Loading document...</p>
            </div>
          </div>
        </div>
      );
    }

    if (error || !signedUrl) {
      return (
        <div className="flex flex-col h-[1950px]">
          <div className="flex-1 flex flex-col items-center justify-center gap-2">
            <FileText className="h-8 w-8 text-muted-foreground opacity-50" />
            <p className="text-xs text-destructive">{error || 'Failed to load document'}</p>
          </div>
        </div>
      );
    }
    
    return (
      <div className="flex flex-col h-[1950px]">
        <div className="flex-1 border rounded bg-muted overflow-hidden">
          {isPdf ? (
            <PDFImageViewer url={signedUrl} fileName={doc.file_name || 'Document.pdf'} />
          ) : isImage ? (
            <div className="h-full overflow-auto p-2 flex items-start justify-center">
              <img
                src={signedUrl}
                alt={doc.file_name || 'Document'}
                className="max-w-full h-auto shadow-lg"
              />
            </div>
          ) : (
            <iframe
              src={signedUrl}
              title={doc.file_name || 'Document'}
              className="w-full h-full"
              style={{ border: 'none' }}
            />
          )}
        </div>
      </div>
    );
  };

  const renderNoDocument = (type: string) => (
    <div className="flex flex-col items-center justify-center h-[1560px] text-muted-foreground">
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

      {/* Header */}
      <div className="border rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-l-4 border-l-primary">
              <th className="text-left px-2 py-1 text-primary font-medium text-[11px] uppercase">Our Load ID</th>
              <th className="text-left px-2 py-1 text-primary font-medium text-[11px] uppercase">Carrier</th>
              <th className="text-left px-2 py-1 text-primary font-medium text-[11px] uppercase">Origin</th>
              <th className="text-left px-2 py-1 text-primary font-medium text-[11px] uppercase">Pick Up</th>
              <th className="text-left px-2 py-1 text-primary font-medium text-[11px] uppercase">Rate</th>
              <th className="text-left px-2 py-1 text-primary font-medium text-[11px] uppercase">Load Owner</th>
              <th className="text-left px-2 py-1 text-primary font-medium text-[11px] uppercase">Truck ID</th>
            </tr>
            <tr className="border-l-4 border-l-primary">
              <th className="text-left px-2 pb-1 text-primary font-medium text-[11px] uppercase">Customer Load</th>
              <th className="text-left px-2 pb-1 text-primary font-medium text-[11px] uppercase">Customer</th>
              <th className="text-left px-2 pb-1 text-primary font-medium text-[11px] uppercase">Destination</th>
              <th className="text-left px-2 pb-1 text-primary font-medium text-[11px] uppercase">Drop Off Date</th>
              <th className="px-2 pb-1"></th>
              <th className="text-left px-2 pb-1 text-primary font-medium text-[11px] uppercase">Dispatcher</th>
              <th className="text-left px-2 pb-1 text-primary font-medium text-[11px] uppercase">Driver</th>
            </tr>
          </thead>
          <tbody>
            <tr className="border-t">
              <td className="px-2 py-1.5 align-top">
                <div className="font-medium text-sm">{load.load_number}</div>
                <div className="text-muted-foreground text-xs">{load.reference_number || ""}</div>
              </td>
              <td className="px-2 py-1.5 align-top">
                <div className="font-semibold text-sm">{carrier?.name || ""}</div>
                <div className="text-muted-foreground text-xs">{customer?.name || ""}</div>
              </td>
              <td className="px-2 py-1.5 align-top">
                <div className="text-sm">{load.pickup_city ? `${load.pickup_city}, ${load.pickup_state || ""}` : ""}</div>
                <div className="text-muted-foreground text-xs">
                  {load.delivery_city ? `${load.delivery_city}, ${load.delivery_state || ""}` : ""}
                </div>
              </td>
              <td className="px-2 py-1.5 align-top">
                <div className="text-sm">{formatDate(load.pickup_date)}</div>
                <div className="text-muted-foreground text-xs">{formatDate(load.delivery_date)}</div>
              </td>
              <td className="px-2 py-1.5 align-top">
                <div className="font-medium text-sm">{formatCurrency(load.rate)}</div>
              </td>
              <td className="px-2 py-1.5 align-top">
                <div className="font-medium text-sm">{loadOwnerName}</div>
                <div className="text-muted-foreground text-xs">{dispatcherName}</div>
              </td>
              <td className="px-2 py-1.5 align-top">
                <div className="font-medium text-sm">{vehicle?.vehicle_number || ""}</div>
                <div className="text-muted-foreground text-xs">{getDriverName(load.driver)}</div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Main Content */}
      <div className="flex gap-4">
        {/* Left Sidebar */}
        <div className="w-72 flex-shrink-0 space-y-3">
          {/* Navigation */}
          <div className="flex items-center gap-1 text-primary">
            <button 
              onClick={() => navigateToLoad(0)} 
              disabled={currentIndex <= 0}
              className="hover:bg-muted p-0.5 rounded disabled:opacity-30"
            >
              <ChevronsLeft className="h-3.5 w-3.5" />
            </button>
            <button 
              onClick={() => navigateToLoad(currentIndex - 1)} 
              disabled={currentIndex <= 0}
              className="hover:bg-muted p-0.5 rounded disabled:opacity-30"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </button>
            <span className="text-sm">
              {currentIndex + 1}/{totalLoads}
            </span>
            <button 
              onClick={() => navigateToLoad(currentIndex + 1)} 
              disabled={currentIndex >= totalLoads - 1}
              className="hover:bg-muted p-0.5 rounded disabled:opacity-30"
            >
              <ChevronRight className="h-3.5 w-3.5" />
            </button>
            <button 
              onClick={() => navigateToLoad(totalLoads - 1)} 
              disabled={currentIndex >= totalLoads - 1}
              className="hover:bg-muted p-0.5 rounded disabled:opacity-30"
            >
              <ChevronsRight className="h-3.5 w-3.5" />
            </button>
          </div>

          {/* Rate Confirmation Checklist */}
          <div className="space-y-1">
            <h3 className="text-primary font-semibold text-sm">Rate Confirmation</h3>
            {rateConfirmation.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-0.5">
                <span className="text-xs text-muted-foreground">{item.label}</span>
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
          <div className="space-y-1">
            <h3 className="text-primary font-semibold text-sm">Bill of lading</h3>
            {billOfLading.map((item) => (
              <div key={item.id} className="flex items-center justify-between py-0.5">
                <span className="text-xs text-muted-foreground">{item.label}</span>
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
        <div className="flex-1 border rounded-lg overflow-hidden">
          <Tabs defaultValue="rate_confirmation" className="w-full h-full flex flex-col">
            <TabsList className="w-full justify-start rounded-none border-b bg-muted/30 h-auto p-0 flex-shrink-0">
              <TabsTrigger 
                value="rate_confirmation" 
                className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-white px-6 py-3"
              >
                Rate Confirmation {rateConfirmationDocs.length > 0 && `(${rateConfirmationDocs.length})`}
              </TabsTrigger>
              {bolDocs.map((doc, index) => (
                <TabsTrigger 
                  key={doc.id}
                  value={`bol_${index}`}
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-white px-6 py-3"
                >
                  Bill of Lading {index + 1}
                </TabsTrigger>
              ))}
              {bolDocs.length === 0 && (
                <TabsTrigger 
                  value="bol_empty"
                  className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-primary data-[state=active]:text-white px-6 py-3"
                >
                  Bill of Lading
                </TabsTrigger>
              )}
            </TabsList>
            <TabsContent value="rate_confirmation" className="p-4 flex-1 overflow-auto">
              {rateConfirmationDocs.length > 0 
                ? <DocumentViewer doc={rateConfirmationDocs[0]} />
                : renderNoDocument('Rate Confirmation')
              }
            </TabsContent>
            {bolDocs.map((doc, index) => (
              <TabsContent key={doc.id} value={`bol_${index}`} className="p-4 flex-1 overflow-auto">
                <DocumentViewer doc={doc} />
              </TabsContent>
            ))}
            {bolDocs.length === 0 && (
              <TabsContent value="bol_empty" className="p-4 flex-1 overflow-auto">
                {renderNoDocument('Bill of Lading')}
              </TabsContent>
            )}
          </Tabs>
        </div>
      </div>
    </div>
  );
}
