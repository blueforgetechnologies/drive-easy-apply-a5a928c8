import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronLeft, ChevronRight } from "lucide-react";

interface LicenseInfoProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export const LicenseInfo = ({ data, onNext, onBack }: LicenseInfoProps) => {
  const [formData, setFormData] = useState({
    licenseNumber: data?.licenseInfo?.licenseNumber || "",
    licenseState: data?.licenseInfo?.licenseState || "",
    licenseClass: data?.licenseInfo?.licenseClass || "",
    endorsements: data?.licenseInfo?.endorsements || [],
    expirationDate: data?.licenseInfo?.expirationDate || "",
    yearsExperience: data?.licenseInfo?.yearsExperience || "",
  });

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
        ? prev.endorsements.filter((e) => e !== endorsementId)
        : [...prev.endorsements, endorsementId];
      return { ...prev, endorsements };
    });
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({ licenseInfo: formData });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-4 text-foreground">Driver's License Information</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Please provide your current driver's license details. You will upload a copy later.
        </p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="licenseNumber">Driver's License Number *</Label>
          <Input
            id="licenseNumber"
            value={formData.licenseNumber}
            onChange={(e) => setFormData({ ...formData, licenseNumber: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="licenseState">State Issued *</Label>
          <Input
            id="licenseState"
            placeholder="XX"
            maxLength={2}
            value={formData.licenseState}
            onChange={(e) =>
              setFormData({ ...formData, licenseState: e.target.value.toUpperCase() })
            }
          />
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="licenseClass">License Class *</Label>
          <Input
            id="licenseClass"
            placeholder="e.g., Class A, Class B"
            value={formData.licenseClass}
            onChange={(e) => setFormData({ ...formData, licenseClass: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="expirationDate">Expiration Date *</Label>
          <Input
            id="expirationDate"
            type="date"
            value={formData.expirationDate}
            onChange={(e) => setFormData({ ...formData, expirationDate: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="yearsExperience">Years of Commercial Driving Experience *</Label>
        <Input
          id="yearsExperience"
          type="number"
          min="0"
          value={formData.yearsExperience}
          onChange={(e) => setFormData({ ...formData, yearsExperience: e.target.value })}
        />
      </div>

      <div className="space-y-4">
        <Label>CDL Endorsements</Label>
        <p className="text-sm text-muted-foreground">
          Select all endorsements that apply to your license
        </p>
        <div className="space-y-3">
          {endorsementOptions.map((endorsement) => (
            <div key={endorsement.id} className="flex items-center space-x-2">
              <Checkbox
                id={endorsement.id}
                checked={formData.endorsements.includes(endorsement.id)}
                onCheckedChange={() => handleEndorsementChange(endorsement.id)}
              />
              <label
                htmlFor={endorsement.id}
                className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70"
              >
                {endorsement.label}
              </label>
            </div>
          ))}
        </div>
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
