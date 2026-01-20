import { useState, useEffect } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CheckCircle2, XCircle, Loader2, Send, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";

interface VerificationItem {
  label: string;
  value: string | null;
  status: "pending" | "checking" | "pass" | "fail";
  required: boolean;
}

interface OtrVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  load: {
    id: string;
    load_number: string;
    rate: number | null;
    customer_id: string | null;
    customers: {
      name: string;
      mc_number: string | null;
      factoring_approval: string | null;
    } | null;
  };
  tenantId: string;
  factoringCompany: string | null;
  onConfirmSend: () => void;
}

export function OtrVerificationDialog({
  open,
  onOpenChange,
  load,
  tenantId,
  factoringCompany,
  onConfirmSend,
}: OtrVerificationDialogProps) {
  const [verificationItems, setVerificationItems] = useState<VerificationItem[]>([]);
  const [isVerifying, setIsVerifying] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<any>(null);

  useEffect(() => {
    if (open) {
      runVerification();
    }
  }, [open]);

  const runVerification = async () => {
    setIsVerifying(true);
    
    // Initialize items as pending
    const initialItems: VerificationItem[] = [
      { label: "Customer Name", value: null, status: "pending", required: true },
      { label: "Broker MC Number", value: null, status: "pending", required: true },
      { label: "Factoring Approval", value: null, status: "pending", required: true },
      { label: "Company DOT Number", value: null, status: "pending", required: true },
      { label: "Company MC Number", value: null, status: "pending", required: false },
      { label: "Factoring Company", value: null, status: "pending", required: true },
      { label: "Invoice Amount", value: null, status: "pending", required: true },
      { label: "Load Number", value: null, status: "pending", required: true },
    ];
    
    setVerificationItems(initialItems);

    // Simulate verification with delays for visual effect
    await new Promise(r => setTimeout(r, 300));

    // Fetch company profile
    const { data: profile } = await supabase
      .from("company_profile")
      .select("*")
      .eq("tenant_id", tenantId)
      .limit(1)
      .single();

    setCompanyProfile(profile);

    // Check each item with visual delay
    const updatedItems = [...initialItems];

    // 1. Customer Name
    updatedItems[0] = {
      ...updatedItems[0],
      status: "checking",
    };
    setVerificationItems([...updatedItems]);
    await new Promise(r => setTimeout(r, 200));
    updatedItems[0] = {
      ...updatedItems[0],
      value: load.customers?.name || null,
      status: load.customers?.name ? "pass" : "fail",
    };
    setVerificationItems([...updatedItems]);

    // 2. Broker MC Number
    updatedItems[1] = { ...updatedItems[1], status: "checking" };
    setVerificationItems([...updatedItems]);
    await new Promise(r => setTimeout(r, 200));
    const mcNumber = load.customers?.mc_number;
    updatedItems[1] = {
      ...updatedItems[1],
      value: mcNumber ? `MC-${mcNumber}` : null,
      status: mcNumber ? "pass" : "fail",
    };
    setVerificationItems([...updatedItems]);

    // 3. Factoring Approval
    updatedItems[2] = { ...updatedItems[2], status: "checking" };
    setVerificationItems([...updatedItems]);
    await new Promise(r => setTimeout(r, 200));
    const factoringApproval = load.customers?.factoring_approval;
    updatedItems[2] = {
      ...updatedItems[2],
      value: factoringApproval ? factoringApproval.charAt(0).toUpperCase() + factoringApproval.slice(1) : null,
      status: factoringApproval === "approved" ? "pass" : "fail",
    };
    setVerificationItems([...updatedItems]);

    // 4. Company DOT Number
    updatedItems[3] = { ...updatedItems[3], status: "checking" };
    setVerificationItems([...updatedItems]);
    await new Promise(r => setTimeout(r, 200));
    const dotNumber = profile?.dot_number;
    updatedItems[3] = {
      ...updatedItems[3],
      value: dotNumber ? `DOT-${dotNumber}` : null,
      status: dotNumber ? "pass" : "fail",
    };
    setVerificationItems([...updatedItems]);

    // 5. Company MC Number (optional)
    updatedItems[4] = { ...updatedItems[4], status: "checking" };
    setVerificationItems([...updatedItems]);
    await new Promise(r => setTimeout(r, 200));
    const companyMc = profile?.mc_number;
    updatedItems[4] = {
      ...updatedItems[4],
      value: companyMc ? `MC-${companyMc}` : "Not set (optional)",
      status: companyMc ? "pass" : "pass", // Optional, so always pass
    };
    setVerificationItems([...updatedItems]);

    // 6. Factoring Company
    updatedItems[5] = { ...updatedItems[5], status: "checking" };
    setVerificationItems([...updatedItems]);
    await new Promise(r => setTimeout(r, 200));
    const factCompany = factoringCompany || profile?.factoring_company_name;
    updatedItems[5] = {
      ...updatedItems[5],
      value: factCompany || null,
      status: factCompany ? "pass" : "fail",
    };
    setVerificationItems([...updatedItems]);

    // 7. Invoice Amount
    updatedItems[6] = { ...updatedItems[6], status: "checking" };
    setVerificationItems([...updatedItems]);
    await new Promise(r => setTimeout(r, 200));
    const rate = load.rate;
    updatedItems[6] = {
      ...updatedItems[6],
      value: rate ? `$${rate.toLocaleString()}` : null,
      status: rate && rate > 0 ? "pass" : "fail",
    };
    setVerificationItems([...updatedItems]);

    // 8. Load Number
    updatedItems[7] = { ...updatedItems[7], status: "checking" };
    setVerificationItems([...updatedItems]);
    await new Promise(r => setTimeout(r, 200));
    updatedItems[7] = {
      ...updatedItems[7],
      value: load.load_number || null,
      status: load.load_number ? "pass" : "fail",
    };
    setVerificationItems([...updatedItems]);

    setIsVerifying(false);
  };

  const allPassed = verificationItems.every(
    (item) => item.status === "pass" || (!item.required && item.status !== "fail")
  );

  const failedItems = verificationItems.filter(
    (item) => item.status === "fail" && item.required
  );

  const getStatusIcon = (status: VerificationItem["status"]) => {
    switch (status) {
      case "pending":
        return <div className="w-5 h-5 rounded-full border-2 border-muted-foreground/30" />;
      case "checking":
        return <Loader2 className="w-5 h-5 text-primary animate-spin" />;
      case "pass":
        return <CheckCircle2 className="w-5 h-5 text-green-500" />;
      case "fail":
        return <XCircle className="w-5 h-5 text-destructive" />;
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Send className="h-5 w-5 text-primary" />
            OTR Invoice Verification
          </DialogTitle>
        </DialogHeader>

        <div className="py-4">
          <p className="text-sm text-muted-foreground mb-4">
            Verifying all required information before sending to OTR Solutions...
          </p>

          <div className="space-y-3">
            {verificationItems.map((item, index) => (
              <div
                key={index}
                className={cn(
                  "flex items-center justify-between p-3 rounded-lg border transition-all",
                  item.status === "pass" && "bg-green-50 dark:bg-green-950/20 border-green-200 dark:border-green-800",
                  item.status === "fail" && "bg-destructive/10 border-destructive/30",
                  item.status === "checking" && "bg-primary/5 border-primary/20",
                  item.status === "pending" && "bg-muted/50 border-muted"
                )}
              >
                <div className="flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{item.label}</span>
                    {!item.required && (
                      <span className="text-xs text-muted-foreground">(optional)</span>
                    )}
                  </div>
                  {item.value && (
                    <span className={cn(
                      "text-xs",
                      item.status === "pass" ? "text-green-600 dark:text-green-400" : "text-muted-foreground"
                    )}>
                      {item.value}
                    </span>
                  )}
                  {item.status === "fail" && !item.value && (
                    <span className="text-xs text-destructive">Missing</span>
                  )}
                </div>
                {getStatusIcon(item.status)}
              </div>
            ))}
          </div>

          {!isVerifying && failedItems.length > 0 && (
            <div className="mt-4 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <div className="flex items-start gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-500 mt-0.5" />
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Cannot submit to OTR
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Please fix the following before sending:
                  </p>
                  <ul className="text-xs text-amber-600 dark:text-amber-400 mt-1 list-disc list-inside">
                    {failedItems.map((item, i) => (
                      <li key={i}>{item.label}</li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          )}

          {!isVerifying && allPassed && (
            <div className="mt-4 p-3 rounded-lg bg-green-50 dark:bg-green-950/20 border border-green-200 dark:border-green-800">
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-green-500" />
                <p className="text-sm font-medium text-green-800 dark:text-green-200">
                  All checks passed! Ready to submit.
                </p>
              </div>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => {
              onOpenChange(false);
              onConfirmSend();
            }}
            disabled={isVerifying || !allPassed}
            className="gap-2 bg-amber-500 hover:bg-amber-600"
          >
            {isVerifying ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Verifying...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" />
                Send Invoice
              </>
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}