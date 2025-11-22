import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronLeft, ChevronRight, AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";

interface DrugAlcoholPolicyProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

export const DrugAlcoholPolicy = ({ data, onNext, onBack }: DrugAlcoholPolicyProps) => {
  const [agreed, setAgreed] = useState(data?.policyAcknowledgment?.agreedToPolicy || false);
  const [signature, setSignature] = useState(data?.policyAcknowledgment?.signature || "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({
      policyAcknowledgment: {
        agreedToPolicy: agreed,
        signature,
        dateSigned: new Date().toISOString(),
      },
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-4 text-foreground">Drug and Alcohol Policy</h3>
        <div className="flex items-start gap-2 p-4 bg-warning/10 border border-warning rounded-lg mb-6">
          <AlertTriangle className="w-5 h-5 text-warning mt-0.5 flex-shrink-0" />
          <p className="text-sm">
            Please read this policy carefully. You must acknowledge and sign to proceed with your
            application.
          </p>
        </div>
      </div>

      <Card className="p-6">
        <ScrollArea className="h-[400px] pr-4">
          <div className="space-y-4 text-sm">
            <section>
              <h4 className="font-semibold text-foreground mb-2">1. PURPOSE AND SCOPE</h4>
              <p className="text-muted-foreground">
                This Drug and Alcohol Testing Policy complies with the Federal Motor Carrier Safety
                Administration (FMCSA) regulations under 49 CFR Part 382. This policy applies to all
                drivers who operate commercial motor vehicles (CMVs) requiring a Commercial Driver's
                License (CDL).
              </p>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-2">2. PROHIBITED CONDUCT</h4>
              <div className="text-muted-foreground space-y-2">
                <p>Drivers are strictly prohibited from:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Reporting for duty or remaining on duty while having an alcohol concentration of 0.04 or greater</li>
                  <li>Using alcohol while on duty or operating a CMV</li>
                  <li>Using alcohol within 4 hours of reporting for duty</li>
                  <li>Refusing to submit to required alcohol or drug tests</li>
                  <li>Reporting for duty or remaining on duty when using any controlled substance, except when prescribed by a physician who has advised the driver that the substance will not adversely affect safe operation</li>
                  <li>Using, possessing, or being under the influence of illegal drugs while on duty</li>
                </ul>
              </div>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-2">3. TESTING REQUIREMENTS</h4>
              <div className="text-muted-foreground space-y-2">
                <p>Drivers will be subject to the following types of testing:</p>
                
                <div className="pl-4 space-y-3">
                  <div>
                    <p className="font-medium text-foreground">Pre-Employment Testing</p>
                    <p>All applicants must submit to and pass a drug test before performing safety-sensitive functions.</p>
                  </div>
                  
                  <div>
                    <p className="font-medium text-foreground">Random Testing</p>
                    <p>Drivers will be subject to unannounced random drug and alcohol testing. The selection is made using a scientifically valid method.</p>
                  </div>
                  
                  <div>
                    <p className="font-medium text-foreground">Post-Accident Testing</p>
                    <p>Testing is required after accidents involving fatalities, injuries requiring immediate medical treatment away from the scene, or disabling damage to any vehicle requiring tow-away.</p>
                  </div>
                  
                  <div>
                    <p className="font-medium text-foreground">Reasonable Suspicion Testing</p>
                    <p>Testing may be required when a trained supervisor has reasonable suspicion that a driver has violated drug and alcohol prohibitions.</p>
                  </div>
                  
                  <div>
                    <p className="font-medium text-foreground">Return-to-Duty Testing</p>
                    <p>Following a violation of drug and alcohol prohibitions, a driver must undergo evaluation by a Substance Abuse Professional (SAP) and pass a return-to-duty test before resuming safety-sensitive functions.</p>
                  </div>
                  
                  <div>
                    <p className="font-medium text-foreground">Follow-Up Testing</p>
                    <p>After returning to duty following a violation, drivers are subject to unannounced follow-up testing as directed by the SAP.</p>
                  </div>
                </div>
              </div>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-2">4. TESTING PROCEDURES</h4>
              <div className="text-muted-foreground space-y-2">
                <p><strong>Drug Testing:</strong> Conducted through urinalysis at a SAMHSA-certified laboratory. Tests screen for marijuana, cocaine, amphetamines, opioids, and phencyclidine (PCP).</p>
                <p><strong>Alcohol Testing:</strong> Conducted using an Evidential Breath Testing (EBT) device or approved saliva testing device operated by a trained Breath Alcohol Technician (BAT).</p>
              </div>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-2">5. CONSEQUENCES OF VIOLATIONS</h4>
              <div className="text-muted-foreground space-y-2">
                <p>A driver who violates any prohibition in this policy will be immediately removed from safety-sensitive functions. Consequences include:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Immediate removal from driving duties</li>
                  <li>Referral to a Substance Abuse Professional (SAP) for evaluation and treatment recommendations</li>
                  <li>Successful completion of SAP-recommended treatment or education programs</li>
                  <li>Return-to-duty test with negative result required before resuming duties</li>
                  <li>Possible termination of employment based on company policy</li>
                  <li>Follow-up testing for up to 5 years</li>
                </ul>
              </div>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-2">6. REFUSAL TO TEST</h4>
              <p className="text-muted-foreground">
                Refusal to submit to a required drug or alcohol test is considered a violation equivalent to testing positive. This includes failing to provide adequate specimens, adulterating or substituting specimens, failing to arrive at the testing site in a timely manner, or leaving the testing site before the process is complete.
              </p>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-2">7. DRIVER RIGHTS AND RESPONSIBILITIES</h4>
              <div className="text-muted-foreground space-y-2">
                <p>Drivers have the right to:</p>
                <ul className="list-disc pl-6 space-y-1">
                  <li>Request and receive information about the testing process</li>
                  <li>Have test results reported to them</li>
                  <li>Request and have split specimens tested at their expense if the initial test is positive</li>
                  <li>Information about resources available for evaluating and resolving problems associated with alcohol misuse and drug use</li>
                </ul>
              </div>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-2">8. CONFIDENTIALITY</h4>
              <p className="text-muted-foreground">
                All information received through the drug and alcohol testing program is confidential. Access to this information is limited to those with a legitimate need to know and is maintained in secure files separate from other personnel records.
              </p>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-2">9. EDUCATIONAL MATERIALS</h4>
              <p className="text-muted-foreground">
                The company will provide educational materials explaining the requirements of 49 CFR Part 382, the company's policies and procedures, and information about the effects of drug and alcohol use on health, work, and personal life.
              </p>
            </section>

            <section>
              <h4 className="font-semibold text-foreground mb-2">10. CONTACT INFORMATION</h4>
              <p className="text-muted-foreground">
                Questions about this policy should be directed to the company's Designated Employer Representative (DER) or Human Resources Department. For substance abuse assistance, drivers may contact the company's Employee Assistance Program (EAP).
              </p>
            </section>
          </div>
        </ScrollArea>
      </Card>

      <Card className="p-6 bg-muted/50">
        <div className="space-y-4">
          <div className="flex items-start space-x-3">
            <Checkbox
              id="agree"
              checked={agreed}
              onCheckedChange={(checked) => setAgreed(checked as boolean)}
            />
            <label
              htmlFor="agree"
              className="text-sm font-medium leading-relaxed cursor-pointer"
            >
              I acknowledge that I have read, understand, and agree to comply with the Drug and
              Alcohol Policy as outlined above. I understand that violation of this policy may result
              in disciplinary action, up to and including termination of employment.
            </label>
          </div>

          <div className="space-y-2">
            <Label htmlFor="signature">Electronic Signature *</Label>
            <Input
              id="signature"
              placeholder="Type your full name"
              value={signature}
              onChange={(e) => setSignature(e.target.value)}
              disabled={!agreed}
            />
            <p className="text-xs text-muted-foreground">
              By typing your name above, you are providing your electronic signature and certifying
              that all information is accurate.
            </p>
          </div>

          <div className="text-sm text-muted-foreground">
            <p>
              Date: <span className="font-medium">{new Date().toLocaleDateString()}</span>
            </p>
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
