import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight, User, Phone, MapPin, Shield, Heart } from "lucide-react";

interface PersonalInfoProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  isPreviewMode?: boolean;
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
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Personal Information Section */}
      <div className="section-scifi">
        <div className="section-header-scifi">
          <h3 className="text-sm font-semibold text-scifi-text flex items-center gap-2">
            <User className="w-4 h-4 text-scifi-purple" />
            Personal Information
          </h3>
          <p className="text-xs text-scifi-text-muted mt-0.5">
            As it appears on your government-issued ID
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mt-3">
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
            <Label htmlFor="middleName" className="label-scifi">Middle Name</Label>
            <Input
              id="middleName"
              className="input-scifi h-9 text-sm"
              value={formData.middleName}
              onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="form-field-scifi space-y-1">
            <Label htmlFor="ssn" className="label-scifi">Social Security Number *</Label>
            <Input
              id="ssn"
              type="text"
              placeholder="XXX-XX-XXXX"
              className="input-scifi h-9 text-sm"
              value={formData.ssn}
              onChange={(e) => setFormData({ ...formData, ssn: e.target.value })}
            />
          </div>
          <div className="form-field-scifi space-y-1">
            <Label htmlFor="dob" className="label-scifi">Date of Birth *</Label>
            <Input
              id="dob"
              type="date"
              className="input-scifi h-9 text-sm"
              value={formData.dob}
              onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Contact Section */}
      <div className="section-scifi">
        <div className="section-header-scifi">
          <h3 className="text-sm font-semibold text-scifi-text flex items-center gap-2">
            <Phone className="w-4 h-4 text-scifi-cyan" />
            Contact Information
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="form-field-scifi space-y-1">
            <Label htmlFor="phone" className="label-scifi">Phone Number *</Label>
            <Input
              id="phone"
              type="tel"
              placeholder="(XXX) XXX-XXXX"
              className="input-scifi h-9 text-sm"
              value={formData.phone}
              onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>
          <div className="form-field-scifi space-y-1">
            <Label htmlFor="email" className="label-scifi">Email Address *</Label>
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

      {/* Address Section */}
      <div className="section-scifi">
        <div className="section-header-scifi">
          <h3 className="text-sm font-semibold text-scifi-text flex items-center gap-2">
            <MapPin className="w-4 h-4 text-scifi-purple" />
            Current Address
          </h3>
        </div>

        <div className="form-field-scifi space-y-1 mt-3">
          <Label htmlFor="address" className="label-scifi">Street Address *</Label>
          <Input
            id="address"
            className="input-scifi h-9 text-sm"
            value={formData.address}
            onChange={(e) => setFormData({ ...formData, address: e.target.value })}
          />
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
          <div className="form-field-scifi space-y-1 col-span-2 md:col-span-2">
            <Label htmlFor="city" className="label-scifi">City *</Label>
            <Input
              id="city"
              className="input-scifi h-9 text-sm"
              value={formData.city}
              onChange={(e) => setFormData({ ...formData, city: e.target.value })}
            />
          </div>
          <div className="form-field-scifi space-y-1">
            <Label htmlFor="state" className="label-scifi">State *</Label>
            <Input
              id="state"
              placeholder="XX"
              maxLength={2}
              className="input-scifi h-9 text-sm uppercase"
              value={formData.state}
              onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
            />
          </div>
          <div className="form-field-scifi space-y-1">
            <Label htmlFor="zip" className="label-scifi">ZIP Code *</Label>
            <Input
              id="zip"
              placeholder="XXXXX"
              className="input-scifi h-9 text-sm"
              value={formData.zip}
              onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
            />
          </div>
        </div>
      </div>


      {/* Background Section */}
      <div className="section-scifi">
        <div className="section-header-scifi">
          <h3 className="text-sm font-semibold text-scifi-text flex items-center gap-2">
            <Shield className="w-4 h-4 text-scifi-purple" />
            Employment Eligibility
          </h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mt-3">
          <div className="form-field-scifi space-y-1">
            <Label htmlFor="legallyAuthorized" className="label-scifi">
              Legally authorized to work in the US? *
            </Label>
            <select
              id="legallyAuthorized"
              className="input-scifi w-full rounded-lg border border-scifi-border bg-scifi-bg px-3 py-2 text-sm h-9 text-scifi-text"
              value={formData.legallyAuthorized}
              onChange={(e) => setFormData({ ...formData, legallyAuthorized: e.target.value })}
            >
              <option value="" className="bg-scifi-card">Select...</option>
              <option value="yes" className="bg-scifi-card">Yes</option>
              <option value="no" className="bg-scifi-card">No</option>
            </select>
          </div>

          <div className="form-field-scifi space-y-1">
            <Label htmlFor="felonyConviction" className="label-scifi">
              Ever convicted of a felony? *
            </Label>
            <select
              id="felonyConviction"
              className="input-scifi w-full rounded-lg border border-scifi-border bg-scifi-bg px-3 py-2 text-sm h-9 text-scifi-text"
              value={formData.felonyConviction}
              onChange={(e) => setFormData({ ...formData, felonyConviction: e.target.value })}
            >
              <option value="" className="bg-scifi-card">Select...</option>
              <option value="yes" className="bg-scifi-card">Yes</option>
              <option value="no" className="bg-scifi-card">No</option>
            </select>
            <p className="text-[10px] text-scifi-text-muted">
              Conviction is not an automatic bar to employment.
            </p>
          </div>
        </div>

        {formData.felonyConviction === "yes" && (
          <div className="form-field-scifi space-y-1 mt-3">
            <Label htmlFor="felonyDetails" className="label-scifi">Please explain</Label>
            <textarea
              id="felonyDetails"
              className="input-scifi w-full rounded-lg border border-scifi-border bg-scifi-bg px-3 py-2 text-sm min-h-[80px] resize-none text-scifi-text"
              value={formData.felonyDetails}
              onChange={(e) => setFormData({ ...formData, felonyDetails: e.target.value })}
              placeholder="Provide details about your conviction"
            />
          </div>
        )}
      </div>

      {/* Navigation */}
      <div className="flex justify-end pt-4">
        <Button type="submit" className="btn-scifi rounded-full px-6 gap-2 transition-all duration-200">
          Continue
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </form>
  );
};
