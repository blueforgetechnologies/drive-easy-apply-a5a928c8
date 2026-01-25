import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight, User, Phone, MapPin, Shield } from "lucide-react";

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
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Personal Information Section */}
      <div className="section-header-gold">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <User className="w-4 h-4 text-gold" />
          Personal Information
        </h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          As it appears on your government-issued ID
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="form-field-gold space-y-1">
          <Label htmlFor="firstName" className="text-xs font-medium">First Name *</Label>
          <Input
            id="firstName"
            className="input-gold h-9 text-sm"
            value={formData.firstName}
            onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
          />
        </div>
        <div className="form-field-gold space-y-1">
          <Label htmlFor="middleName" className="text-xs font-medium">Middle Name</Label>
          <Input
            id="middleName"
            className="input-gold h-9 text-sm"
            value={formData.middleName}
            onChange={(e) => setFormData({ ...formData, middleName: e.target.value })}
          />
        </div>
        <div className="form-field-gold space-y-1">
          <Label htmlFor="lastName" className="text-xs font-medium">Last Name *</Label>
          <Input
            id="lastName"
            className="input-gold h-9 text-sm"
            value={formData.lastName}
            onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="form-field-gold space-y-1">
          <Label htmlFor="ssn" className="text-xs font-medium">Social Security Number *</Label>
          <Input
            id="ssn"
            type="text"
            placeholder="XXX-XX-XXXX"
            className="input-gold h-9 text-sm"
            value={formData.ssn}
            onChange={(e) => setFormData({ ...formData, ssn: e.target.value })}
          />
        </div>
        <div className="form-field-gold space-y-1">
          <Label htmlFor="dob" className="text-xs font-medium">Date of Birth *</Label>
          <Input
            id="dob"
            type="date"
            className="input-gold h-9 text-sm"
            value={formData.dob}
            onChange={(e) => setFormData({ ...formData, dob: e.target.value })}
          />
        </div>
      </div>

      {/* Contact Section */}
      <div className="divider-gold my-4" />

      <div className="section-header-gold">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Phone className="w-4 h-4 text-gold" />
          Contact Information
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="form-field-gold space-y-1">
          <Label htmlFor="phone" className="text-xs font-medium">Phone Number *</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="(XXX) XXX-XXXX"
            className="input-gold h-9 text-sm"
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>
        <div className="form-field-gold space-y-1">
          <Label htmlFor="email" className="text-xs font-medium">Email Address *</Label>
          <Input
            id="email"
            type="email"
            className="input-gold h-9 text-sm"
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>
      </div>

      {/* Address Section */}
      <div className="divider-gold my-4" />

      <div className="section-header-gold">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <MapPin className="w-4 h-4 text-gold" />
          Current Address
        </h3>
      </div>

      <div className="form-field-gold space-y-1">
        <Label htmlFor="address" className="text-xs font-medium">Street Address *</Label>
        <Input
          id="address"
          className="input-gold h-9 text-sm"
          value={formData.address}
          onChange={(e) => setFormData({ ...formData, address: e.target.value })}
        />
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="form-field-gold space-y-1 col-span-2 md:col-span-2">
          <Label htmlFor="city" className="text-xs font-medium">City *</Label>
          <Input
            id="city"
            className="input-gold h-9 text-sm"
            value={formData.city}
            onChange={(e) => setFormData({ ...formData, city: e.target.value })}
          />
        </div>
        <div className="form-field-gold space-y-1">
          <Label htmlFor="state" className="text-xs font-medium">State *</Label>
          <Input
            id="state"
            placeholder="XX"
            maxLength={2}
            className="input-gold h-9 text-sm uppercase"
            value={formData.state}
            onChange={(e) => setFormData({ ...formData, state: e.target.value.toUpperCase() })}
          />
        </div>
        <div className="form-field-gold space-y-1">
          <Label htmlFor="zip" className="text-xs font-medium">ZIP Code *</Label>
          <Input
            id="zip"
            placeholder="XXXXX"
            className="input-gold h-9 text-sm"
            value={formData.zip}
            onChange={(e) => setFormData({ ...formData, zip: e.target.value })}
          />
        </div>
      </div>

      {/* Emergency Contact Section */}
      <div className="divider-gold my-4" />

      <div className="section-header-gold">
        <h3 className="text-base font-semibold text-foreground">Emergency Contact</h3>
        <p className="text-xs text-muted-foreground mt-0.5">
          Someone to contact in case of emergency
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="form-field-gold space-y-1">
          <Label htmlFor="emergencyContactName" className="text-xs font-medium">Full Name *</Label>
          <Input
            id="emergencyContactName"
            className="input-gold h-9 text-sm"
            value={formData.emergencyContactName}
            onChange={(e) => setFormData({ ...formData, emergencyContactName: e.target.value })}
          />
        </div>
        <div className="form-field-gold space-y-1">
          <Label htmlFor="emergencyContactRelationship" className="text-xs font-medium">Relationship *</Label>
          <Input
            id="emergencyContactRelationship"
            placeholder="e.g., Spouse, Parent"
            className="input-gold h-9 text-sm"
            value={formData.emergencyContactRelationship}
            onChange={(e) => setFormData({ ...formData, emergencyContactRelationship: e.target.value })}
          />
        </div>
        <div className="form-field-gold space-y-1">
          <Label htmlFor="emergencyContactPhone" className="text-xs font-medium">Phone Number *</Label>
          <Input
            id="emergencyContactPhone"
            type="tel"
            placeholder="(XXX) XXX-XXXX"
            className="input-gold h-9 text-sm"
            value={formData.emergencyContactPhone}
            onChange={(e) => setFormData({ ...formData, emergencyContactPhone: e.target.value })}
          />
        </div>
      </div>

      {/* Background Section */}
      <div className="divider-gold my-4" />

      <div className="section-header-gold">
        <h3 className="text-base font-semibold text-foreground flex items-center gap-2">
          <Shield className="w-4 h-4 text-gold" />
          Employment Eligibility
        </h3>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="form-field-gold space-y-1">
          <Label htmlFor="legallyAuthorized" className="text-xs font-medium">
            Legally authorized to work in the US as a commercial driver? *
          </Label>
          <select
            id="legallyAuthorized"
            className="input-gold w-full rounded-lg border border-input/50 bg-background px-3 py-2 text-sm h-9"
            value={formData.legallyAuthorized}
            onChange={(e) => setFormData({ ...formData, legallyAuthorized: e.target.value })}
          >
            <option value="">Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
        </div>

        <div className="form-field-gold space-y-1">
          <Label htmlFor="felonyConviction" className="text-xs font-medium">
            Have you ever been convicted of a felony? *
          </Label>
          <select
            id="felonyConviction"
            className="input-gold w-full rounded-lg border border-input/50 bg-background px-3 py-2 text-sm h-9"
            value={formData.felonyConviction}
            onChange={(e) => setFormData({ ...formData, felonyConviction: e.target.value })}
          >
            <option value="">Select...</option>
            <option value="yes">Yes</option>
            <option value="no">No</option>
          </select>
          <p className="text-[10px] text-muted-foreground">
            Conviction is not an automatic bar to employment.
          </p>
        </div>
      </div>

      {formData.felonyConviction === "yes" && (
        <div className="form-field-gold space-y-1">
          <Label htmlFor="felonyDetails" className="text-xs font-medium">Please explain</Label>
          <textarea
            id="felonyDetails"
            className="input-gold w-full rounded-lg border border-input/50 bg-background px-3 py-2 text-sm min-h-[80px] resize-none"
            value={formData.felonyDetails}
            onChange={(e) => setFormData({ ...formData, felonyDetails: e.target.value })}
            placeholder="Provide details about your conviction"
          />
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-end pt-4">
        <Button type="submit" className="btn-glossy-gold rounded-full px-6 gap-2 transition-all duration-200">
          Continue
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </form>
  );
};
