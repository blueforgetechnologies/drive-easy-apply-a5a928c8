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

      <div className="flex justify-end pt-4">
        <Button type="submit" className="gap-2">
          Next
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </form>
  );
};
