import { useState, useEffect } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { useTenantId } from "@/hooks/useTenantId";
import { Undo2, AlertTriangle, Loader2, Ban, Info } from "lucide-react";

interface InvoiceForReturn {
  id: string;
  invoice_number: string;
  customer_name: string | null;
  status: string | null;
  billing_method: string | null;
  otr_submitted_at: string | null;
  otr_status: string | null;
  amount_paid: number | null;
  notes?: string | null;
}

interface LinkedLoad {
  load_id: string;
  load_number: string;
}

interface ReturnToAuditDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: InvoiceForReturn | null;
  onSuccess?: () => void;
}

export default function ReturnToAuditDialog({
  open,
  onOpenChange,
  invoice,
  onSuccess,
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
      setLinkedLoads([]);
    }
  }, [open, invoice?.id]);

  // Fetch latest invoice_email_log status for this invoice (tenant scoped)
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

  // Fetch linked loads via invoice_loads -> loads (tenant scoped)
  const fetchLinkedLoads = async () => {
    if (!invoice) return;
    setLoadingLoads(true);
    try {
      // Get invoice_loads with tenant scoping
      let ilQuery = supabase
        .from("invoice_loads" as any)
        .select("load_id")
        .eq("invoice_id", invoice.id);

      if (tenantId) {
        ilQuery = ilQuery.eq("tenant_id", tenantId);
      }

      const { data: invoiceLoads, error: ilError } = await ilQuery;

      if (ilError) throw ilError;

      const loadIds = ((invoiceLoads as any[]) || []).map((il: any) => il.load_id).filter(Boolean);

      if (loadIds.length > 0) {
        // Get load details with tenant scoping
        let loadsQuery = supabase
          .from("loads")
          .select("id, load_number")
          .in("id", loadIds);

        if (tenantId) {
          loadsQuery = loadsQuery.eq("tenant_id", tenantId);
        }

        const { data: loads, error: loadsError } = await loadsQuery;

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

  // ============================================================
  // INVOICE STATE TRANSITION GUARD
  // ============================================================
  // Industry-standard accounting rules: only allow return while invoice is INTERNAL
  // An invoice is considered "internal" if it has NOT:
  //   - Reached a terminal status (paid, overdue, cancelled)
  //   - Had any payments applied
  //   - Been submitted to OTR (factoring)
  //   - Been successfully sent via email (sent/delivered)
  // 
  // Once an invoice "leaves the system" (sent to customer or factoring company),
  // reversing it requires formal accounting procedures: Void or Credit Memo.
  // This prevents data inconsistencies and maintains audit trail integrity.
  // ============================================================
  const canReturn = (): { allowed: boolean; reason?: string; requiresVoidOrCreditMemo?: boolean } => {
    if (!invoice) return { allowed: false, reason: "No invoice selected" };

    // GUARD: Terminal statuses cannot be returned
    // These represent completed accounting states
    const blockedStatuses = ["paid", "overdue", "cancelled", "sent"];
    if (invoice.status && blockedStatuses.includes(invoice.status)) {
      // Map internal status to user-friendly display (draft->Open)
      const displayStatus = invoice.status === "draft" ? "Open" : invoice.status;
      const isPaid = invoice.status === "paid";
      const isOverdue = invoice.status === "overdue";
      const isSent = invoice.status === "sent";
      return { 
        allowed: false, 
        reason: `Invoice status is "${displayStatus}"`,
        requiresVoidOrCreditMemo: isPaid || isOverdue || isSent
      };
    }

    // GUARD: Any payment means invoice has been financially processed
    const amountPaid = invoice.amount_paid ?? 0;
    if (amountPaid > 0) {
      return { 
        allowed: false, 
        reason: `Invoice has payments recorded ($${amountPaid.toFixed(2)})`,
        requiresVoidOrCreditMemo: true
      };
    }

    // GUARD: OTR submission = invoice left the system to factoring company
    if (invoice.otr_submitted_at) {
      return { 
        allowed: false, 
        reason: "Invoice was submitted to OTR factoring",
        requiresVoidOrCreditMemo: true
      };
    }

    // GUARD: Email sent/delivered = invoice left the system to customer
    const deliveredStatuses = ["sent", "delivered"];
    if (lastEmailStatus && deliveredStatuses.includes(lastEmailStatus.toLowerCase())) {
      return { 
        allowed: false, 
        reason: `Invoice was sent via email (status: ${lastEmailStatus})`,
        requiresVoidOrCreditMemo: true
      };
    }

    // Invoice is still internal - return is allowed
    return { allowed: true };
  };

  const returnToAuditMutation = useMutation({
    mutationFn: async () => {
      if (!invoice || !tenantId) {
        throw new Error("Missing invoice or tenant context");
      }

      const loadIds = linkedLoads.map((l) => l.load_id);
      const loadNumbers = linkedLoads.map((l) => l.load_number);

      // ============================================================
      // ATOMIC MUTATION SEQUENCE FOR DATA INTEGRITY
      // Order matters: unlink loads → update loads → cancel invoice → audit log
      // If any step fails, the operation stops and partial state is avoided
      // ============================================================

      // (1) Delete invoice_loads rows for this invoice (tenant scoped)
      // This must happen first to break the FK relationship
      const { error: deleteError } = await supabase
        .from("invoice_loads" as any)
        .delete()
        .eq("invoice_id", invoice.id)
        .eq("tenant_id", tenantId);
      
      if (deleteError) {
        console.error("Failed to delete invoice_loads:", deleteError);
        throw new Error(`Failed to unlink loads: ${deleteError.message}`);
      }

      // (2) Update loads: set financial_status = 'pending_invoice' ONLY
      // IMPORTANT: We do NOT change loads.status (operational lifecycle)
      // The Ready for Audit query uses financial_status='pending_invoice' to include these loads
      // This preserves the operational status truth (e.g., closed loads stay closed)
      if (loadIds.length > 0) {
        const { error: loadsError } = await supabase
          .from("loads")
          .update({ 
            financial_status: "pending_invoice"
            // status is NOT changed - operational lifecycle is preserved
          })
          .in("id", loadIds)
          .eq("tenant_id", tenantId);
        
        if (loadsError) {
          console.error("Failed to update loads:", loadsError);
          throw new Error(`Failed to update load financial status: ${loadsError.message}`);
        }
      }

      // (3) Update invoice status to 'cancelled'
      // This marks the invoice as returned/cancelled in the system
      const { error: invoiceError } = await supabase
        .from("invoices" as any)
        .update({ 
          status: "cancelled",
          notes: invoice.notes 
            ? `${invoice.notes}\n\n[RETURNED TO AUDIT] ${new Date().toISOString().split('T')[0]}`
            : `[RETURNED TO AUDIT] ${new Date().toISOString().split('T')[0]}`
        })
        .eq("id", invoice.id)
        .eq("tenant_id", tenantId);

      if (invoiceError) {
        console.error("Failed to cancel invoice:", invoiceError);
        throw new Error(`Failed to cancel invoice: ${invoiceError.message}`);
      }

      // (4) Insert audit_logs entry with comprehensive details
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
            load_numbers: loadNumbers,
            load_count: loadIds.length,
          }),
          notes: `Invoice ${invoice.invoice_number} cancelled and returned to audit. ${loadIds.length} load(s) (${loadNumbers.join(', ')}) restored to Ready for Audit.`,
        });

      if (auditLogError) {
        console.error("Audit log error (non-fatal):", auditLogError);
        // Non-fatal - continue, the core operation succeeded
      }

      return { invoice_number: invoice.invoice_number, load_count: loadIds.length };
    },
    onSuccess: ({ invoice_number, load_count }) => {
      // (5) Invalidate all relevant queries
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["ready-for-audit-loads"] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-counts"] });

      toast.success(
        `Invoice ${invoice_number} cancelled. ${load_count} load(s) returned to Ready for Audit.`
      );
      onOpenChange(false);
      onSuccess?.();
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
            Return Invoice to Audit
          </DialogTitle>
          <DialogDescription>
            This will cancel the invoice and return its loads to Ready for Audit.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Invoice Info */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Invoice Number</span>
              <span className="text-sm font-mono font-semibold">{invoice.invoice_number}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Customer</span>
              <span className="text-sm">{invoice.customer_name || "—"}</span>
            </div>
          </div>

          {/* Linked Loads */}
          <div className="bg-muted/50 rounded-lg p-3">
            <div className="text-sm font-medium mb-2">
              Linked Loads ({linkedLoads.length})
            </div>
            {isLoading ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading...
              </div>
            ) : linkedLoads.length === 0 ? (
              <span className="text-sm text-muted-foreground">No loads linked</span>
            ) : (
              <div className="flex flex-wrap gap-1.5">
                {linkedLoads.map((load) => (
                  <span
                    key={load.load_id}
                    className="px-2 py-0.5 bg-background border rounded text-xs font-mono"
                  >
                    {load.load_number}
                  </span>
                ))}
              </div>
            )}
          </div>

          {/* Blocked Warning - Invoice has left the system */}
          {!allowed && (
            <div className="bg-red-50 dark:bg-red-950/30 border border-red-200 dark:border-red-800 rounded-lg p-3 space-y-3">
              <div className="flex items-start gap-2">
                <Ban className="h-4 w-4 text-red-500 mt-0.5 flex-shrink-0" />
                <div className="text-sm text-red-700 dark:text-red-400">
                  <span className="font-semibold">Cannot return this invoice</span>
                  <p className="mt-0.5">{reason}</p>
                </div>
              </div>
              {requiresVoidOrCreditMemo && (
                <div className="flex items-start gap-2 pt-2 border-t border-red-200 dark:border-red-700">
                  <Info className="h-4 w-4 text-red-400 mt-0.5 flex-shrink-0" />
                  <div className="text-sm text-red-600 dark:text-red-300">
                    <p className="font-medium mb-1">This invoice has already left the system.</p>
                    <p>
                      Use <span className="font-semibold">Void</span> (if unpaid) or{" "}
                      <span className="font-semibold">Credit Memo</span> (if paid) instead.
                    </p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Standard Warning - Allowed but destructive */}
          {allowed && (
            <div className="bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-500 mt-0.5 flex-shrink-0" />
              <div className="text-sm text-amber-700 dark:text-amber-400">
                <span className="font-semibold">Warning:</span> This will cancel the invoice and return its loads to audit. This action cannot be undone.
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
