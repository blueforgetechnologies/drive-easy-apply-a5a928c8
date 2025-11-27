import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";

interface DriverDispatchSheetProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export const DriverDispatchSheet = ({ data, onNext, onBack }: DriverDispatchSheetProps) => {
  const [formData, setFormData] = useState({
    agreed: data?.driverDispatchSheet?.agreed || false,
    driverFullName: data?.driverDispatchSheet?.driverFullName || "",
    signature: data?.driverDispatchSheet?.signature || "",
    date: data?.driverDispatchSheet?.date || new Date().toISOString().split('T')[0],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({ driverDispatchSheet: formData });
  };

  const rules = [
    "Must have your phone handy while in the truck, never on silent (communication is very important)",
    "When in the truck, you must be ready to drive within 15 to 20 minutes notice from the time of dispatch",
    "Once dispatched, you must text your dispatcher your ETA to shipper/receiver",
    "Truck must be clean and organized before arrival to shippers (Box swept)",
    "You must be fully clothed at Shippers/Receivers (Shirt, Pants, Shoes - No Flip Flops)",
    "Must be respectful to all our customers, if any issues arise, call dispatch",
    "Must text dispatch upon arrival to Shipper/Receiver/when fueling/when taking a break",
    "Once loaded, the driver must strap and secure the freight and the pallet jack using straps, blankets and load bars",
    "Look for damage to the freight, if damage is found, you must report it to shipper and dispatch (Send pictures)",
    "Once loaded, you must scan the BOL, all pages, then take a picture of the freight and email both to dispatch",
    "Truck box must be locked at all times, we provide locks and they must be used",
    "Do not leave shipper or receiver before you get cleared by dispatch",
    "Any delays while in transit must be reported to dispatch ASAP",
    "Never pull on the side of the interstate unless it's an emergency",
    "Never drive on a non-paved road (Gravel is ok)",
    "Must double check the freight prior to delivering it",
    "Once delivery is completed, receiver must sign BOL and print their First and Last name",
    "Once BOL has been signed by the receiver, you must scan the BOL and email it to dispatch",
    "Never drive more than 10 miles after drop off without informing and getting approval from dispatch",
    "Only fuel at major truck stops (Loves, Flying J, Pilots, TA, AM, AB, Petro...) - Absolutely no gas stations unless authorized by dispatch"
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-4 text-foreground">Driver Dispatch Sheet</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Please review and acknowledge the following operational rules and procedures.
        </p>
      </div>

      <Card className="p-6 bg-muted/50">
        <h4 className="font-semibold mb-4 text-foreground">Operational Rules & Procedures</h4>
        <ul className="space-y-3 text-sm text-muted-foreground">
          {rules.map((rule, index) => (
            <li key={index} className="flex gap-2">
              <span className="text-primary font-medium">•</span>
              <span>{rule}</span>
            </li>
          ))}
        </ul>
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
            I have read and agree to follow all the rules and procedures listed above
          </Label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="driverFullName">Print Full Name *</Label>
          <Input
            id="driverFullName"
            value={formData.driverFullName}
            onChange={(e) => setFormData({ ...formData, driverFullName: e.target.value })}
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
        <Label htmlFor="signature">Signature (Type your full name) *</Label>
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
