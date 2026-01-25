import { Button } from "@/components/ui/button";
import { Check, X, ClipboardCheck, User, IdCard, Briefcase, Car, FileText, CreditCard, MessageSquare, Heart } from "lucide-react";
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
      
      if (!data?.inviteId) {
        throw new Error("Invalid invitation. Please use a valid invite link.");
      }

      if (!tenantId) {
        throw new Error("Could not determine tenant. Please try again.");
      }

      const { error: inviteError } = await supabase
        .from('driver_invites')
        .update({ application_started_at: new Date().toISOString() })
        .eq('id', data.inviteId);

      if (inviteError) {
        console.error("Error marking invite as used:", inviteError);
      }

      const directDeposit = data.directDeposit || {};
      const licenseInfo = data.licenseInfo || {};

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
          status: 'submitted',
          submitted_at: new Date().toISOString(),
          driver_address: `${data.personalInfo?.address || ''}, ${data.personalInfo?.city || ''}, ${data.personalInfo?.state || ''} ${data.personalInfo?.zip || ''}`.trim(),
          cell_phone: data.personalInfo?.phone || null,
          home_phone: data.personalInfo?.homePhone || null,
          bank_name: directDeposit.bankName || null,
          account_name: `${directDeposit.firstName || ''} ${directDeposit.lastName || ''}`.trim() || null,
          routing_number: directDeposit.routingNumber || null,
          checking_number: directDeposit.accountNumber || null,
          account_type: directDeposit.accountType || null,
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

      const { error: emailError } = await supabase.functions.invoke('send-application', {
        body: {
          ...data,
          tenantId,
        }
      });

      if (emailError) {
        console.error("Error sending email:", emailError);
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

  const SectionCard = ({ title, icon: Icon, children }: { title: string; icon: React.ElementType; children: React.ReactNode }) => (
    <div className="section-scifi">
      <div className="section-header-scifi mb-3">
        <h3 className="text-sm font-semibold text-scifi-text flex items-center gap-2">
          <Icon className="w-4 h-4 text-scifi-cyan" />
          {title}
        </h3>
      </div>
      {children}
    </div>
  );

  const InfoRow = ({ label, value }: { label: string; value: string | undefined }) => (
    <div>
      <p className="text-xs text-scifi-text-muted">{label}</p>
      <p className="text-sm font-medium text-scifi-text">{value || '—'}</p>
    </div>
  );

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="section-scifi p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-scifi-purple/20">
            <ClipboardCheck className="h-5 w-5 text-scifi-purple" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Review & Submit</h2>
            <p className="text-sm text-muted-foreground">
              Please review your information before submitting. You can go back to edit any section.
            </p>
          </div>
        </div>
      </div>

      {/* Personal Information */}
      <SectionCard title="Personal Information" icon={User}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <InfoRow label="Name" value={`${data?.personalInfo?.firstName || ''} ${data?.personalInfo?.middleName || ''} ${data?.personalInfo?.lastName || ''}`.trim()} />
          <InfoRow label="Date of Birth" value={data?.personalInfo?.dob} />
          <InfoRow label="Phone" value={data?.personalInfo?.phone} />
          <InfoRow label="Email" value={data?.personalInfo?.email} />
          <div className="col-span-2">
            <InfoRow 
              label="Address" 
              value={`${data?.personalInfo?.address || ''}, ${data?.personalInfo?.city || ''}, ${data?.personalInfo?.state || ''} ${data?.personalInfo?.zip || ''}`.trim()} 
            />
          </div>
          <InfoRow label="Legally Authorized" value={data?.personalInfo?.legallyAuthorized} />
          <InfoRow label="Felony Conviction" value={data?.personalInfo?.felonyConviction} />
        </div>
      </SectionCard>

      {/* Emergency Contacts */}
      {data?.emergencyContacts && data.emergencyContacts.length > 0 && (
        <SectionCard title="Emergency Contacts" icon={Heart}>
          <div className="space-y-2">
            {data.emergencyContacts.map((contact: any, index: number) => (
              contact.firstName && (
                <div key={index} className="p-2 rounded-lg bg-scifi-card/50 border border-scifi-border/50">
                  <p className="text-xs text-scifi-purple font-medium mb-1">Contact {index + 1}</p>
                  <div className="grid grid-cols-3 gap-2">
                    <InfoRow label="Name" value={`${contact.firstName} ${contact.lastName}`} />
                    <InfoRow label="Relationship" value={contact.relationship} />
                    <InfoRow label="Phone" value={contact.phone} />
                  </div>
                </div>
              )
            ))}
          </div>
        </SectionCard>
      )}

      {/* License Information */}
      <SectionCard title="License Information" icon={IdCard}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 text-sm">
          <InfoRow label="License Number" value={data?.licenseInfo?.licenseNumber} />
          <InfoRow label="State" value={data?.licenseInfo?.licenseState} />
          <InfoRow label="Class" value={data?.licenseInfo?.licenseClass} />
          <InfoRow label="Experience" value={`${data?.licenseInfo?.yearsExperience || 0} years`} />
          {data?.licenseInfo?.endorsements?.length > 0 && (
            <div className="col-span-2">
              <InfoRow label="Endorsements" value={data?.licenseInfo?.endorsements.join(", ")} />
            </div>
          )}
        </div>
      </SectionCard>

      {/* Employment & Driving History */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <SectionCard title="Employment History" icon={Briefcase}>
          <p className="text-sm text-scifi-text">
            {data?.employmentHistory?.length || 0} employer(s) listed
          </p>
        </SectionCard>

        <SectionCard title="Driving History" icon={Car}>
          <div className="grid grid-cols-2 gap-2">
            <InfoRow label="Accidents" value={`${data?.drivingHistory?.accidents?.length || 0} reported`} />
            <InfoRow label="Violations" value={`${data?.drivingHistory?.violations?.length || 0} reported`} />
          </div>
        </SectionCard>
      </div>

      {/* Documents */}
      <SectionCard title="Documents Uploaded" icon={FileText}>
        <div className="space-y-1.5">
          {[
            { key: 'driversLicense', label: "Driver's License", required: true },
            { key: 'socialSecurity', label: 'Social Security Card', required: false },
            { key: 'medicalCard', label: 'Medical Card', required: false },
          ].map((doc) => (
            <div key={doc.key} className="flex items-center gap-2">
              {hasDocument(data?.documents?.[doc.key]) ? (
                <Check className="w-4 h-4 text-green-500" />
              ) : (
                <X className={`w-4 h-4 ${doc.required ? 'text-destructive' : 'text-scifi-text-muted'}`} />
              )}
              <span className="text-sm text-scifi-text">
                {doc.label} {doc.required && !hasDocument(data?.documents?.[doc.key]) && '(Required)'}
              </span>
            </div>
          ))}
          {data?.documents?.other?.length > 0 && (
            <div className="flex items-center gap-2">
              <Check className="w-4 h-4 text-green-500" />
              <span className="text-sm text-scifi-text">{data?.documents?.other?.length} additional document(s)</span>
            </div>
          )}
        </div>
      </SectionCard>

      {/* Direct Deposit */}
      <SectionCard title="Direct Deposit" icon={CreditCard}>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <InfoRow label="Name" value={`${data?.directDeposit?.firstName || ''} ${data?.directDeposit?.lastName || ''}`.trim()} />
          <InfoRow label="Bank" value={data?.directDeposit?.bankName} />
          <InfoRow label="Account Type" value={data?.directDeposit?.accountType?.replace('-', ' ')} />
        </div>
      </SectionCard>

      {/* Navigation */}
      <div className="flex flex-col sm:flex-row justify-between gap-3 pt-4">
        <Button 
          type="button" 
          variant="outline" 
          onClick={onBack} 
          className="btn-scifi-outline w-full sm:w-auto"
          disabled={isSubmitting}
        >
          Previous
        </Button>
        <Button 
          onClick={handleSubmit} 
          className="btn-scifi w-full sm:w-auto gap-2" 
          disabled={isSubmitting}
        >
          <Check className="w-4 h-4" />
          {isSubmitting ? "Submitting..." : "Submit Application"}
        </Button>
      </div>
    </div>
  );
};
