import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useTenantId } from "@/hooks/useTenantId";
import { Undo2, AlertTriangle, Loader2 } from "lucide-react";

interface InvoiceForReturn {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  status: string | null;
  billing_method: string | null;
  otr_submitted_at: string | null;
  otr_status: string | null;
  amount_paid: number | null;
}

interface LinkedLoad {
  load_id: string;
  load_number: string;
}

interface ReturnToAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceForReturn | null;
}

export default function ReturnToAuditDialog({
  open,
  onOpenChange,
  invoice,
}: ReturnToAuditDialogProps) {
  const queryClient = useQueryClient();
  const tenantId = useTenantId();
  const [linkedLoads, setLinkedLoads] = useState<LinkedLoad[]>([]);
  const [loadingLoads, setLoadingLoads] = useState(false);
  const [lastEmailStatus, setLastEmailStatus] = useState<string | null>(null);
  const [loadingEmailStatus, setLoadingEmailStatus] = useState(false);

  // Fetch linked loads and latest email status when dialog opens
  useEffect(() => {
    if (open && invoice) {
      fetchLinkedLoads();
      fetchLatestEmailStatus();
    } else {
      // Reset state when dialog closes
      setLastEmailStatus(null);
    }
  }, [open, invoice?.id]);

  // Fetch latest invoice_email_log status for this invoice
  const fetchLatestEmailStatus = async () => {
    if (!invoice) return;
    setLoadingEmailStatus(true);
    try {
      let query = supabase
        .from("invoice_email_log")
        .select("status, created_at")
        .eq("invoice_id", invoice.id)
        .order("created_at", { ascending: false })
        .limit(1);

      // Add tenant_id filter if available
      if (tenantId) {
        query = query.eq("tenant_id", tenantId);
      }

      const { data, error } = await query;

      if (error) {
        console.error("Error fetching email log status:", error);
        setLastEmailStatus(null);
      } else if (data && data.length > 0) {
        setLastEmailStatus(data[0].status);
      } else {
        setLastEmailStatus(null);
      }
    } catch (error) {
      console.error("Error fetching email log status:", error);
      setLastEmailStatus(null);
    } finally {
      setLoadingEmailStatus(false);
    }
  };

  const fetchLinkedLoads = async () => {
    if (!invoice) return;
    setLoadingLoads(true);
    try {
      // Get invoice_loads
      const { data: invoiceLoads, error: ilError } = await supabase
        .from("invoice_loads" as any)
        .select("load_id")
        .eq("invoice_id", invoice.id);

      if (ilError) throw ilError;

      const loadIds = ((invoiceLoads as any[]) || []).map((il: any) => il.load_id).filter(Boolean);

      if (loadIds.length > 0) {
        const { data: loads, error: loadsError } = await supabase
          .from("loads")
          .select("id, load_number")
          .in("id", loadIds);

        if (loadsError) throw loadsError;

        setLinkedLoads(
          ((loads as any[]) || []).map((l: any) => ({
            load_id: l.id,
            load_number: l.load_number,
          }))
        );
      } else {
        setLinkedLoads([]);
      }
    } catch (error) {
      console.error("Error fetching linked loads:", error);
      setLinkedLoads([]);
    } finally {
      setLoadingLoads(false);
    }
  };

  // Compute if return is allowed based on guardrails
  // Returns: allowed, reason, and whether invoice has "left the system" (requires void/credit memo)
  const canReturn = (): { allowed: boolean; reason?: string; requiresVoidOrCreditMemo?: boolean } => {
    if (!invoice) return { allowed: false, reason: "No invoice selected" };

    // Check status - paid/overdue/cancelled are terminal states
    const blockedStatuses = ["paid", "overdue", "cancelled"];
    if (invoice.status && blockedStatuses.includes(invoice.status)) {
      const isPaid = invoice.status === "paid";
      const isOverdue = invoice.status === "overdue";
      return { 
        allowed: false, 
        reason: `Invoice is ${invoice.status}`,
        requiresVoidOrCreditMemo: isPaid || isOverdue
      };
    }

    // Check OTR submission - invoice has left the system
    if (invoice.otr_submitted_at) {
      return { 
        allowed: false, 
        reason: "Invoice already submitted to OTR",
        requiresVoidOrCreditMemo: true
      };
    }

    // Check if email was sent/delivered - invoice has left the system
    const deliveredStatuses = ["sent", "delivered"];
    if (lastEmailStatus && deliveredStatuses.includes(lastEmailStatus)) {
      return { 
        allowed: false, 
        reason: "Invoice already sent via email",
        requiresVoidOrCreditMemo: true
      };
    }

    // Check amount_paid - any payment means invoice has been processed
    const amountPaid = invoice.amount_paid ?? 0;
    if (amountPaid > 0) {
      return { 
        allowed: false, 
        reason: "Invoice has payments recorded",
        requiresVoidOrCreditMemo: true
      };
    }

    return { allowed: true };
  };

  const returnToAuditMutation = useMutation({
    mutationFn: async () => {
      if (!invoice || !tenantId) {
        throw new Error("Missing invoice or tenant context");
      }

      const loadIds = linkedLoads.map((l) => l.load_id);

      // Operations ordered for data integrity:
      // (1) Block checks already done in canReturn()
      
      // (2) Delete invoice_loads linkage first (with tenant scoping)
      const deleteQuery = supabase
        .from("invoice_loads" as any)
        .delete()
        .eq("invoice_id", invoice.id);
      
      // Add tenant_id filter if the table supports it
      if (tenantId) {
        deleteQuery.eq("tenant_id", tenantId);
      }
      
      const { error: deleteError } = await deleteQuery;
      if (deleteError) throw deleteError;

      // (3) Update loads: ONLY set financial_status to 'pending_invoice'
      // Do NOT mutate loads.status - that's lifecycle truth
      if (loadIds.length > 0) {
        const loadsQuery = supabase
          .from("loads")
          .update({ financial_status: "pending_invoice" })
          .in("id", loadIds);
        
        // Add tenant scoping
        if (tenantId) {
          loadsQuery.eq("tenant_id", tenantId);
        }
        
        const { error: loadsError } = await loadsQuery;
        if (loadsError) throw loadsError;
      }

      // (4) Update invoice status to 'cancelled'
      const { error: invoiceError } = await supabase
        .from("invoices" as any)
        .update({ status: "cancelled" })
        .eq("id", invoice.id);

      if (invoiceError) throw invoiceError;

      // (5) Insert audit log
      const { error: auditLogError } = await supabase
        .from("audit_logs")
        .insert({
          tenant_id: tenantId,
          entity_type: "invoice",
          entity_id: invoice.id,
          action: "invoice_return_to_audit",
          new_value: JSON.stringify({
            invoice_number: invoice.invoice_number,
            load_ids: loadIds,
          }),
          notes: `Invoice ${invoice.invoice_number} returned to audit. ${loadIds.length} load(s) moved back to Ready for Audit.`,
        });

      if (auditLogError) {
        console.error("Audit log error (non-fatal):", auditLogError);
      }

      return { invoice_number: invoice.invoice_number, load_count: loadIds.length };
    },
    onSuccess: ({ invoice_number, load_count }) => {
      // E) Refresh UI
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["ready-for-audit-loads"] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-counts"] });

      toast.success(
        `Invoice ${invoice_number} cancelled. ${load_count} load(s) returned to Ready for Audit.`
      );
      onOpenChange(false);
    },
    onError: (error) => {
      console.error("Return to audit error:", error);
      toast.error(
        `Failed to return invoice: ${error instanceof Error ? error.message : "Unknown error"}`
      );
    },
  });

  const handleConfirm = () => {
    const { allowed, reason } = canReturn();
    if (!allowed) {
      toast.error(reason || "Cannot return this invoice");
      return;
    }
    returnToAuditMutation.mutate();
  };

  const { allowed, reason, requiresVoidOrCreditMemo } = canReturn();
  const isLoading = loadingLoads || loadingEmailStatus;

  if (!invoice) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Undo2 className="h-5 w-5 text-amber-500" />
            Return Invoice to Audit?
          </DialogTitle>
          <DialogDescription>
            This will cancel the invoice and move its loads back to Ready for Audit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Invoice Info */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Invoice</span>
              <span className="text-sm font-mono">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Customer</span>
              <span className="text-sm">{invoice.customer_name || "—"}</span>
            </div>
          </div>

          {/* Linked Loads */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-sm font-medium mb-2">
              Loads to Return ({linkedLoads.length})
            </div>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : linkedLoads.length === 0 ? (
              <span className="text-sm text-muted-foreground">No loads linked</span>
            ) : (
              <div className="flex flex-wrap gap-1">
                {linkedLoads.map((load) => (
                  <span
                    key={load.load_id}
                    className="px-2 py-0.5 bg-background rounded text-xs font-mono"
                  >
                    {load.load_number}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Warning if not allowed */}
          {!allowed && (
            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-800 rounded-lg p-3 space-y-2">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-700 dark:text-red-400">
                  <span className="font-medium">Cannot return this invoice:</span>{" "}
                  {reason}
                </div>
              </div>
              {requiresVoidOrCreditMemo && (
                <div className="text-sm text-muted-foreground pl-6">
                  This invoice was already sent. Use <span className="font-medium">Void</span> or{" "}
                  <span className="font-medium">Credit Memo</span> instead.
                </div>
              )}
            </div>
          )}

          {/* Warning box */}
          {allowed && (
            <div className="bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-700 dark:text-amber-400">
                This action cannot be undone. The invoice will be marked as cancelled.
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={handleConfirm}
            disabled={!allowed || returnToAuditMutation.isPending || isLoading}
            className="gap-2"
          >
            {returnToAuditMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Returning...
              </>
            ) : (
              <>
                <Undo2 className="h-4 w-4" />
                Return to Audit
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
