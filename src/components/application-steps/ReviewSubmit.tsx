import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { ChevronLeft, Check, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";

interface ReviewSubmitProps {
  data: any;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  onNext?: (data: any) => void;
}

export const ReviewSubmit = ({ data, onBack }: ReviewSubmitProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [tenantId, setTenantId] = useState<string | null>(null);

  // Fetch tenant_id from the invite
  useEffect(() => {
    const fetchTenantId = async () => {
      if (!data?.inviteId) return;
      const { data: invite } = await supabase
        .from('driver_invites')
        .select('tenant_id')
        .eq('id', data.inviteId)
        .single();
      if (invite?.tenant_id) {
        setTenantId(invite.tenant_id);
      }
    };
    fetchTenantId();
  }, [data?.inviteId]);

  const handleSubmit = async () => {
    setIsSubmitting(true);
    
    try {
      console.log("Submitting application for:", data?.personalInfo?.email);
      
      // Validate invite ID is present
      if (!data?.inviteId) {
        throw new Error("Invalid invitation. Please use a valid invite link.");
      }

      if (!tenantId) {
        throw new Error("Could not determine tenant. Please try again.");
      }

      // Mark the invite as used
      const { error: inviteError } = await supabase
        .from('driver_invites')
        .update({ application_started_at: new Date().toISOString() })
        .eq('id', data.inviteId);

      if (inviteError) {
        console.error("Error marking invite as used:", inviteError);
      }

      // Extract direct deposit info to top-level fields for driver screen
      const directDeposit = data.directDeposit || {};
      const licenseInfo = data.licenseInfo || {};

      // Update the existing pending application record with all driver details
      const { error: dbError } = await supabase
        .from('applications')
        .update({
          personal_info: data.personalInfo,
          payroll_policy: {},
          license_info: licenseInfo,
          driving_history: data.drivingHistory || {},
          employment_history: data.employmentHistory || {},
          document_upload: data.documents || {},
          drug_alcohol_policy: {},
          driver_dispatch_sheet: {},
          no_rider_policy: {},
          safe_driving_policy: {},
          contractor_agreement: {},
          direct_deposit: directDeposit,
          why_hire_you: data.whyHireYou || {},
          emergency_contacts: data.emergencyContacts || [],
          status: 'pending',
          driver_status: 'pending',
          submitted_at: new Date().toISOString(),
          // Sync top-level driver fields from application data
          driver_address: `${data.personalInfo?.address || ''}, ${data.personalInfo?.city || ''}, ${data.personalInfo?.state || ''} ${data.personalInfo?.zip || ''}`.trim(),
          cell_phone: data.personalInfo?.phone || null,
          home_phone: data.personalInfo?.homePhone || null,
          // Sync banking info
          bank_name: directDeposit.bankName || null,
          account_name: `${directDeposit.firstName || ''} ${directDeposit.lastName || ''}`.trim() || null,
          routing_number: directDeposit.routingNumber || null,
          checking_number: directDeposit.accountNumber || null,
          account_type: directDeposit.accountType || null,
          // Sync license expiry dates
          driver_record_expiry: licenseInfo.licenseExpiration || null,
          medical_card_expiry: licenseInfo.medicalCardExpiration || null,
        })
        .eq('invite_id', data.inviteId);

      if (dbError) {
        console.error("Error saving to database:", dbError);
        toast.error("Failed to save application", {
          description: "Please try again or contact support.",
        });
        return;
      }

      // Send email notification with PDF to driver and Driver Trainers
      const { error: emailError } = await supabase.functions.invoke('send-application', {
        body: {
          ...data,
          tenantId,
        }
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
          description: "We will review your application and contact you soon. A confirmation email has been sent.",
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

  const hasDocument = (doc: any) => doc !== null && doc !== undefined;

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
        </div>
      </Card>

      {/* Emergency Contacts */}
      {data?.emergencyContacts && data.emergencyContacts.length > 0 && (
        <Card className="p-4 sm:p-6">
          <h4 className="font-semibold mb-4 text-foreground">Emergency Contacts</h4>
          <div className="space-y-4">
            {data.emergencyContacts.map((contact: any, index: number) => (
              contact.firstName && (
                <div key={index} className="border-b pb-3 last:border-0">
                  <p className="font-medium text-sm mb-2">Contact {index + 1}</p>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-xs text-muted-foreground">Name</p>
                      <p className="font-medium">{contact.firstName} {contact.lastName}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Relationship</p>
                      <p className="font-medium">{contact.relationship}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Phone</p>
                      <p className="font-medium">{contact.phone}</p>
                    </div>
                  </div>
                </div>
              )
            ))}
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
            {hasDocument(data?.documents?.driversLicense) ? (
              <Check className="w-4 h-4 text-success" />
            ) : (
              <X className="w-4 h-4 text-destructive" />
            )}
            <span>Driver's License {!hasDocument(data?.documents?.driversLicense) && "(Required)"}</span>
          </div>
          <div className="flex items-center gap-2">
            {hasDocument(data?.documents?.socialSecurity) ? (
              <Check className="w-4 h-4 text-success" />
            ) : (
              <X className="w-4 h-4 text-muted-foreground" />
            )}
            <span>Social Security Card</span>
          </div>
          <div className="flex items-center gap-2">
            {hasDocument(data?.documents?.medicalCard) ? (
              <Check className="w-4 h-4 text-success" />
            ) : (
              <X className="w-4 h-4 text-muted-foreground" />
            )}
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