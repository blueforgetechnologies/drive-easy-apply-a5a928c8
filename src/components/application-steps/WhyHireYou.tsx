import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Lightbulb, MessageSquare, Award, Clock, Shield, Users } from "lucide-react";

interface WhyHireYouProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  isPreviewMode?: boolean;
}

export const WhyHireYou = ({ data, onNext, onBack, isPreviewMode = false }: WhyHireYouProps) => {
  const isTestMode = isPreviewMode || (typeof window !== 'undefined' && localStorage.getItem("app_test_mode") === "true");
  
  const [statement, setStatement] = useState(data?.whyHireYou?.statement || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({
      whyHireYou: {
        statement,
      },
    });
  };

  const suggestions = [
    { icon: Clock, text: "Years of driving experience and types of vehicles operated" },
    { icon: Shield, text: "Safety record and any safety awards or recognitions" },
    { icon: Award, text: "Relevant certifications and endorsements" },
    { icon: Users, text: "Strong work ethic, reliability, and professionalism" },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header */}
      <div className="section-scifi p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-scifi-purple/20">
            <MessageSquare className="h-5 w-5 text-scifi-purple" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Why Should We Hire You?</h2>
            <p className="text-sm text-muted-foreground">
              This is your opportunity to stand out!
            </p>
          </div>
        </div>
      </div>

      {/* Tip Card */}
      <div className="flex items-start gap-3 p-3 rounded-lg bg-scifi-purple/10 border border-scifi-purple/30">
        <Lightbulb className="w-5 h-5 text-scifi-purple mt-0.5 flex-shrink-0" />
        <p className="text-sm text-scifi-text-muted">
          Tell us why you're the perfect candidate for this position. Be specific about your qualifications and experience.
        </p>
      </div>

      {/* Statement Section */}
      <div className="section-scifi">
        <div className="section-header-scifi">
          <h3 className="text-sm font-semibold text-scifi-text flex items-center gap-2">
            <MessageSquare className="w-4 h-4 text-scifi-cyan" />
            Your Statement
          </h3>
          <p className="text-xs text-scifi-text-muted mt-0.5">
            Explain why you should be considered for this position.
          </p>
        </div>

        <div className="mt-3 space-y-3">
          <Textarea
            id="statement"
            placeholder="Example: I have 10+ years of experience as a CDL-A driver with a clean driving record and no accidents. I hold endorsements for hazmat and tanker operations. My dedication to safety, punctuality, and professional communication makes me an ideal candidate. I've consistently maintained on-time delivery rates above 98% and received multiple safety awards..."
            value={statement}
            onChange={(e) => setStatement(e.target.value)}
            className="input-scifi min-h-[180px] resize-y text-sm"
          />
          <p className="text-xs text-scifi-text-muted">
            Minimum suggested length: 100 characters. Be specific and highlight what makes you unique.
          </p>
        </div>
      </div>

      {/* Suggestions Section */}
      <div className="section-scifi">
        <div className="section-header-scifi">
          <h3 className="text-sm font-semibold text-scifi-text flex items-center gap-2">
            <Lightbulb className="w-4 h-4 text-scifi-cyan" />
            Consider Mentioning
          </h3>
        </div>

        <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-2">
          {suggestions.map((item, index) => (
            <div 
              key={index} 
              className="flex items-center gap-2 p-2 rounded-lg bg-scifi-card/50 border border-scifi-border/50"
            >
              <item.icon className="w-4 h-4 text-scifi-cyan flex-shrink-0" />
              <span className="text-xs text-scifi-text-muted">{item.text}</span>
            </div>
          ))}
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
