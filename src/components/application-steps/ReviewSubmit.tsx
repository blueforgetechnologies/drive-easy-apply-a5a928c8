import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, Check } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useState } from "react";

interface ReviewSubmitProps {
  data: any;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  onNext?: (data: any) => void;
}

export const ReviewSubmit = ({ data, onBack }: ReviewSubmitProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    try {
      console.log("Submitting application for:", data?.personalInfo?.email);
      
      // First, save to database
      const { error: dbError } = await supabase
        .from('applications')
        .insert({
          personal_info: data.personalInfo,
          payroll_policy: data.payrollPolicy || {},
          license_info: data.licenseInfo,
          driving_history: data.drivingHistory || {},
          employment_history: data.employmentHistory || {},
          document_upload: data.documents || {},
          drug_alcohol_policy: data.policyAcknowledgment || {},
          driver_dispatch_sheet: data.driverDispatchSheet || {},
          no_rider_policy: data.noRiderPolicy || {},
          safe_driving_policy: data.safeDrivingPolicy || {},
          contractor_agreement: data.contractorAgreement || {},
          direct_deposit: data.directDeposit || {},
          why_hire_you: data.whyHireYou || {},
          status: 'pending',
          driver_status: 'pending'
        });

      if (dbError) {
        console.error("Error saving to database:", dbError);
        toast.error("Failed to save application", {
          description: "Please try again or contact support.",
        });
        return;
      }

      // Then send email notification
      const { error: emailError } = await supabase.functions.invoke('send-application', {
        body: data
      });

      if (emailError) {
        console.error("Error sending email:", emailError);
        // Application is saved but email failed - still show success
        toast.success("Application submitted successfully!", {
          description: "Your application has been saved. Email notification may be delayed.",
        });
      } else {
        console.log("Application sent successfully");
        toast.success("Application submitted successfully!", {
          description: "We will review your application and contact you soon.",
        });
      }
    } catch (error) {
      console.error("Error:", error);
      toast.error("Failed to submit application", {
        description: "Please check your internet connection and try again.",
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h3 className="text-xl font-semibold mb-4 text-foreground">Review & Submit</h3>
        <p className="text-sm text-muted-foreground mb-6">
          Please review your information before submitting. You can go back to edit any section.
        </p>
      </div>

      {/* Personal Information */}
      <Card className="p-4 sm:p-6">
        <h4 className="font-semibold mb-4 text-foreground">Personal Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Name</p>
            <p className="font-medium">
              {data?.personalInfo?.firstName} {data?.personalInfo?.middleName}{" "}
              {data?.personalInfo?.lastName}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Date of Birth</p>
            <p className="font-medium">{data?.personalInfo?.dob}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Phone</p>
            <p className="font-medium">{data?.personalInfo?.phone}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Email</p>
            <p className="font-medium">{data?.personalInfo?.email}</p>
          </div>
          <div className="md:col-span-2">
            <p className="text-muted-foreground">Address</p>
            <p className="font-medium">
              {data?.personalInfo?.address}, {data?.personalInfo?.city},{" "}
              {data?.personalInfo?.state} {data?.personalInfo?.zip}
            </p>
          </div>
          <div>
            <p className="text-muted-foreground">Legally Authorized to Work</p>
            <p className="font-medium capitalize">{data?.personalInfo?.legallyAuthorized}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Felony Conviction</p>
            <p className="font-medium capitalize">{data?.personalInfo?.felonyConviction}</p>
          </div>
          {data?.personalInfo?.felonyDetails && (
            <div className="md:col-span-2">
              <p className="text-muted-foreground">Felony Details</p>
              <p className="font-medium text-sm">{data?.personalInfo?.felonyDetails}</p>
            </div>
          )}
          <div className="md:col-span-2 pt-2 border-t">
            <p className="text-muted-foreground font-medium mb-2">Emergency Contact</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <p className="text-xs text-muted-foreground">Name</p>
                <p className="font-medium">{data?.personalInfo?.emergencyContactName}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Relationship</p>
                <p className="font-medium">{data?.personalInfo?.emergencyContactRelationship}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Phone</p>
                <p className="font-medium">{data?.personalInfo?.emergencyContactPhone}</p>
              </div>
            </div>
          </div>
        </div>
      </Card>

      {/* Payroll Policy */}
      {data?.payrollPolicy && (
        <Card className="p-4 sm:p-6">
          <h4 className="font-semibold mb-4 text-foreground">Payroll Policy Acknowledgment</h4>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-4 text-sm">
            <div>
              <p className="text-muted-foreground">Name</p>
              <p className="font-medium">{data?.payrollPolicy?.agreedName}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Signature</p>
              <p className="font-medium">{data?.payrollPolicy?.signature}</p>
            </div>
            <div>
              <p className="text-muted-foreground">Date</p>
              <p className="font-medium">{data?.payrollPolicy?.date ? new Date(data.payrollPolicy.date).toLocaleDateString() : "N/A"}</p>
            </div>
          </div>
        </Card>
      )}

      {/* License Information */}
      <Card className="p-4 sm:p-6">
        <h4 className="font-semibold mb-4 text-foreground">License Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">License Number</p>
            <p className="font-medium">{data?.licenseInfo?.licenseNumber}</p>
          </div>
          <div>
            <p className="text-muted-foreground">State</p>
            <p className="font-medium">{data?.licenseInfo?.licenseState}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Class</p>
            <p className="font-medium">{data?.licenseInfo?.licenseClass}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Experience</p>
            <p className="font-medium">{data?.licenseInfo?.yearsExperience} years</p>
          </div>
          {data?.licenseInfo?.endorsements?.length > 0 && (
            <div className="md:col-span-2">
              <p className="text-muted-foreground">Endorsements</p>
              <p className="font-medium">{data?.licenseInfo?.endorsements.join(", ")}</p>
            </div>
          )}
          <div>
            <p className="text-muted-foreground">License Denied</p>
            <p className="font-medium capitalize">{data?.licenseInfo?.deniedLicense}</p>
          </div>
          <div>
            <p className="text-muted-foreground">License Suspended/Revoked</p>
            <p className="font-medium capitalize">{data?.licenseInfo?.suspendedRevoked}</p>
          </div>
          {data?.licenseInfo?.deniedDetails && (
            <div className="md:col-span-2">
              <p className="text-muted-foreground">Details</p>
              <p className="font-medium text-sm">{data?.licenseInfo?.deniedDetails}</p>
            </div>
          )}
        </div>
      </Card>

      {/* Employment History */}
      <Card className="p-4 sm:p-6">
        <h4 className="font-semibold mb-4 text-foreground">Employment History</h4>
        <p className="text-sm text-muted-foreground mb-2">
          {data?.employmentHistory?.length || 0} employer(s) listed
        </p>
      </Card>

      {/* Driving History */}
      <Card className="p-4 sm:p-6">
        <h4 className="font-semibold mb-4 text-foreground">Driving History</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Accidents Reported</p>
            <p className="font-medium">{data?.drivingHistory?.accidents?.length || 0}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Violations Reported</p>
            <p className="font-medium">{data?.drivingHistory?.violations?.length || 0}</p>
          </div>
        </div>
      </Card>

      {/* Documents */}
      <Card className="p-4 sm:p-6">
        <h4 className="font-semibold mb-4 text-foreground">Documents Uploaded</h4>
        <div className="space-y-2 text-sm">
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-success" />
            <span>Social Security Card</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-success" />
            <span>Driver's License</span>
          </div>
          <div className="flex items-center gap-2">
            <Check className="w-4 h-4 text-success" />
            <span>Medical Card</span>
          </div>
          {data?.documents?.other?.length > 0 && (
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-success" />
              <span>{data?.documents?.other?.length} additional document(s)</span>
            </div>
          )}
        </div>
      </Card>

      {/* Direct Deposit */}
      <Card className="p-4 sm:p-6">
        <h4 className="font-semibold mb-4 text-foreground">Direct Deposit Information</h4>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 text-sm">
          <div>
            <p className="text-muted-foreground">Name</p>
            <p className="font-medium">{data?.directDeposit?.firstName} {data?.directDeposit?.lastName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Bank</p>
            <p className="font-medium">{data?.directDeposit?.bankName}</p>
          </div>
          <div>
            <p className="text-muted-foreground">Account Type</p>
            <p className="font-medium capitalize">{data?.directDeposit?.accountType?.replace('-', ' ')}</p>
          </div>
        </div>
      </Card>

      {/* Policy Acknowledgments */}
      <Card className="p-4 sm:p-6 bg-success/10 border-success">
        <h4 className="font-semibold mb-4 text-foreground">Policies & Agreements Acknowledged</h4>
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground">Drug & Alcohol Policy</p>
              <p className="text-xs text-muted-foreground">
                Signed by {data?.policyAcknowledgment?.signature} on{" "}
                {data?.policyAcknowledgment?.dateSigned
                  ? new Date(data.policyAcknowledgment.dateSigned).toLocaleDateString()
                  : "N/A"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground">Driver Dispatch Sheet</p>
              <p className="text-xs text-muted-foreground">
                Signed by {data?.driverDispatchSheet?.signature} on{" "}
                {data?.driverDispatchSheet?.date
                  ? new Date(data.driverDispatchSheet.date).toLocaleDateString()
                  : "N/A"}
              </p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground">No Ryder Policy</p>
              <p className="text-xs text-muted-foreground">
                Signed by {data?.noRyderPolicy?.signature} on{" "}
                {data?.noRyderPolicy?.date
                  ? new Date(data.noRyderPolicy.date).toLocaleDateString()
                  : "N/A"}
              </p>
            </div>
          </div>
          {data?.safeDrivingPolicy && (
            <div className="flex items-start gap-3">
              <Check className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
              <div>
                <p className="font-medium text-foreground">Safe Driving Policy</p>
                <p className="text-xs text-muted-foreground">
                  Signed by {data?.safeDrivingPolicy?.signature} on{" "}
                  {data?.safeDrivingPolicy?.date
                    ? new Date(data.safeDrivingPolicy.date).toLocaleDateString()
                    : "N/A"}
                </p>
              </div>
            </div>
          )}
          <div className="flex items-start gap-3">
            <Check className="w-5 h-5 text-success mt-0.5 flex-shrink-0" />
            <div>
              <p className="font-medium text-foreground">Contractor Agreement</p>
              <p className="text-xs text-muted-foreground">
                Signed by {data?.contractorAgreement?.signature} (Initials: {data?.contractorAgreement?.initials}) on{" "}
                {data?.contractorAgreement?.date
                  ? new Date(data.contractorAgreement.date).toLocaleDateString()
                  : "N/A"}
              </p>
            </div>
          </div>
        </div>
      </Card>

      <div className="flex flex-col sm:flex-row justify-between gap-3 pt-4">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onBack} 
          className="gap-2 w-full sm:w-auto"
          disabled={isSubmitting}
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </Button>
        <Button 
          onClick={handleSubmit} 
          className="gap-2 w-full sm:w-auto" 
          disabled={isSubmitting}
        >
          <Check className="w-4 h-4" />
          {isSubmitting ? "Submitting..." : "Submit Application"}
        </Button>
      </div>
    </div>
  );
};
