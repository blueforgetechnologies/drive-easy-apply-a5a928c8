import { useState, useMemo } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import { useTenantId } from "@/hooks/useTenantId";
import { Receipt, AlertTriangle, CheckCircle2, XCircle, ShieldAlert } from "lucide-react";
import { format, addDays } from "date-fns";

interface LoadData {
  id: string;
  load_number: string;
  reference_number?: string;
  rate?: number;
  customer_id?: string;
  pickup_city?: string;
  pickup_state?: string;
  delivery_city?: string;
  delivery_state?: string;
  customers?: { 
    name?: string;
    email?: string;
    billing_email?: string;
    otr_approval_status?: string;
    factoring_approval?: string;
  };
  load_documents?: Array<{ document_type: string }>;
}

interface VerificationItem {
  id: string;
  label: string;
  status: "match" | "fail" | null;
}

interface AuditCreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  load: LoadData | null;
  auditNotes?: string;
  /** Rate Confirmation verification items from the audit sidebar */
  rateConfirmationItems?: VerificationItem[];
  /** Bill of Lading verification items from the audit sidebar */
  billOfLadingItems?: VerificationItem[];
}

export default function AuditCreateInvoiceDialog({
  open,
  onOpenChange,
  load,
  auditNotes = "",
  rateConfirmationItems = [],
  billOfLadingItems = [],
}: AuditCreateInvoiceDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  const [overrideConfirmed, setOverrideConfirmed] = useState(false);
  const [overrideReason, setOverrideReason] = useState("");

  const today = format(new Date(), "yyyy-MM-dd");
  const defaultDueDate = format(addDays(new Date(), 30), "yyyy-MM-dd");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(defaultDueDate);

  // Combine all verification items
  const allVerificationItems = useMemo(() => {
    return [...rateConfirmationItems, ...billOfLadingItems];
  }, [rateConfirmationItems, billOfLadingItems]);

  // Determine verification state
  const verificationState = useMemo(() => {
    if (allVerificationItems.length === 0) {
      // No verification items provided = incomplete/unknown
      return "incomplete";
    }
    
    const hasAnyFail = allVerificationItems.some(item => item.status === "fail");
    const hasAnyNull = allVerificationItems.some(item => item.status === null);
    const allMatch = allVerificationItems.every(item => item.status === "match");
    
    if (allMatch) return "all_match";
    if (hasAnyFail) return "has_failures";
    if (hasAnyNull) return "incomplete";
    return "incomplete";
  }, [allVerificationItems]);

  // Get failed items for display
  const failedItems = useMemo(() => {
    return allVerificationItems.filter(item => item.status === "fail");
  }, [allVerificationItems]);

  // Get incomplete items for display
  const incompleteItems = useMemo(() => {
    return allVerificationItems.filter(item => item.status === null);
  }, [allVerificationItems]);

  // Determine if we can proceed
  const canProceed = useMemo(() => {
    if (verificationState === "all_match") {
      return true; // Simple confirm, no checklist needed
    }
    // For failures or incomplete, require override confirmation
    return overrideConfirmed && overrideReason.trim().length > 0;
  }, [verificationState, overrideConfirmed, overrideReason]);

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!load || !tenantId) {
        throw new Error("Missing load or tenant context");
      }

      const customer = load.customers;
      let createdInvoiceId: string | null = null;
      let createdInvoiceNumber: string | null = null;
      
      // Build notes with override reason if applicable
      let finalNotes = auditNotes || "";
      if (verificationState !== "all_match" && overrideReason.trim()) {
        const overrideNote = `[OVERRIDE] ${overrideReason.trim()}`;
        finalNotes = finalNotes ? `${finalNotes}\n\n${overrideNote}` : overrideNote;
      }

      // ============================================================
      // STEP 1: Generate invoice number (atomic via RPC)
      // ============================================================
      toast.loading("Generating invoice number...", { id: "audit-invoice" });
      
      const { data: invoiceNumber, error: rpcError } = await supabase
        .rpc("next_invoice_number", { p_tenant_id: tenantId });

      if (rpcError || !invoiceNumber) {
        console.error("Invoice number RPC error:", rpcError);
        toast.error("Step 1 failed: Could not generate invoice number", { id: "audit-invoice" });
        throw new Error("Could not generate invoice number");
      }
      
      createdInvoiceNumber = String(invoiceNumber);

      // ============================================================
      // STEP 2: Create invoice record (status='draft')
      // ============================================================
      toast.loading("Creating invoice record...", { id: "audit-invoice" });
      
      const invoiceData = {
        tenant_id: tenantId,
        invoice_number: createdInvoiceNumber,
        customer_id: load.customer_id,
        customer_name: customer?.name || "Unknown",
        customer_email: customer?.billing_email || customer?.email || "",
        invoice_date: invoiceDate,
        due_date: dueDate,
        payment_terms: "Net 30",
        status: "draft", // Internal status; UI displays "Open"
        subtotal: load.rate || 0,
        tax: 0,
        total_amount: load.rate || 0,
        amount_paid: 0,
        balance_due: load.rate || 0,
        notes: finalNotes || null,
      };

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices" as any)
        .insert(invoiceData)
        .select()
        .single();

      if (invoiceError || !invoice) {
        console.error("Invoice creation error:", invoiceError);
        toast.error("Step 2 failed: Could not create invoice record", { id: "audit-invoice" });
        throw new Error(`Invoice creation failed: ${invoiceError?.message || "Unknown error"}`);
      }
      
      createdInvoiceId = (invoice as any).id;

      // ============================================================
      // STEP 3: Link load to invoice via invoice_loads
      // ============================================================
      toast.loading("Linking load to invoice...", { id: "audit-invoice" });
      
      const invoiceLoadData = {
        tenant_id: tenantId,
        invoice_id: createdInvoiceId,
        load_id: load.id,
        amount: load.rate || 0,
        description: `Load ${load.load_number}: ${load.pickup_city || ""}, ${load.pickup_state || ""} → ${load.delivery_city || ""}, ${load.delivery_state || ""}`.trim(),
      };

      const { error: linkError } = await supabase
        .from("invoice_loads" as any)
        .insert(invoiceLoadData);

      if (linkError) {
        console.error("Invoice-load link error:", linkError);
        // ROLLBACK: Delete the orphaned invoice
        await supabase.from("invoices" as any).delete().eq("id", createdInvoiceId);
        toast.error("Step 3 failed: Could not link load to invoice (rolled back)", { id: "audit-invoice" });
        throw new Error(`Failed to link load: ${linkError.message}`);
      }

      // ============================================================
      // STEP 4: Update load financial_status to 'invoiced'
      // This is the ONLY step that removes the load from audit queue
      // ============================================================
      toast.loading("Updating load status...", { id: "audit-invoice" });
      
      const { error: loadUpdateError } = await supabase
        .from("loads")
        .update({
          status: "closed",
          financial_status: "invoiced",
          billing_notes: finalNotes || undefined,
        })
        .eq("id", load.id)
        .eq("tenant_id", tenantId); // Ensure tenant scoping

      if (loadUpdateError) {
        console.error("Load update error:", loadUpdateError);
        // ROLLBACK: Delete invoice_loads link and invoice
        await supabase.from("invoice_loads" as any).delete().eq("invoice_id", createdInvoiceId);
        await supabase.from("invoices" as any).delete().eq("id", createdInvoiceId);
        toast.error("Step 4 failed: Could not update load status (rolled back)", { id: "audit-invoice" });
        throw new Error(`Failed to update load: ${loadUpdateError.message}`);
      }

      // ============================================================
      // STEP 5: Verify the load was actually updated (safety check)
      // ============================================================
      const { data: verifyLoad, error: verifyError } = await supabase
        .from("loads")
        .select("financial_status")
        .eq("id", load.id)
        .single();

      if (verifyError || (verifyLoad as any)?.financial_status !== "invoiced") {
        console.error("Load verification failed:", verifyError, verifyLoad);
        // ROLLBACK: Delete invoice_loads link and invoice
        await supabase.from("invoice_loads" as any).delete().eq("invoice_id", createdInvoiceId);
        await supabase.from("invoices" as any).delete().eq("id", createdInvoiceId);
        toast.error("Step 5 failed: Load status verification failed (rolled back)", { id: "audit-invoice" });
        throw new Error("Load financial_status was not updated correctly");
      }

      // ============================================================
      // STEP 6: Insert audit_log entry (non-fatal if fails)
      // ============================================================
      const auditAction = verificationState === "all_match" 
        ? "audit_create_invoice" 
        : "audit_create_invoice_override";
        
      const { error: auditLogError } = await supabase
        .from("audit_logs")
        .insert({
          tenant_id: tenantId,
          entity_type: "load",
          entity_id: load.id,
          action: auditAction,
          new_value: JSON.stringify({ 
            invoice_id: createdInvoiceId, 
            invoice_number: createdInvoiceNumber,
            verification_state: verificationState,
            override_reason: verificationState !== "all_match" ? overrideReason : undefined,
          }),
          notes: `Audit ${verificationState === "all_match" ? "approved" : "overridden"}. Invoice ${createdInvoiceNumber} created.`,
        });

      if (auditLogError) {
        console.error("Audit log error (non-fatal):", auditLogError);
      }

      toast.dismiss("audit-invoice");
      return { invoiceId: createdInvoiceId, invoiceNumber: createdInvoiceNumber };
    },
    onSuccess: ({ invoiceId, invoiceNumber }) => {
      queryClient.invalidateQueries({ queryKey: ["ready-for-audit-loads"] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-counts"] });
      queryClient.invalidateQueries({ queryKey: ["tenant-accounting-counts-v3"] });

      toast.success(`Invoice ${invoiceNumber} created successfully`);
      onOpenChange(false);
      
      // Navigate to invoice detail
      navigate(`/dashboard/invoice/${invoiceId}`);
    },
    onError: (error) => {
      console.error("Create invoice error:", error);
      toast.dismiss("audit-invoice");
      // Error already shown by step-specific toast
    },
  });

  const handleConfirm = () => {
    if (!canProceed) {
      if (verificationState !== "all_match") {
        toast.error("Please confirm the override and provide a reason");
      }
      return;
    }
    createInvoiceMutation.mutate();
  };

  const resetState = () => {
    setOverrideConfirmed(false);
    setOverrideReason("");
    setInvoiceDate(today);
    setDueDate(defaultDueDate);
  };

  if (!load) return null;

  // ============================================================
  // RENDER: All Verified - Simple Confirm Modal
  // ============================================================
  if (verificationState === "all_match") {
    return (
      <Dialog 
        open={open} 
        onOpenChange={(newOpen) => {
          if (!newOpen) resetState();
          onOpenChange(newOpen);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-green-500" />
              All Checks Passed
            </DialogTitle>
            <DialogDescription>
              AI verification confirmed all items match. Ready to create invoice.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            {/* Load Summary */}
            <div className="bg-muted/50 rounded-lg p-3 space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm font-medium">Load</span>
                <span className="text-sm">{load.load_number}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Customer</span>
                <span className="text-sm">{load.customers?.name || "Unknown"}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Rate</span>
                <span className="text-sm font-medium">
                  {load.rate ? `$${load.rate.toLocaleString()}` : "—"}
                </span>
              </div>
            </div>

            {/* Verification Summary */}
            <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
              <CheckCircle2 className="h-4 w-4 text-green-500 flex-shrink-0" />
              <span className="text-sm text-green-700 dark:text-green-300">
                {allVerificationItems.length} verification items passed
              </span>
            </div>

            {/* Invoice Dates */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invoice_date">Invoice Date</Label>
                <Input
                  id="invoice_date"
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="due_date">Due Date</Label>
                <Input
                  id="due_date"
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                />
              </div>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirm} 
              disabled={createInvoiceMutation.isPending}
              className="gap-2"
            >
              {createInvoiceMutation.isPending ? (
                <>Creating...</>
              ) : (
                <>
                  <Receipt className="h-4 w-4" />
                  Create Invoice
                </>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  // ============================================================
  // RENDER: Has Failures or Incomplete - Override Modal
  // ============================================================
  return (
    <Dialog 
      open={open} 
      onOpenChange={(newOpen) => {
        if (!newOpen) resetState();
        onOpenChange(newOpen);
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
            <ShieldAlert className="h-5 w-5" />
            Override Required
          </DialogTitle>
          <DialogDescription>
            {verificationState === "has_failures" 
              ? "Some verification checks failed. You must confirm override to proceed."
              : "Verification is incomplete. Please verify manually or run AI verification first."
            }
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Load Summary */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Load</span>
              <span className="text-sm">{load.load_number}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Customer</span>
              <span className="text-sm">{load.customers?.name || "Unknown"}</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-sm text-muted-foreground">Rate</span>
              <span className="text-sm font-medium">
                {load.rate ? `$${load.rate.toLocaleString()}` : "—"}
              </span>
            </div>
          </div>

          {/* Warning Banner with Audit Notice */}
          <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
            <div className="flex items-start gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="font-medium text-amber-700 dark:text-amber-300">
                  You are overriding AI verification
                </p>
                <p className="text-muted-foreground mt-1">
                  This override will be <span className="font-medium">logged for audit purposes</span>. 
                  Ensure you have manually verified all documents before proceeding.
                </p>
              </div>
            </div>
          </div>

          {/* Failed Items */}
          {failedItems.length > 0 && (
            <div className="space-y-2">
              <Label className="text-destructive">Failed Checks ({failedItems.length})</Label>
              <div className="bg-destructive/5 border border-destructive/20 rounded-lg p-3 space-y-1">
                {failedItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm">
                    <XCircle className="h-4 w-4 text-destructive flex-shrink-0" />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Incomplete Items */}
          {incompleteItems.length > 0 && (
            <div className="space-y-2">
              <Label className="text-muted-foreground">Not Verified ({incompleteItems.length})</Label>
              <div className="bg-muted/50 border rounded-lg p-3 space-y-1">
                {incompleteItems.map((item) => (
                  <div key={item.id} className="flex items-center gap-2 text-sm text-muted-foreground">
                    <div className="h-4 w-4 rounded-full border border-muted-foreground/30 flex-shrink-0" />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Invoice Dates */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="invoice_date">Invoice Date</Label>
              <Input
                id="invoice_date"
                type="date"
                value={invoiceDate}
                onChange={(e) => setInvoiceDate(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="due_date">Due Date</Label>
              <Input
                id="due_date"
                type="date"
                value={dueDate}
                onChange={(e) => setDueDate(e.target.value)}
              />
            </div>
          </div>

          {/* Override Confirmation */}
          <div className="border border-amber-500/30 rounded-lg p-3 space-y-3 bg-amber-500/5">
            <div className="flex items-start gap-2">
              <Checkbox
                id="override_confirm"
                checked={overrideConfirmed}
                onCheckedChange={(checked) => setOverrideConfirmed(!!checked)}
                className="mt-0.5"
              />
              <Label 
                htmlFor="override_confirm" 
                className="text-sm font-normal cursor-pointer leading-tight"
              >
                I confirm this load is correct and ready to invoice despite failed or incomplete verification checks
              </Label>
            </div>

            <div className="space-y-2">
              <Label htmlFor="override_reason" className="text-sm">
                Override Reason <span className="text-destructive">*</span>
              </Label>
              <Textarea
                id="override_reason"
                value={overrideReason}
                onChange={(e) => setOverrideReason(e.target.value)}
                placeholder="Explain why you are overriding the verification (e.g., 'Manually verified RC and BOL match expected values')"
                className="min-h-[80px] resize-none text-sm"
              />
              {overrideConfirmed && !overrideReason.trim() && (
                <p className="text-xs text-destructive">Override reason is required</p>
              )}
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!canProceed || createInvoiceMutation.isPending}
            variant="destructive"
            className="gap-2"
          >
            {createInvoiceMutation.isPending ? (
              <>Creating...</>
            ) : (
              <>
                <ShieldAlert className="h-4 w-4" />
                Override & Create Invoice
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
