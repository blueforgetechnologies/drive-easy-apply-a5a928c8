import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";

interface ContractorAgreementProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export const ContractorAgreement = ({ data, onNext, onBack }: ContractorAgreementProps) => {
  const [formData, setFormData] = useState({
    agreed: data?.contractorAgreement?.agreed || false,
    contractorName: data?.contractorAgreement?.contractorName || "",
    signature: data?.contractorAgreement?.signature || "",
    date: data?.contractorAgreement?.date || new Date().toISOString().split('T')[0],
    initials: data?.contractorAgreement?.initials || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({ contractorAgreement: formData });
  };

  const terminationReasons = [
    "Being rude, threatening or making unreasonable demands that will lead to conflict with dispatch or customers",
    "Damaging the vehicle due to negligence such as a collision with a low clearance bridge or a building",
    "Use or possession of any type of illegal drugs/alcohol in the vehicle",
    "Accepting payment from customers",
    "Damaging freight or equipment",
    "Reckless driving",
    "Using the wrong type of fuel on the vehicle",
    "Locking the keys in the vehicle",
    "Leaving lights or AC on which results in a dead battery",
    "Driving the truck with low oil/coolant without informing dispatch in writing (through text)",
    "Driving the truck with check engine light on without informing dispatch in writing (through text)",
    "Damaging the tires by driving on a sidewalk or an unpaved road",
    "Driving the vehicle on a non-paved road then getting stuck",
    "Driving with a suspended driver license",
    "Driving without filling out a logbook or while logbook is showing violation",
    "Having an unauthorized passenger in the vehicle",
    "Bailing out on us while in the middle of the load or after commitment has been made",
    "Making late deliveries/pickups without a valid cause",
    "Loading or unloading the truck without first obtaining permission from dispatch (through text)",
    "Leaving shippers or receivers prior to getting cleared to leave by dispatch",
    "Parking on the side of the highway without having an emergency such as a breakdown or health issues"
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-4 text-foreground">Contractor Agreement</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Please review the contractor agreement terms and conditions carefully.
        </p>
      </div>

      <Card className="p-6 space-y-4 bg-muted/50">
        <div>
          <h4 className="font-semibold mb-2 text-foreground">Agreement Overview</h4>
          <p className="text-sm text-muted-foreground">
            From time to time, the Carrier may hire the Contractor to haul freight using either their own vehicle or a Company-Provided Vehicle.
          </p>
        </div>

        <div>
          <h4 className="font-semibold mb-2 text-foreground">Company Vehicle Usage</h4>
          <p className="text-sm text-muted-foreground mb-2">
            If a Company Vehicle is provided, the Contractor has the right to use the vehicle for personal purposes with 2 conditions:
          </p>
          <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground ml-2">
            <li>Submitting a written request and obtaining written approval (text message will suffice)</li>
            <li>Covering all related expenses such as but not limited to (Fuel, Truck Payment, Tolls, Miles, Insurance, etc.)</li>
          </ol>
        </div>

        <div>
          <h4 className="font-semibold mb-3 text-foreground">Actions That May Result in Termination</h4>
          <p className="text-sm text-muted-foreground mb-3">
            Any of the following could result in termination, and any losses incurred will be deducted from the Settlement pay:
          </p>
          <ul className="space-y-2 text-sm text-muted-foreground">
            {terminationReasons.map((reason, index) => (
              <li key={index} className="flex gap-2">
                <span className="text-primary font-medium">•</span>
                <span>{reason}</span>
              </li>
            ))}
          </ul>
        </div>
      </Card>

      <div className="flex items-start space-x-3 p-4 border rounded-lg">
        <Checkbox
          id="agreed"
          checked={formData.agreed}
          onCheckedChange={(checked) => setFormData({ ...formData, agreed: checked as boolean })}
        />
        <div className="grid gap-1.5 leading-none">
          <Label
            htmlFor="agreed"
            className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70 cursor-pointer"
          >
            I agree to all the terms of this agreement without dispute
          </Label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="space-y-2 md:col-span-1">
          <Label htmlFor="contractorName">Contractor Name *</Label>
          <Input
            id="contractorName"
            value={formData.contractorName}
            onChange={(e) => setFormData({ ...formData, contractorName: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="initials">Initials *</Label>
          <Input
            id="initials"
            placeholder="XX"
            maxLength={3}
            value={formData.initials}
            onChange={(e) => setFormData({ ...formData, initials: e.target.value.toUpperCase() })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="date">Date *</Label>
          <Input
            id="date"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="signature">Contractor's Signature (Type your full name) *</Label>
        <Input
          id="signature"
          placeholder="Type your full name as signature"
          value={formData.signature}
          onChange={(e) => setFormData({ ...formData, signature: e.target.value })}
          className="font-serif text-lg"
        />
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
