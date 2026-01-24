import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { toast } from "sonner";
import { useTenantId } from "@/hooks/useTenantId";
import { FileCheck, Receipt, AlertCircle, CheckCircle2 } from "lucide-react";
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

interface AuditCreateInvoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  load: LoadData | null;
  auditNotes?: string;
}

export default function AuditCreateInvoiceDialog({
  open,
  onOpenChange,
  load,
  auditNotes = "",
}: AuditCreateInvoiceDialogProps) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const tenantId = useTenantId();

  const [confirmChecklist, setConfirmChecklist] = useState({
    ratesVerified: false,
    documentsReviewed: false,
    customerCorrect: false,
  });

  const today = format(new Date(), "yyyy-MM-dd");
  const defaultDueDate = format(addDays(new Date(), 30), "yyyy-MM-dd");
  const [invoiceDate, setInvoiceDate] = useState(today);
  const [dueDate, setDueDate] = useState(defaultDueDate);

  // Calculate document coverage for load
  const documents = load?.load_documents || [];
  const hasRc = documents.some(d => d.document_type === "rate_confirmation");
  const hasBol = documents.some(d => 
    ["bill_of_lading", "pod", "proof_of_delivery"].includes(d.document_type)
  );

  const allChecked = Object.values(confirmChecklist).every(Boolean);

  const createInvoiceMutation = useMutation({
    mutationFn: async () => {
      if (!load || !tenantId) {
        throw new Error("Missing load or tenant context");
      }

      const customer = load.customers;
      
      // 1. Generate invoice number using tenant-scoped RPC
      const { data: invoiceNumber, error: rpcError } = await supabase
        .rpc("next_invoice_number", { p_tenant_id: tenantId });

      if (rpcError) {
        console.error("Invoice number RPC error:", rpcError);
        // Fallback to manual numbering
        const { data: lastInvoice } = await supabase
          .from("invoices" as any)
          .select("invoice_number")
          .eq("tenant_id", tenantId)
          .order("created_at", { ascending: false })
          .limit(1)
          .single();

        const lastNum = parseInt((lastInvoice as any)?.invoice_number || "1000000", 10);
        throw new Error("Could not generate invoice number");
      }

      // 2. Create invoice record (status='draft' internally, displays as 'Open')
      const invoiceData = {
        tenant_id: tenantId,
        invoice_number: String(invoiceNumber),
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
        notes: auditNotes || null,
      };

      const { data: invoice, error: invoiceError } = await supabase
        .from("invoices" as any)
        .insert(invoiceData)
        .select()
        .single();

      if (invoiceError) throw invoiceError;
      const invoiceId = (invoice as any).id;

      // 3. Link load to invoice via invoice_loads
      const invoiceLoadData = {
        tenant_id: tenantId, // Tenant-scoped
        invoice_id: invoiceId,
        load_id: load.id,
        amount: load.rate || 0,
        description: `Load ${load.load_number}: ${load.pickup_city || ""}, ${load.pickup_state || ""} → ${load.delivery_city || ""}, ${load.delivery_state || ""}`.trim(),
      };

      const { error: linkError } = await supabase
        .from("invoice_loads" as any)
        .insert(invoiceLoadData);

      if (linkError) throw linkError;

      // 4. Update load status: set financial_status to 'invoiced' to remove from audit queue
      const { error: loadUpdateError } = await supabase
        .from("loads")
        .update({
          status: "closed",
          financial_status: "invoiced",
          billing_notes: auditNotes || undefined,
        })
        .eq("id", load.id);

      if (loadUpdateError) throw loadUpdateError;

      // 5. Insert audit_log entry for traceability
      const { error: auditLogError } = await supabase
        .from("audit_logs")
        .insert({
          tenant_id: tenantId,
          entity_type: "load",
          entity_id: load.id,
          action: "audit_create_invoice",
          new_value: JSON.stringify({ invoice_id: invoiceId, invoice_number: invoiceNumber }),
          notes: `Audit approved. Invoice ${invoiceNumber} created.`,
        });

      if (auditLogError) {
        console.error("Audit log error (non-fatal):", auditLogError);
      }

      return { invoiceId, invoiceNumber };
    },
    onSuccess: ({ invoiceId, invoiceNumber }) => {
      queryClient.invalidateQueries({ queryKey: ["ready-for-audit-loads"] });
      queryClient.invalidateQueries({ queryKey: ["loads"] });
      queryClient.invalidateQueries({ queryKey: ["invoices"] });
      queryClient.invalidateQueries({ queryKey: ["accounting-counts"] });

      toast.success(`Invoice ${invoiceNumber} created successfully`);
      onOpenChange(false);
      
      // Navigate to invoice detail
      navigate(`/dashboard/invoice/${invoiceId}`);
    },
    onError: (error) => {
      console.error("Create invoice error:", error);
      toast.error(`Failed to create invoice: ${error instanceof Error ? error.message : "Unknown error"}`);
    },
  });

  const handleConfirm = () => {
    if (!allChecked) {
      toast.error("Please confirm all checklist items");
      return;
    }
    createInvoiceMutation.mutate();
  };

  const resetState = () => {
    setConfirmChecklist({
      ratesVerified: false,
      documentsReviewed: false,
      customerCorrect: false,
    });
    setInvoiceDate(today);
    setDueDate(defaultDueDate);
  };

  if (!load) return null;

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
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="h-5 w-5 text-primary" />
            Audit & Create Invoice
          </DialogTitle>
          <DialogDescription>
            Review the load details and create an invoice for billing.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Load Summary */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-sm font-medium">Load</span>
              <span className="text-sm">{load.load_number}</span>
            </div>
            {load.reference_number && (
              <div className="flex justify-between items-center">
                <span className="text-sm text-muted-foreground">Reference</span>
                <span className="text-sm">{load.reference_number}</span>
              </div>
            )}
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

          {/* Document Coverage */}
          <div className="bg-muted/50 rounded-lg p-3 space-y-2">
            <div className="text-sm font-medium mb-2">Document Coverage</div>
            <div className="flex gap-4">
              <div className="flex items-center gap-2">
                {hasRc ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
                <span className="text-sm">Rate Confirmation</span>
              </div>
              <div className="flex items-center gap-2">
                {hasBol ? (
                  <CheckCircle2 className="h-4 w-4 text-green-500" />
                ) : (
                  <AlertCircle className="h-4 w-4 text-amber-500" />
                )}
                <span className="text-sm">BOL/POD</span>
              </div>
            </div>
            {(!hasRc || !hasBol) && (
              <p className="text-xs text-muted-foreground mt-1">
                Missing documents may require Direct Email billing method with manual upload.
              </p>
            )}
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

          {/* Confirmation Checklist */}
          <div className="border rounded-lg p-3 space-y-3">
            <div className="text-sm font-medium flex items-center gap-2">
              <FileCheck className="h-4 w-4 text-primary" />
              Confirm before creating invoice
            </div>
            
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <Checkbox
                  id="ratesVerified"
                  checked={confirmChecklist.ratesVerified}
                  onCheckedChange={(checked) => 
                    setConfirmChecklist(prev => ({ ...prev, ratesVerified: !!checked }))
                  }
                />
                <Label htmlFor="ratesVerified" className="text-sm font-normal cursor-pointer">
                  Rates have been verified against Rate Confirmation
                </Label>
              </div>
              
              <div className="flex items-center gap-2">
                <Checkbox
                  id="documentsReviewed"
                  checked={confirmChecklist.documentsReviewed}
                  onCheckedChange={(checked) => 
                    setConfirmChecklist(prev => ({ ...prev, documentsReviewed: !!checked }))
                  }
                />
                <Label htmlFor="documentsReviewed" className="text-sm font-normal cursor-pointer">
                  Documents have been reviewed for completeness
                </Label>
              </div>
              
              <div className="flex items-center gap-2">
                <Checkbox
                  id="customerCorrect"
                  checked={confirmChecklist.customerCorrect}
                  onCheckedChange={(checked) => 
                    setConfirmChecklist(prev => ({ ...prev, customerCorrect: !!checked }))
                  }
                />
                <Label htmlFor="customerCorrect" className="text-sm font-normal cursor-pointer">
                  Customer and billing information is correct
                </Label>
              </div>
            </div>
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button 
            onClick={handleConfirm} 
            disabled={!allChecked || createInvoiceMutation.isPending}
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
