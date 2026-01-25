import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight, ChevronLeft } from "lucide-react";

interface DirectDepositProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export const DirectDeposit = ({ data, onNext, onBack }: DirectDepositProps) => {
  const [formData, setFormData] = useState({
    firstName: data?.directDeposit?.firstName || "",
    lastName: data?.directDeposit?.lastName || "",
    businessName: data?.directDeposit?.businessName || "",
    email: data?.directDeposit?.email || "",
    bankName: data?.directDeposit?.bankName || "",
    routingNumber: data?.directDeposit?.routingNumber || "",
    checkingNumber: data?.directDeposit?.checkingNumber || "",
    cashAppCashtag: data?.directDeposit?.cashAppCashtag || "",
    accountType: data?.directDeposit?.accountType || "personal-checking",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({ directDeposit: formData });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-4 text-foreground">Direct Deposit Information</h3>
        <p className="text-sm text-muted-foreground mb-6">
          This information will be used for direct deposit purposes only and will not be shared with anyone else.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name *</Label>
          <Input
            id="firstName"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="lastName">Last Name *</Label>
          <Input
            id="lastName"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="businessName">Business Name (if applicable)</Label>
          <Input
            id="businessName"
            value={formData.businessName}
            onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="bankName">Bank Name *</Label>
        <Input
          id="bankName"
          value={formData.bankName}
          onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="routingNumber">Routing Number *</Label>
          <Input
            id="routingNumber"
            value={formData.routingNumber}
            onChange={(e) => setFormData({ ...formData, routingNumber: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="checkingNumber">Account Number *</Label>
          <Input
            id="checkingNumber"
            value={formData.checkingNumber}
            onChange={(e) => setFormData({ ...formData, checkingNumber: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="cashAppCashtag">CashApp Cashtag (optional)</Label>
        <Input
          id="cashAppCashtag"
          placeholder="$username"
          value={formData.cashAppCashtag}
          onChange={(e) => setFormData({ ...formData, cashAppCashtag: e.target.value })}
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="accountType">Account Type *</Label>
        <select
          id="accountType"
          className="w-full rounded-md border border-input bg-background px-3 py-2"
          value={formData.accountType}
          onChange={(e) => setFormData({ ...formData, accountType: e.target.value })}
          required
        >
          <option value="">Select account type...</option>
          <option value="personal-checking">Personal Checking</option>
          <option value="personal-savings">Personal Savings</option>
          <option value="business-checking">Business Checking</option>
          <option value="business-savings">Business Savings</option>
        </select>
      </div>

      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" onClick={onBack} className="gap-2">
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>
        <Button type="submit" className="gap-2">
          Next
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </form>
  );
};
