import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Landmark, User, Mail, Building, CreditCard, DollarSign } from "lucide-react";

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
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header */}
      <div className="section-scifi p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-scifi-purple/20">
            <Landmark className="h-5 w-5 text-scifi-purple" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Direct Deposit Information</h2>
            <p className="text-sm text-muted-foreground">
              This information will be used for direct deposit purposes only and kept confidential.
            </p>
          </div>
        </div>
      </div>

      {/* Account Holder Section */}
      <div className="section-scifi">
        <div className="section-header-scifi">
          <h3 className="text-sm font-semibold text-scifi-text flex items-center gap-2">
            <User className="w-4 h-4 text-scifi-cyan" />
            Account Holder Information
          </h3>
        </div>

        <div className="space-y-3 mt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="form-field-scifi space-y-1">
              <Label htmlFor="firstName" className="label-scifi">First Name *</Label>
              <Input
                id="firstName"
                className="input-scifi h-9 text-sm"
                value={formData.firstName}
                onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
              />
            </div>
            <div className="form-field-scifi space-y-1">
              <Label htmlFor="lastName" className="label-scifi">Last Name *</Label>
              <Input
                id="lastName"
                className="input-scifi h-9 text-sm"
                value={formData.lastName}
                onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="form-field-scifi space-y-1">
              <Label htmlFor="businessName" className="label-scifi flex items-center gap-1.5">
                <Building className="w-3.5 h-3.5" />
                Business Name (if applicable)
              </Label>
              <Input
                id="businessName"
                className="input-scifi h-9 text-sm"
                value={formData.businessName}
                onChange={(e) => setFormData({ ...formData, businessName: e.target.value })}
              />
            </div>
            <div className="form-field-scifi space-y-1">
              <Label htmlFor="email" className="label-scifi flex items-center gap-1.5">
                <Mail className="w-3.5 h-3.5" />
                Email *
              </Label>
              <Input
                id="email"
                type="email"
                className="input-scifi h-9 text-sm"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
              />
            </div>
          </div>
        </div>
      </div>

      {/* Bank Details Section */}
      <div className="section-scifi">
        <div className="section-header-scifi">
          <h3 className="text-sm font-semibold text-scifi-text flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-scifi-cyan" />
            Bank Account Details
          </h3>
        </div>

        <div className="space-y-3 mt-3">
          <div className="form-field-scifi space-y-1">
            <Label htmlFor="bankName" className="label-scifi flex items-center gap-1.5">
              <Landmark className="w-3.5 h-3.5" />
              Bank Name *
            </Label>
            <Input
              id="bankName"
              className="input-scifi h-9 text-sm"
              value={formData.bankName}
              onChange={(e) => setFormData({ ...formData, bankName: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="form-field-scifi space-y-1">
              <Label htmlFor="routingNumber" className="label-scifi">Routing Number *</Label>
              <Input
                id="routingNumber"
                className="input-scifi h-9 text-sm"
                value={formData.routingNumber}
                onChange={(e) => setFormData({ ...formData, routingNumber: e.target.value })}
              />
            </div>
            <div className="form-field-scifi space-y-1">
              <Label htmlFor="checkingNumber" className="label-scifi">Account Number *</Label>
              <Input
                id="checkingNumber"
                className="input-scifi h-9 text-sm"
                value={formData.checkingNumber}
                onChange={(e) => setFormData({ ...formData, checkingNumber: e.target.value })}
              />
            </div>
          </div>

          <div className="form-field-scifi space-y-1">
            <Label htmlFor="accountType" className="label-scifi">Account Type *</Label>
            <select
              id="accountType"
              className="input-scifi h-9 text-sm w-full"
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
        </div>
      </div>

      {/* Alternative Payment Section */}
      <div className="section-scifi">
        <div className="section-header-scifi">
          <h3 className="text-sm font-semibold text-scifi-text flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-scifi-cyan" />
            Alternative Payment (Optional)
          </h3>
        </div>

        <div className="mt-3">
          <div className="form-field-scifi space-y-1">
            <Label htmlFor="cashAppCashtag" className="label-scifi">CashApp Cashtag</Label>
            <Input
              id="cashAppCashtag"
              placeholder="$username"
              className="input-scifi h-9 text-sm"
              value={formData.cashAppCashtag}
              onChange={(e) => setFormData({ ...formData, cashAppCashtag: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Navigation */}
      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" onClick={onBack} className="btn-scifi-outline">
          Previous
        </Button>
        <Button type="submit" className="btn-scifi">
          Next
        </Button>
      </div>
    </form>
  );
};
