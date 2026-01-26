import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { IdCard, Calendar, Award, AlertTriangle, FileCheck } from "lucide-react";

interface LicenseInfoProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  isPreviewMode?: boolean;
}

export const LicenseInfo = ({ data, onNext, onBack, isPreviewMode = false }: LicenseInfoProps) => {
  const isTestMode = isPreviewMode || (typeof window !== 'undefined' && localStorage.getItem("app_test_mode") === "true");
  
  const [formData, setFormData] = useState({
    nameOnLicense: data?.licenseInfo?.nameOnLicense || "",
    licenseNumber: data?.licenseInfo?.licenseNumber || "",
    licenseState: data?.licenseInfo?.licenseState || "",
    licenseClass: data?.licenseInfo?.licenseClass || "",
    endorsements: data?.licenseInfo?.endorsements || [],
    issuedDate: data?.licenseInfo?.issuedDate || "",
    expirationDate: data?.licenseInfo?.expirationDate || "",
    hasDotMedicalCert: data?.licenseInfo?.hasDotMedicalCert || "",
    nationalRegistryNumber: data?.licenseInfo?.nationalRegistryNumber || "",
    medicalCardExpiration: data?.licenseInfo?.medicalCardExpiration || "",
    yearsExperience: data?.licenseInfo?.yearsExperience || "",
    deniedLicense: data?.licenseInfo?.deniedLicense || "",
    suspendedRevoked: data?.licenseInfo?.suspendedRevoked || "",
    deniedDetails: data?.licenseInfo?.deniedDetails || "",
    suspendedDetails: data?.licenseInfo?.suspendedDetails || "",
  });
  
  // Track if this is the initial mount to prevent overwriting user-entered data
  const hasInitialized = useRef(false);
  
  // Sync form data with prop changes ONLY on initial mount
  useEffect(() => {
    if (data?.licenseInfo && !hasInitialized.current) {
      hasInitialized.current = true;
      setFormData({
        nameOnLicense: data.licenseInfo.nameOnLicense || "",
        licenseNumber: data.licenseInfo.licenseNumber || "",
        licenseState: data.licenseInfo.licenseState || "",
        licenseClass: data.licenseInfo.licenseClass || "",
        endorsements: data.licenseInfo.endorsements || [],
        issuedDate: data.licenseInfo.issuedDate || "",
        expirationDate: data.licenseInfo.expirationDate || "",
        hasDotMedicalCert: data.licenseInfo.hasDotMedicalCert || "",
        nationalRegistryNumber: data.licenseInfo.nationalRegistryNumber || "",
        medicalCardExpiration: data.licenseInfo.medicalCardExpiration || "",
        yearsExperience: data.licenseInfo.yearsExperience || "",
        deniedLicense: data.licenseInfo.deniedLicense || "",
        suspendedRevoked: data.licenseInfo.suspendedRevoked || "",
        deniedDetails: data.licenseInfo.deniedDetails || "",
        suspendedDetails: data.licenseInfo.suspendedDetails || "",
      });
    }
  }, [data?.licenseInfo]);

  const endorsementOptions = [
    { id: "H", label: "H - Hazardous Materials" },
    { id: "N", label: "N - Tank Vehicles" },
    { id: "P", label: "P - Passenger" },
    { id: "S", label: "S - School Bus" },
    { id: "T", label: "T - Double/Triple Trailers" },
    { id: "X", label: "X - Combined Tank/Hazmat" },
  ];

  const handleEndorsementChange = (endorsementId: string) => {
    setFormData((prev) => {
      const endorsements = prev.endorsements.includes(endorsementId)
        ? prev.endorsements.filter((e: string) => e !== endorsementId)
        : [...prev.endorsements, endorsementId];
      return { ...prev, endorsements };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    e.stopPropagation(); // Prevent event bubbling
    onNext({ licenseInfo: formData });
  };

  const isCommercialLicense = ["A", "B", "C", "CLASS A", "CLASS B", "CLASS C"].some(
    cls => formData.licenseClass.toUpperCase().includes(cls)
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header */}
      <div className="section-scifi p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-scifi-purple/20">
            <IdCard className="h-5 w-5 text-scifi-purple" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">
              {isCommercialLicense ? "Commercial Driver's License (CDL)" : "Driver's License Information"}
            </h2>
            <p className="text-sm text-muted-foreground">
              Please provide your current driver's license details.
            </p>
          </div>
        </div>
      </div>

      {/* License Details Section */}
      <div className="section-scifi">
        <div className="section-header-scifi">
          <h3 className="text-sm font-semibold text-scifi-text flex items-center gap-2">
            <IdCard className="w-4 h-4 text-scifi-cyan" />
            License Details
          </h3>
        </div>

        <div className="space-y-3 mt-3">
          <div className="form-field-scifi space-y-1">
            <Label htmlFor="nameOnLicense" className="label-scifi">Name as it Appears on License *</Label>
            <Input
              id="nameOnLicense"
              placeholder="Full name on driver's license"
              className="input-scifi h-9 text-sm"
              value={formData.nameOnLicense}
              onChange={(e) => setFormData({ ...formData, nameOnLicense: e.target.value })}
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="form-field-scifi space-y-1">
              <Label htmlFor="licenseNumber" className="label-scifi">Driver's License Number (DL#) *</Label>
              <Input
                id="licenseNumber"
                className="input-scifi h-9 text-sm"
                value={formData.licenseNumber}
                onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
              />
            </div>
            <div className="form-field-scifi space-y-1">
              <Label htmlFor="licenseState" className="label-scifi">State Issued *</Label>
              <Input
                id="licenseState"
                placeholder="XX"
                maxLength={2}
                className="input-scifi h-9 text-sm uppercase"
                value={formData.licenseState}
                onChange={(e) =>
                  setFormData({ ...formData, licenseState: e.target.value.toUpperCase() })
                }
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            <div className="form-field-scifi space-y-1">
              <Label htmlFor="licenseClass" className="label-scifi">License Class *</Label>
              <Input
                id="licenseClass"
                placeholder="e.g., Class A, Class B"
                className="input-scifi h-9 text-sm"
                value={formData.licenseClass}
                onChange={(e) => setFormData({ ...formData, licenseClass: e.target.value })}
              />
            </div>
            <div className="form-field-scifi space-y-1">
              <Label htmlFor="issuedDate" className="label-scifi flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Issued Date *
              </Label>
              <Input
                id="issuedDate"
                type="date"
                className="input-scifi h-9 text-sm"
                value={formData.issuedDate}
                onChange={(e) => setFormData({ ...formData, issuedDate: e.target.value })}
              />
            </div>
            <div className="form-field-scifi space-y-1">
              <Label htmlFor="expirationDate" className="label-scifi flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5" />
                Expiration Date *
              </Label>
              <Input
                id="expirationDate"
                type="date"
                className="input-scifi h-9 text-sm"
                value={formData.expirationDate}
                onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
              />
            </div>
          </div>

          <div className="form-field-scifi space-y-1">
            <Label htmlFor="yearsExperience" className="label-scifi">Years of Commercial Driving Experience *</Label>
            <Input
              id="yearsExperience"
              type="number"
              min="0"
              className="input-scifi h-9 text-sm w-32"
              value={formData.yearsExperience}
              onChange={(e) => setFormData({ ...formData, yearsExperience: e.target.value })}
            />
          </div>
        </div>
      </div>

      {/* Endorsements Section */}
      <div className="section-scifi">
        <div className="section-header-scifi">
          <h3 className="text-sm font-semibold text-scifi-text flex items-center gap-2">
            <Award className="w-4 h-4 text-scifi-cyan" />
            CDL Endorsements
          </h3>
          <p className="text-xs text-scifi-text-muted mt-0.5">
            Select all endorsements that apply to your license
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3">
          {endorsementOptions.map((endorsement) => (
            <div 
              key={endorsement.id} 
              className="flex items-center space-x-2 p-2 rounded-lg bg-scifi-card/50 border border-scifi-border/50 hover:border-scifi-purple/30 transition-colors"
            >
              <Checkbox
                id={endorsement.id}
                checked={formData.endorsements.includes(endorsement.id)}
                onCheckedChange={() => handleEndorsementChange(endorsement.id)}
                className="border-scifi-border data-[state=checked]:bg-scifi-purple data-[state=checked]:border-scifi-purple"
              />
              <label
                htmlFor={endorsement.id}
                className="text-sm font-medium text-scifi-text cursor-pointer"
              >
                {endorsement.label}
              </label>
            </div>
          ))}
        </div>
      </div>

      {/* Medical Certificate Section */}
      <div className="section-scifi">
        <div className="section-header-scifi">
          <h3 className="text-sm font-semibold text-scifi-text flex items-center gap-2">
            <FileCheck className="w-4 h-4 text-scifi-cyan" />
            DOT Medical Certificate
          </h3>
        </div>

        <div className="space-y-3 mt-3">
          <div className="form-field-scifi space-y-1">
            <Label htmlFor="hasDotMedicalCert" className="label-scifi">
              Do you possess a DOT Medical Examiner Certificate? *
            </Label>
            <select
              id="hasDotMedicalCert"
              className="input-scifi h-9 text-sm w-full"
              value={formData.hasDotMedicalCert}
              onChange={(e) => setFormData({ ...formData, hasDotMedicalCert: e.target.value })}
            >
              <option value="">Select...</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </div>

          {formData.hasDotMedicalCert === "yes" && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 p-3 rounded-lg bg-scifi-purple/10 border border-scifi-purple/20">
              <div className="form-field-scifi space-y-1">
                <Label htmlFor="nationalRegistryNumber" className="label-scifi">National Registry Number *</Label>
                <Input
                  id="nationalRegistryNumber"
                  placeholder="Enter national registry number"
                  className="input-scifi h-9 text-sm"
                  value={formData.nationalRegistryNumber}
                  onChange={(e) => setFormData({ ...formData, nationalRegistryNumber: e.target.value })}
                />
              </div>
              <div className="form-field-scifi space-y-1">
                <Label htmlFor="medicalCardExpiration" className="label-scifi flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5" />
                  Medical Card Expiration *
                </Label>
                <Input
                  id="medicalCardExpiration"
                  type="date"
                  className="input-scifi h-9 text-sm"
                  value={formData.medicalCardExpiration}
                  onChange={(e) => setFormData({ ...formData, medicalCardExpiration: e.target.value })}
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* License History Section */}
      <div className="section-scifi">
        <div className="section-header-scifi">
          <h3 className="text-sm font-semibold text-scifi-text flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-scifi-cyan" />
            License History
          </h3>
        </div>

        <div className="space-y-3 mt-3">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="form-field-scifi space-y-1">
              <Label htmlFor="deniedLicense" className="label-scifi text-xs">
                Have you ever been denied a license, permit or privilege to operate a motor vehicle? *
              </Label>
              <select
                id="deniedLicense"
                className="input-scifi h-9 text-sm w-full"
                value={formData.deniedLicense}
                onChange={(e) => setFormData({ ...formData, deniedLicense: e.target.value })}
              >
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>

            <div className="form-field-scifi space-y-1">
              <Label htmlFor="suspendedRevoked" className="label-scifi text-xs">
                Has any license, permit or privilege ever been suspended or revoked? *
              </Label>
              <select
                id="suspendedRevoked"
                className="input-scifi h-9 text-sm w-full"
                value={formData.suspendedRevoked}
                onChange={(e) => setFormData({ ...formData, suspendedRevoked: e.target.value })}
              >
                <option value="">Select...</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </div>
          </div>

          {formData.deniedLicense === "yes" && (
            <div className="form-field-scifi space-y-1 p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <Label htmlFor="deniedDetails" className="label-scifi text-amber-400">
                Details about license denial *
              </Label>
              <textarea
                id="deniedDetails"
                className="input-scifi w-full min-h-[80px] text-sm resize-y"
                value={formData.deniedDetails}
                onChange={(e) => setFormData({ ...formData, deniedDetails: e.target.value })}
                placeholder="Explain the circumstances of your license denial"
              />
            </div>
          )}

          {formData.suspendedRevoked === "yes" && (
            <div className="form-field-scifi space-y-1 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
              <Label htmlFor="suspendedDetails" className="label-scifi text-destructive">
                Details about suspension/revocation *
              </Label>
              <textarea
                id="suspendedDetails"
                className="input-scifi w-full min-h-[80px] text-sm resize-y"
                value={formData.suspendedDetails}
                onChange={(e) => setFormData({ ...formData, suspendedDetails: e.target.value })}
                placeholder="Explain the circumstances of your license suspension or revocation"
              />
            </div>
          )}
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
