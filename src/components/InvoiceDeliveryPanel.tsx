import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "sonner";
import { format, formatDistanceToNow } from "date-fns";
import { 
  Mail, DollarSign, Loader2, CheckCircle2, XCircle, 
  FileText, Package, AlertCircle, RefreshCw, Clock, Send, RotateCcw
} from "lucide-react";
import { useTenantId } from "@/hooks/useTenantId";

interface DocumentInfo {
  id: string;
  load_id: string;
  document_type: string;
  file_name: string | null;
  uploaded_at: string | null;
}

interface DeliveryInfo {
  billing_method: 'otr' | 'direct_email' | 'unknown';
  to_email: string | null;
  cc_email: string | null;
  rate_confirmations: DocumentInfo[];
  bills_of_lading: DocumentInfo[];
  customer_name: string | null;
}

interface SendLogEntry {
  id: string;
  created_at: string;
  status: string;
  to_email: string;
  cc: string | null;
  resend_message_id: string | null;
  error: string | null;
  attachments: {
    invoice?: boolean;
    rate_confirmation?: boolean;
    bill_of_lading?: boolean;
  } | null;
}

interface InvoiceDeliveryPanelProps {
  invoiceId: string;
  invoice: {
    id: string;
    invoice_number: string;
    status: string;
    billing_method: string;
    customer_id: string | null;
    sent_at: string | null;
    otr_submitted_at: string | null;
    tenant_id?: string;
  };
  onRefresh: () => void;
}

export function InvoiceDeliveryPanel({ invoiceId, invoice, onRefresh }: InvoiceDeliveryPanelProps) {
  const tenantId = useTenantId();
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [deliveryInfo, setDeliveryInfo] = useState<DeliveryInfo | null>(null);
  const [sendLogs, setSendLogs] = useState<SendLogEntry[]>([]);

  useEffect(() => {
    if (invoiceId && tenantId) {
      loadDeliveryInfo();
    }
  }, [invoiceId, tenantId]);

  const loadDeliveryInfo = async () => {
    setLoading(true);
    try {
      // Load customer for email
      let customerEmail: string | null = null;
      let customerBillingEmail: string | null = null;
      let customerName: string | null = null;
      
      if (invoice.customer_id) {
        const { data: customer } = await supabase
          .from("customers")
          .select("email, billing_email, name")
          .eq("id", invoice.customer_id)
          .single();
        
        if (customer) {
          customerEmail = customer.email;
          customerBillingEmail = (customer as any).billing_email;
          customerName = customer.name;
        }
      }

      // Load company profile for accounting email
      const { data: company } = await supabase
        .from("company_profile")
        .select("accounting_email")
        .eq("tenant_id", tenantId)
        .maybeSingle();

      // Load invoice_loads to get load IDs
      const { data: invoiceLoads } = await supabase
        .from("invoice_loads" as any)
        .select("load_id")
        .eq("invoice_id", invoiceId);

      const loadIds = invoiceLoads?.map((il: any) => il.load_id) || [];

      // Load documents with deduplication matching edge function logic
      // Order by created_at DESC to get newest first
      const rateConfirmations: DocumentInfo[] = [];
      const billsOfLading: DocumentInfo[] = [];

      if (loadIds.length > 0) {
        const { data: documents } = await supabase
          .from("load_documents")
          .select("id, load_id, document_type, file_name, uploaded_at")
          .in("load_id", loadIds)
          .in("document_type", ["rate_confirmation", "bill_of_lading", "pod"])
          .order("uploaded_at", { ascending: false });

        if (documents) {
          // Deduplicate: keep only newest RC and newest BOL/POD per load (matching edge function)
          const seenRcByLoad = new Set<string>();
          const seenBolByLoad = new Set<string>();

          for (const doc of documents) {
            const isRc = doc.document_type === "rate_confirmation";
            const isBol = doc.document_type === "bill_of_lading" || doc.document_type === "pod";
            
            if (isRc && !seenRcByLoad.has(doc.load_id)) {
              seenRcByLoad.add(doc.load_id);
              rateConfirmations.push(doc as DocumentInfo);
            } else if (isBol && !seenBolByLoad.has(doc.load_id)) {
              seenBolByLoad.add(doc.load_id);
              billsOfLading.push(doc as DocumentInfo);
            }
          }
        }
      }

      // Load send logs
      const { data: logs } = await supabase
        .from("invoice_email_log" as any)
        .select("*")
        .eq("invoice_id", invoiceId)
        .order("created_at", { ascending: false })
        .limit(10);

      setDeliveryInfo({
        billing_method: invoice.billing_method as 'otr' | 'direct_email' | 'unknown',
        to_email: customerBillingEmail || customerEmail,
        cc_email: company?.accounting_email || null,
        rate_confirmations: rateConfirmations,
        bills_of_lading: billsOfLading,
        customer_name: customerName,
      });

      setSendLogs((logs || []) as unknown as SendLogEntry[]);
    } catch (error) {
      console.error("Error loading delivery info:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleSendDirectEmail = async () => {
    if (!tenantId) {
      toast.error("No tenant selected");
      return;
    }

    setSending(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke('send-invoice-email', {
        body: {
          tenant_id: tenantId,
          invoice_id: invoiceId,
        },
        headers: {
          Authorization: `Bearer ${session?.session?.access_token}`
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to send invoice email');
      }

      const result = response.data;
      if (result.success) {
        toast.success(`Invoice sent to ${result.to_email}`);
        if (result.warnings && result.warnings.length > 0) {
          result.warnings.forEach((warning: string) => {
            toast.warning(warning);
          });
        }
        loadDeliveryInfo();
        onRefresh();
      } else {
        toast.error(result.error || 'Failed to send invoice email');
        loadDeliveryInfo();
      }
    } catch (error: any) {
      console.error('Direct email error:', error);
      toast.error("Failed to send invoice: " + error.message);
      loadDeliveryInfo();
    } finally {
      setSending(false);
    }
  };

  const handleSubmitToOtr = async () => {
    if (!tenantId) {
      toast.error("No tenant selected");
      return;
    }

    setSending(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      const response = await supabase.functions.invoke('submit-otr-invoice', {
        body: {
          tenant_id: tenantId,
          invoice_id: invoiceId,
        },
        headers: {
          Authorization: `Bearer ${session?.session?.access_token}`
        }
      });

      if (response.error) {
        throw new Error(response.error.message || 'Failed to submit invoice');
      }

      const result = response.data;
      if (result.success) {
        toast.success(result.message || 'Invoice submitted to OTR');
        onRefresh();
      } else {
        toast.error(result.error || 'Failed to submit invoice to OTR');
      }
    } catch (error: any) {
      console.error('OTR submission error:', error);
      toast.error("Failed to submit to OTR: " + error.message);
    } finally {
      setSending(false);
    }
  };

  const canSendDirectEmail = () => {
    if (!deliveryInfo) return { can: false, reason: "Loading..." };
    if (invoice.billing_method !== 'direct_email') return { can: false, reason: "Not direct email method" };
    if (invoice.status === 'sent' || invoice.status === 'paid') return { can: false, reason: "Already sent" };
    if (!deliveryInfo.to_email) return { can: false, reason: "No customer email" };
    if (!deliveryInfo.cc_email) return { can: false, reason: "No accounting email in company profile" };
    if (deliveryInfo.rate_confirmations.length === 0) return { can: false, reason: "Missing Rate Confirmation" };
    if (deliveryInfo.bills_of_lading.length === 0) return { can: false, reason: "Missing BOL/POD" };
    return { can: true, reason: null };
  };

  const handleRetry = (logId: string) => {
    // Retry is same as send - just trigger send again
    handleSendDirectEmail();
  };

  const canSubmitOtr = () => {
    if (!deliveryInfo) return { can: false, reason: "Loading..." };
    if (invoice.billing_method !== 'otr') return { can: false, reason: "Not OTR method" };
    if (invoice.otr_submitted_at) return { can: false, reason: "Already submitted" };
    return { can: true, reason: null };
  };

  const lastAttempt = sendLogs[0];
  const sendCheck = canSendDirectEmail();
  const otrCheck = canSubmitOtr();

  if (loading) {
    return (
      <Card>
        <CardContent className="py-8 text-center">
          <Loader2 className="h-6 w-6 animate-spin mx-auto text-muted-foreground" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Send className="h-5 w-5 text-blue-600" />
          Delivery Panel
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Billing Method */}
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium">Billing Method</span>
          {invoice.billing_method === 'otr' ? (
            <Badge className="bg-amber-500 hover:bg-amber-600 text-white">OTR Factoring</Badge>
          ) : invoice.billing_method === 'direct_email' ? (
            <Badge variant="secondary">Direct Email</Badge>
          ) : (
            <Badge variant="outline">Unknown</Badge>
          )}
        </div>

        <Separator />

        {/* Email Info - only for direct_email */}
        {invoice.billing_method === 'direct_email' && (
          <>
            <div className="space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">To:</span>
                <span className={deliveryInfo?.to_email ? "font-medium" : "text-destructive"}>
                  {deliveryInfo?.to_email || "Not set"}
                </span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span className="text-muted-foreground">CC (Accounting):</span>
                <span className={deliveryInfo?.cc_email ? "font-medium" : "text-destructive"}>
                  {deliveryInfo?.cc_email || "Not set"}
                </span>
              </div>
            </div>

            <Separator />
          </>
        )}

        {/* Attachments Checklist */}
        <TooltipProvider>
          <div className="space-y-2">
            <span className="text-sm font-medium">Attachments</span>
            <div className="grid grid-cols-3 gap-2">
              {/* Invoice - always generated by edge function */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-sm cursor-help">
                    <CheckCircle2 className="h-4 w-4 text-green-600" />
                    <span>Invoice</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  <p className="text-xs">Invoice HTML generated on send</p>
                </TooltipContent>
              </Tooltip>

              {/* Rate Confirmation */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-sm cursor-help">
                    {deliveryInfo && deliveryInfo.rate_confirmations.length > 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span>RC</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {deliveryInfo && deliveryInfo.rate_confirmations.length > 0 ? (
                    <div className="space-y-1">
                      {deliveryInfo.rate_confirmations.map((doc) => (
                        <p key={doc.id} className="text-xs">
                          {doc.file_name || 'rate_confirmation.pdf'}
                          <br />
                          <span className="text-muted-foreground">
                            {doc.uploaded_at ? format(new Date(doc.uploaded_at), "M/d/yy h:mm a") : '—'}
                          </span>
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs">No Rate Confirmation uploaded</p>
                  )}
                </TooltipContent>
              </Tooltip>

              {/* BOL/POD */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1.5 text-sm cursor-help">
                    {deliveryInfo && deliveryInfo.bills_of_lading.length > 0 ? (
                      <CheckCircle2 className="h-4 w-4 text-green-600" />
                    ) : (
                      <XCircle className="h-4 w-4 text-destructive" />
                    )}
                    <span>BOL/POD</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent>
                  {deliveryInfo && deliveryInfo.bills_of_lading.length > 0 ? (
                    <div className="space-y-1">
                      {deliveryInfo.bills_of_lading.map((doc) => (
                        <p key={doc.id} className="text-xs">
                          {doc.file_name || 'bol.pdf'}
                          <br />
                          <span className="text-muted-foreground">
                            {doc.uploaded_at ? format(new Date(doc.uploaded_at), "M/d/yy h:mm a") : '—'}
                          </span>
                        </p>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs">No BOL/POD uploaded</p>
                  )}
                </TooltipContent>
              </Tooltip>
            </div>
          </div>
        </TooltipProvider>

        <Separator />

        {/* Last Attempt */}
        {lastAttempt && (
          <>
            <div className="space-y-2">
              <span className="text-sm font-medium">Last Send Attempt</span>
              <div className="p-3 rounded-lg bg-muted/50 space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Status</span>
                  {lastAttempt.status === 'sent' ? (
                    <Badge className="bg-green-600 text-xs">Sent</Badge>
                  ) : (
                    <Badge variant="destructive" className="text-xs">Failed</Badge>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-muted-foreground">Time</span>
                  <span className="text-xs">{formatDistanceToNow(new Date(lastAttempt.created_at), { addSuffix: true })}</span>
                </div>
                {lastAttempt.resend_message_id && (
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Message ID</span>
                    <span className="text-xs font-mono truncate max-w-[140px]" title={lastAttempt.resend_message_id}>
                      {lastAttempt.resend_message_id.slice(0, 12)}...
                    </span>
                  </div>
                )}
                {lastAttempt.error && (
                  <div className="mt-2 p-2 rounded bg-destructive/10 text-destructive text-xs">
                    {lastAttempt.error}
                  </div>
                )}
              </div>
            </div>
            <Separator />
          </>
        )}

        {/* Action Buttons */}
        <div className="space-y-2">
          {/* Direct Email Button */}
          {invoice.billing_method === 'direct_email' && (
            <div>
              <Button
                onClick={handleSendDirectEmail}
                disabled={!sendCheck.can || sending}
                className="w-full bg-blue-600 hover:bg-blue-700"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <Mail className="h-4 w-4 mr-2" />
                )}
                {lastAttempt?.status === 'failed' ? 'Retry Send' : 'Send Direct Email'}
              </Button>
              {!sendCheck.can && sendCheck.reason && (
                <p className="text-xs text-destructive mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {sendCheck.reason}
                </p>
              )}
            </div>
          )}

          {/* OTR Button */}
          {invoice.billing_method === 'otr' && (
            <div>
              <Button
                onClick={handleSubmitToOtr}
                disabled={!otrCheck.can || sending}
                className="w-full bg-amber-600 hover:bg-amber-700"
              >
                {sending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <DollarSign className="h-4 w-4 mr-2" />
                )}
                Submit to OTR
              </Button>
              {!otrCheck.can && otrCheck.reason && (
                <p className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <AlertCircle className="h-3 w-3" />
                  {otrCheck.reason}
                </p>
              )}
            </div>
          )}
        </div>

        {/* Send History */}
        {sendLogs.length > 0 && (
          <>
            <Separator />
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium">Send History</span>
                <Button variant="ghost" size="sm" onClick={loadDeliveryInfo}>
                  <RefreshCw className="h-3 w-3" />
                </Button>
              </div>
              <div className="max-h-[250px] overflow-y-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs py-2">Time</TableHead>
                      <TableHead className="text-xs py-2">Status</TableHead>
                      <TableHead className="text-xs py-2">Details</TableHead>
                      <TableHead className="text-xs py-2"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {sendLogs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell className="text-xs py-1.5">
                          {format(new Date(log.created_at), "M/d HH:mm")}
                        </TableCell>
                        <TableCell className="py-1.5">
                          {log.status === 'sent' ? (
                            <Badge className="bg-green-600 text-[10px] px-1.5 py-0">Sent</Badge>
                          ) : (
                            <Badge variant="destructive" className="text-[10px] px-1.5 py-0">Failed</Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-xs py-1.5 max-w-[140px]">
                          {log.status === 'sent' && log.resend_message_id ? (
                            <span 
                              className="font-mono text-[10px] text-muted-foreground truncate block" 
                              title={log.resend_message_id}
                            >
                              ID: {log.resend_message_id.slice(0, 10)}...
                            </span>
                          ) : log.error ? (
                            <span 
                              className="text-destructive text-[10px] truncate block" 
                              title={log.error}
                            >
                              {log.error.slice(0, 30)}{log.error.length > 30 ? '...' : ''}
                            </span>
                          ) : (
                            <span className="text-muted-foreground text-[10px]">—</span>
                          )}
                        </TableCell>
                        <TableCell className="py-1.5">
                          {log.status === 'failed' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-6 px-2 text-xs"
                              onClick={() => handleRetry(log.id)}
                              disabled={sending}
                            >
                              <RotateCcw className="h-3 w-3 mr-1" />
                              Retry
                            </Button>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
