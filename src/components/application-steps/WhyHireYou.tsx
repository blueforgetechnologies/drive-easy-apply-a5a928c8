import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Lightbulb } from "lucide-react";
import { Card } from "@/components/ui/card";

interface WhyHireYouProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export const WhyHireYou = ({ data, onNext, onBack }: WhyHireYouProps) => {
  const [statement, setStatement] = useState(data?.whyHireYou?.statement || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({
      whyHireYou: {
        statement,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-4 text-foreground">
          Why Should We Hire You?
        </h3>
        <div className="flex items-start gap-2 p-4 bg-primary/10 border border-primary/20 rounded-lg mb-6">
          <Lightbulb className="w-5 h-5 text-primary mt-0.5 flex-shrink-0" />
          <p className="text-sm text-muted-foreground">
            This is your opportunity to stand out! Tell us why you're the perfect candidate
            for this position.
          </p>
        </div>
      </div>

      <Card className="p-6">
        <div className="space-y-4">
          <div>
            <Label htmlFor="statement" className="text-base font-semibold">
              Your Statement
            </Label>
            <p className="text-sm text-muted-foreground mt-1 mb-3">
              Please explain why you should be considered for this position. Include your
              qualifications, relevant experience, skills, certifications, and anything else
              that will improve your chances of being hired.
            </p>
          </div>

          <div className="space-y-2">
            <Textarea
              id="statement"
              placeholder="Example: I have 10+ years of experience as a CDL-A driver with a clean driving record and no accidents. I hold endorsements for hazmat and tanker operations. My dedication to safety, punctuality, and professional communication makes me an ideal candidate. I've consistently maintained on-time delivery rates above 98% and received multiple safety awards..."
              value={statement}
              onChange={(e) => setStatement(e.target.value)}
              className="min-h-[250px] resize-y"
            />
            <p className="text-xs text-muted-foreground">
              Minimum suggested length: 100 characters. Be specific and highlight what makes
              you unique.
            </p>
          </div>

          <div className="bg-muted/50 p-4 rounded-lg">
            <p className="text-sm font-medium mb-2 text-foreground">Consider mentioning:</p>
            <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
              <li>Years of driving experience and types of vehicles operated</li>
              <li>Safety record and any safety awards or recognitions</li>
              <li>Relevant certifications and endorsements</li>
              <li>Strong work ethic and reliability</li>
              <li>Communication skills and professionalism</li>
              <li>Willingness to work flexible hours or travel</li>
              <li>Any specialized skills or training</li>
            </ul>
          </div>
        </div>
      </Card>

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
