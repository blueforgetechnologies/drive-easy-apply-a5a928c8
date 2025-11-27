import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface PayrollPolicyProps {
  data?: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

const PayrollPolicy = ({ data, onNext, onBack, isFirstStep }: PayrollPolicyProps) => {
  const [formData, setFormData] = useState({
    agreedName: data?.agreedName || "",
    signature: data?.signature || "",
    date: data?.date || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({ payrollPolicy: formData });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Payroll Policy</CardTitle>
          <CardDescription>Please read and acknowledge the payroll policy</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-4 p-6 bg-muted rounded-lg">
            <div>
              <h3 className="font-semibold mb-2">Pay Cycle</h3>
              <p className="text-sm">The pay cycle starts on Wednesdays and ends on Tuesdays.</p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Weekly Pay</h3>
              <p className="text-sm">The weekly pay is a minimum of $850 for a full 7 days of work.</p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Pay Schedule</h3>
              <p className="text-sm">Pay is sent on Wednesday; drivers will receive the pay on Thursdays unless it's a holiday.</p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Pay Hold</h3>
              <p className="text-sm">There will be a 1-week pay hold for all drivers; it will be released 2 weeks after you quit in good terms.</p>
            </div>

            <div>
              <h3 className="font-semibold mb-4">Conditions to Qualify for Minimum Weekly Pay of $850</h3>
              <ul className="list-disc list-inside space-y-2 text-sm">
                <li>Driver must follow dispatch instructions (See dispatch sheet for reference)</li>
                <li>Driver must be on the road for the full 7 days (Wednesday to Tuesday), with no restrictions</li>
                <li>Driver's actions or mistakes must not cause loss of a load or waste a day</li>
                <li>Late deliveries or drop-offs caused by the driver may result in losing the minimum pay</li>
                <li>Damage to property (cargo, equipment, etc.) may result in losing the minimum pay and deductions may apply</li>
                <li>Quitting without giving a 14-day notice in writing (text message only) or being terminated may result in losing the pay hold and final pay</li>
              </ul>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <div>
              <Label htmlFor="agreedName">I agree to all the terms of this agreement without dispute</Label>
              <Input
                id="agreedName"
                placeholder="Full Legal Name"
                value={formData.agreedName}
                onChange={(e) => setFormData({ ...formData, agreedName: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="signature">Driver Signature</Label>
                <Input
                  id="signature"
                  placeholder="Type your full name"
                  value={formData.signature}
                  onChange={(e) => setFormData({ ...formData, signature: e.target.value })}
                  required
                />
              </div>

              <div>
                <Label htmlFor="date">Date</Label>
                <Input
                  id="date"
                  type="date"
                  value={formData.date}
                  onChange={(e) => setFormData({ ...formData, date: e.target.value })}
                  required
                />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex justify-between">
        {!isFirstStep && (
          <Button type="button" variant="outline" onClick={onBack}>
            Back
          </Button>
        )}
        <Button type="submit" className="ml-auto">
          Next
        </Button>
      </div>
    </form>
  );
};

export default PayrollPolicy;