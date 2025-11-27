import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight } from "lucide-react";

interface PersonalInfoProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export const PersonalInfo = ({ data, onNext }: PersonalInfoProps) => {
  const [formData, setFormData] = useState({
    firstName: data?.personalInfo?.firstName || "",
    lastName: data?.personalInfo?.lastName || "",
    middleName: data?.personalInfo?.middleName || "",
    ssn: data?.personalInfo?.ssn || "",
    dob: data?.personalInfo?.dob || "",
    phone: data?.personalInfo?.phone || "",
    email: data?.personalInfo?.email || "",
    address: data?.personalInfo?.address || "",
    city: data?.personalInfo?.city || "",
    state: data?.personalInfo?.state || "",
    zip: data?.personalInfo?.zip || "",
    emergencyContactName: data?.personalInfo?.emergencyContactName || "",
    emergencyContactRelationship: data?.personalInfo?.emergencyContactRelationship || "",
    emergencyContactPhone: data?.personalInfo?.emergencyContactPhone || "",
    legallyAuthorized: data?.personalInfo?.legallyAuthorized || "",
    felonyConviction: data?.personalInfo?.felonyConviction || "",
    felonyDetails: data?.personalInfo?.felonyDetails || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({ personalInfo: formData });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-4 text-foreground">Personal Information</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Please provide your personal information as it appears on your government-issued ID.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="firstName">First Name *</Label>
          <Input
            id="firstName"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="middleName">Middle Name</Label>
          <Input
            id="middleName"
            value={formData.middleName}
            onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
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
          <Label htmlFor="ssn">Social Security Number *</Label>
          <Input
            id="ssn"
            type="text"
            placeholder="XXX-XX-XXXX"
            value={formData.ssn}
            onChange={(e) => setFormData({ ...formData, ssn: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="dob">Date of Birth *</Label>
          <Input
            id="dob"
            type="date"
            value={formData.dob}
            onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="phone">Phone Number *</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="(XXX) XXX-XXXX"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">Email Address *</Label>
          <Input
            id="email"
            type="email"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="address">Street Address *</Label>
        <Input
          id="address"
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2 md:col-span-1">
          <Label htmlFor="city">City *</Label>
          <Input
            id="city"
            value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="state">State *</Label>
          <Input
            id="state"
            placeholder="XX"
            maxLength={2}
            value={formData.state}
            onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="zip">ZIP Code *</Label>
          <Input
            id="zip"
            placeholder="XXXXX"
            value={formData.zip}
            onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
          />
        </div>
      </div>

      <div>
        <h3 className="text-xl font-semibold mb-4 text-foreground mt-8">Emergency Contact</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Please provide an emergency contact person who can be reached in case of an emergency.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2">
          <Label htmlFor="emergencyContactName">Full Name *</Label>
          <Input
            id="emergencyContactName"
            value={formData.emergencyContactName}
            onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emergencyContactRelationship">Relationship *</Label>
          <Input
            id="emergencyContactRelationship"
            placeholder="e.g., Spouse, Parent, Sibling"
            value={formData.emergencyContactRelationship}
            onChange={(e) => setFormData({ ...formData, emergencyContactRelationship: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="emergencyContactPhone">Phone Number *</Label>
          <Input
            id="emergencyContactPhone"
            type="tel"
            placeholder="(XXX) XXX-XXXX"
            value={formData.emergencyContactPhone}
            onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
          />
        </div>
      </div>

      <div className="pt-8 border-t mt-8">
        <h3 className="text-xl font-semibold mb-4 text-foreground">Employment Eligibility & Background</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Required information for employment verification.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="legallyAuthorized">Are you legally authorized to work in the United States as a commercial driver? *</Label>
          <select
            id="legallyAuthorized"
            className="w-full rounded-md border border-input bg-background px-3 py-2"
            value={formData.legallyAuthorized}
            onChange={(e) => setFormData({ ...formData, legallyAuthorized: e.target.value })}
          >
            <option value="">Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="felonyConviction">Have you ever been convicted of a felony? *</Label>
          <select
            id="felonyConviction"
            className="w-full rounded-md border border-input bg-background px-3 py-2"
            value={formData.felonyConviction}
            onChange={(e) => setFormData({ ...formData, felonyConviction: e.target.value })}
          >
            <option value="">Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Conviction of a crime is not an automatic bar to employment - all circumstances will be considered.
          </p>
        </div>
      </div>

      {formData.felonyConviction === "yes" && (
        <div className="space-y-2">
          <Label htmlFor="felonyDetails">Please explain fully</Label>
          <textarea
            id="felonyDetails"
            className="w-full rounded-md border border-input bg-background px-3 py-2 min-h-[100px]"
            value={formData.felonyDetails}
            onChange={(e) => setFormData({ ...formData, felonyDetails: e.target.value })}
            placeholder="Provide details about your felony conviction"
          />
        </div>
      )}

      <div className="flex justify-end pt-4">
        <Button type="submit" className="gap-2">
          Next
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </form>
  );
};
