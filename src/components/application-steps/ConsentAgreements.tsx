import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, FileCheck, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface ConsentAgreementsProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export const ConsentAgreements = ({ data, onNext, onBack }: ConsentAgreementsProps) => {
  const existing = data?.consentAgreements || {};
  
  const [mvrConsent, setMvrConsent] = useState(existing.mvrConsent || false);
  const [mvrSignature, setMvrSignature] = useState(existing.mvrSignature || "");
  
  const [electronic1099Consent, setElectronic1099Consent] = useState(existing.electronic1099Consent || false);
  const [electronic1099Signature, setElectronic1099Signature] = useState(existing.electronic1099Signature || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({
      consentAgreements: {
        mvrConsent,
        mvrSignature,
        mvrDate: mvrConsent ? new Date().toISOString() : null,
        electronic1099Consent,
        electronic1099Signature,
        electronic1099Date: electronic1099Consent ? new Date().toISOString() : null,
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-2 text-scifi-text">Consent Agreements</h3>
        <p className="text-sm text-scifi-text-muted">
          Please review and acknowledge the following consent agreements to proceed with your application.
        </p>
      </div>

      {/* MVR Consent Section */}
      <Card className="p-6 bg-scifi-card border-scifi-border">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-scifi-purple/20">
            <ShieldCheck className="h-5 w-5 text-scifi-purple" />
          </div>
          <div>
            <h4 className="font-semibold text-scifi-text">Motor Vehicle Record (MVR) Authorization</h4>
            <p className="text-sm text-scifi-text-muted">Authorization to obtain driving records</p>
          </div>
        </div>
        
        <div className="bg-scifi-card-elevated rounded-lg p-4 mb-4 border border-scifi-border/50">
          <div className="space-y-3 text-sm text-scifi-text-muted">
            <p>
              I hereby authorize <strong className="text-scifi-text">the Company</strong> and any third-party 
              representatives or agents acting on the Company's behalf, to obtain my Motor Vehicle Record (MVR) 
              from the Department of Motor Vehicles (DMV) or any other relevant state agency.
            </p>
            <p>
              I understand that this information will be used to evaluate my qualifications for employment 
              as a commercial motor vehicle driver, and may be obtained at the time of application and 
              periodically throughout my employment.
            </p>
            <p>
              This authorization remains in effect for the duration of my employment with the Company. 
              I understand that the Company is required by the Federal Motor Carrier Safety Regulations 
              (49 CFR Part 391) to investigate my driving history.
            </p>
            <p>
              I release the Company, its agents, and any government agency providing this information 
              from any liability arising from the use of this authorization.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="mvr-consent"
              checked={mvrConsent}
              onCheckedChange={(checked) => setMvrConsent(checked as boolean)}
              className="data-[state=checked]:bg-scifi-purple data-[state=checked]:border-scifi-purple"
            />
            <label
              htmlFor="mvr-consent"
              className="text-sm font-medium leading-relaxed cursor-pointer text-scifi-text"
            >
              I authorize the Company and any authorized third party to obtain my Motor Vehicle Record (MVR) 
              from the DMV or any relevant state agency for employment evaluation purposes.
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="mvr-signature" className="text-scifi-text">Electronic Signature *</Label>
            <Input
              id="mvr-signature"
              placeholder="Type your full legal name"
              value={mvrSignature}
              onChange={(e) => setMvrSignature(e.target.value)}
              disabled={!mvrConsent}
              className="bg-scifi-card-elevated border-scifi-border text-scifi-text"
            />
            <p className="text-xs text-scifi-text-muted">
              By typing your name above, you are providing your electronic signature for this MVR authorization.
            </p>
          </div>
        </div>
      </Card>

      <Separator className="bg-scifi-border" />

      {/* 1099 Electronic Delivery Consent Section */}
      <Card className="p-6 bg-scifi-card border-scifi-border">
        <div className="flex items-start gap-3 mb-4">
          <div className="p-2 rounded-lg bg-scifi-cyan/20">
            <FileCheck className="h-5 w-5 text-scifi-cyan" />
          </div>
          <div>
            <h4 className="font-semibold text-scifi-text">Electronic 1099 Tax Form Delivery</h4>
            <p className="text-sm text-scifi-text-muted">Consent to receive tax documents electronically</p>
          </div>
        </div>
        
        <div className="bg-scifi-card-elevated rounded-lg p-4 mb-4 border border-scifi-border/50">
          <div className="space-y-3 text-sm text-scifi-text-muted">
            <p>
              I consent to receive my IRS Form 1099 (and any related tax documents) electronically 
              via email at the end of each calendar year, instead of receiving a paper copy by mail.
            </p>
            <p>
              I understand that:
            </p>
            <ul className="list-disc pl-6 space-y-1">
              <li>The 1099 form will be sent to the email address I have provided in this application.</li>
              <li>I am responsible for keeping my email address up to date with the Company.</li>
              <li>The electronic document is the legal equivalent of a paper 1099 form.</li>
              <li>I may need to print the document for my records or tax filing purposes.</li>
              <li>I can withdraw this consent at any time by notifying the Company in writing, 
                  in which case I will receive a paper 1099 by mail.</li>
            </ul>
            <p>
              If I do not consent to electronic delivery, I understand that I will receive my 1099 form 
              by mail to the address on file.
            </p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="1099-consent"
              checked={electronic1099Consent}
              onCheckedChange={(checked) => setElectronic1099Consent(checked as boolean)}
              className="data-[state=checked]:bg-scifi-cyan data-[state=checked]:border-scifi-cyan"
            />
            <label
              htmlFor="1099-consent"
              className="text-sm font-medium leading-relaxed cursor-pointer text-scifi-text"
            >
              I consent to receive my annual IRS Form 1099 and related tax documents electronically 
              via email, instead of receiving them by postal mail.
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="1099-signature" className="text-scifi-text">Electronic Signature *</Label>
            <Input
              id="1099-signature"
              placeholder="Type your full legal name"
              value={electronic1099Signature}
              onChange={(e) => setElectronic1099Signature(e.target.value)}
              disabled={!electronic1099Consent}
              className="bg-scifi-card-elevated border-scifi-border text-scifi-text"
            />
            <p className="text-xs text-scifi-text-muted">
              By typing your name above, you are providing your electronic signature for this consent.
            </p>
          </div>
        </div>
      </Card>

      {/* Info note */}
      <div className="p-4 rounded-lg bg-scifi-purple/10 border border-scifi-purple/30">
        <p className="text-sm text-scifi-text-muted">
          <strong className="text-scifi-text">Note:</strong> Both consents above are optional but recommended. 
          You may proceed without providing consent, but the MVR authorization is typically required 
          for commercial driver employment. Your selections will be recorded with today's date.
        </p>
      </div>

      <div className="flex justify-between pt-4">
        <Button type="button" variant="outline" onClick={onBack} className="gap-2 border-scifi-border text-scifi-text hover:bg-scifi-purple/10">
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>
        <Button type="submit" className="gap-2 btn-scifi">
          Next
          <ChevronRight className="w-4 h-4" />
        </Button>
      </div>
    </form>
  );
};
