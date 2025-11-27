import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { ChevronRight, ChevronLeft } from "lucide-react";
import { Card } from "@/components/ui/card";

interface NoRiderPolicyProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export const NoRiderPolicy = ({ data, onNext, onBack }: NoRiderPolicyProps) => {
  const [formData, setFormData] = useState({
    agreed: data?.noRiderPolicy?.agreed || false,
    employeeName: data?.noRiderPolicy?.employeeName || "",
    signature: data?.noRiderPolicy?.signature || "",
    date: data?.noRiderPolicy?.date || new Date().toISOString().split('T')[0],
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({ noRiderPolicy: formData });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-4 text-foreground">No Rider Policy</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Please review and acknowledge the company's No Rider Policy.
        </p>
      </div>

      <Card className="p-6 space-y-4 bg-muted/50">
        <div>
          <h4 className="font-semibold mb-2 text-foreground">1. Purpose</h4>
          <p className="text-sm text-muted-foreground">
            This policy ensures the safety, security, and compliance of the Company with respect to the use of equipment, trucks, or trailers. The use of equipment by unauthorized individuals poses potential risks to our operations, safety, and reputation.
          </p>
        </div>

        <div>
          <h4 className="font-semibold mb-2 text-foreground">2. Scope</h4>
          <p className="text-sm text-muted-foreground">
            This policy applies to all employees, contractors, and individuals associated with the Company, including drivers, dispatchers, maintenance personnel, and management.
          </p>
        </div>

        <div>
          <h4 className="font-semibold mb-2 text-foreground">3. Policy</h4>
          <div className="space-y-3 text-sm text-muted-foreground">
            <div>
              <p className="font-medium text-foreground mb-1">3.1 Rider Prohibition</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>No person, other than an employee or authorized contractor, is permitted to operate or ride in Company Assets</li>
                <li>Employees and contractors are strictly prohibited from allowing any unauthorized person to operate or ride in Company Assets</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">3.2 Authorization Process</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Only employees and contractors authorized by the Company may operate or use Company Assets</li>
                <li>Authorization requires proper licensing, training, and compliance with company policies</li>
              </ul>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">3.3 Enforcement</p>
              <ul className="list-disc list-inside space-y-1 ml-2">
                <li>Violation may result in disciplinary action, up to and including termination</li>
                <li>The Company may report unauthorized use to relevant authorities and take legal action</li>
              </ul>
            </div>
          </div>
        </div>

        <div>
          <h4 className="font-semibold mb-2 text-foreground">4. Reporting Unauthorized Use</h4>
          <p className="text-sm text-muted-foreground">
            Employees must promptly report any instances of unauthorized individuals attempting to operate or ride in Company Assets to their immediate supervisor or management.
          </p>
        </div>

        <div>
          <h4 className="font-semibold mb-2 text-foreground">5. Compliance with Applicable Laws</h4>
          <p className="text-sm text-muted-foreground">
            The Company will comply with all applicable federal, state, and local laws and regulations related to the operation of commercial vehicles, including the Federal Motor Carrier Safety Regulations (FMCSRs).
          </p>
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
            I affirm my understanding and commitment to complying with the No Rider Policy
          </Label>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="employeeName">Employee/Contractor Name *</Label>
          <Input
            id="employeeName"
            value={formData.employeeName}
            onChange={(e) => setFormData({ ...formData, employeeName: e.target.value })}
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
