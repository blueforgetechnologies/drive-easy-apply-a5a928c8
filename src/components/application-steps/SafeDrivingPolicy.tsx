import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface SafeDrivingPolicyProps {
  data?: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

const SafeDrivingPolicy = ({ data, onNext, onBack, isFirstStep }: SafeDrivingPolicyProps) => {
  const [formData, setFormData] = useState({
    printName: data?.printName || "",
    signature: data?.signature || "",
    date: data?.date || "",
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({ safeDrivingPolicy: formData });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Safe Driving Policy</CardTitle>
          <CardDescription>Please read and acknowledge the safe driving policy</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="space-y-6 p-6 bg-muted rounded-lg">
            <div>
              <h3 className="font-semibold mb-2">Tailgating</h3>
              <p className="text-sm">
                Do not follow other vehicles too close. A safe driver must keep a minimum of 6 seconds between his truck and the vehicle in front. 
                Following too close will lead into an accident, guaranteed! All trucks are equipped with sensors and trackers to detect bad driving habits 
                such as tailgating. If such driving habits are detected, we will give you a strike. The third strike will be followed with an immediate termination.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">New York Driving</h3>
              <ol className="list-decimal list-inside space-y-2 text-sm">
                <li>
                  Be extremely cautious and alert at all times when driving in New York. You must be expecting other vehicles to come to an immediate stop. 
                  If you are not keeping your distance, this will lead into a collision. KEEP your distance!
                </li>
                <li>
                  Under no circumstance drive the truck on a Parkway! No exceptions. It is illegal and could result in a major accident and huge fines to the driver. 
                  Keep off Parkways! Only drive on Express way, Road, Interstate, Blvd, ST... everything is good EXCEPT PARKWAYS. Stay off parkways.
                </li>
              </ol>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Low Clearance Bridges</h3>
              <p className="text-sm">
                Be cautious and on the lookout for low clearance bridges. All our trucks are equipped with Trucker's GPS, but from time to time there will be 
                a low clearance bridge. You must always know the clearance of the bridge before you rush to drive under.
              </p>
            </div>

            <div>
              <h3 className="font-semibold mb-2">Road Rage</h3>
              <p className="text-sm">
                Remember why you are here. You have a job to do and a family to provide for. You are a professional truck driver. You drive in one day more than 
                most people drive in a month. You are the expert. There will be times when drivers will cut you off or come to a sudden stop directly in front of you, 
                not considering that a big truck requires more distance to come to a full stop. They will make you upset at times.
              </p>
              <p className="text-sm mt-2">
                Here is advice from a professional driver to another: ignore them and keep moving forward with your day. You will not need to fight them, teach them, 
                nor ever meet them again. This will help you keep your sanity intact. Think positive!
              </p>
            </div>
          </div>

          <div className="space-y-4 pt-4 border-t">
            <p className="text-sm font-medium">By signing below, I acknowledge that I have read this notice and agree with its content</p>
            
            <div>
              <Label htmlFor="printName">Print Name</Label>
              <Input
                id="printName"
                placeholder="Full Legal Name"
                value={formData.printName}
                onChange={(e) => setFormData({ ...formData, printName: e.target.value })}
                required
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="signature">Signature</Label>
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

export default SafeDrivingPolicy;