import { useState, useEffect, useCallback, useRef } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { PersonalInfo } from "./application-steps/PersonalInfo";
import { LicenseInfo } from "./application-steps/LicenseInfo";
import { EmploymentHistory } from "./application-steps/EmploymentHistory";
import { DrivingHistory } from "./application-steps/DrivingHistory";
import { DocumentUpload } from "./application-steps/DocumentUpload";
import { DirectDeposit } from "./application-steps/DirectDeposit";
import { WhyHireYou } from "./application-steps/WhyHireYou";
import { EmergencyContact } from "./application-steps/EmergencyContact";
import { ReviewSubmit } from "./application-steps/ReviewSubmit";
import { Check, Loader2, Save, AlertCircle } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export interface ApplicationData {
  personalInfo: {
    firstName: string;
    lastName: string;
    middleName?: string;
    ssn: string;
    dob: string;
    phone: string;
    email: string;
    address: string;
    city: string;
    state: string;
    zip: string;
    emergencyContactName: string;
    emergencyContactRelationship: string;
    emergencyContactPhone: string;
    legallyAuthorized: string;
    felonyConviction: string;
    felonyDetails?: string;
  };
  payrollPolicy?: {
    agreedName: string;
    signature: string;
    date: string;
  };
  licenseInfo: {
    licenseNumber: string;
    licenseState: string;
    licenseClass: string;
    endorsements: string[];
    expirationDate: string;
    yearsExperience: number;
    deniedLicense: string;
    suspendedRevoked: string;
    deniedDetails?: string;
  };
  employmentHistory: Array<{
    companyName: string;
    position: string;
    address: string;
    phone: string;
    supervisor: string;
    startDate: string;
    endDate: string;
    reasonForLeaving: string;
  }>;
  drivingHistory: {
    accidents: Array<{
      date: string;
      location: string;
      description: string;
      fatalities: number;
      injuries: number;
    }>;
    violations: Array<{
      date: string;
      violation: string;
      location: string;
      penalty: string;
    }>;
  };
  documents: {
    socialSecurity?: File;
    driversLicense?: File;
    medicalCard?: File;
    other?: File[];
  };
  policyAcknowledgment: {
    agreedToPolicy: boolean;
    signature: string;
    dateSigned: string;
  };
  directDeposit: {
    firstName: string;
    lastName: string;
    businessName?: string;
    email: string;
    bankName: string;
    routingNumber: string;
    checkingNumber: string;
    cashAppCashtag?: string;
    accountType: string;
  };
  driverDispatchSheet: {
    agreed: boolean;
    driverFullName: string;
    signature: string;
    date: string;
  };
  noRiderPolicy: {
    agreed: boolean;
    employeeName: string;
    signature: string;
    date: string;
  };
  whyHireYou?: {
    statement: string;
  };
  safeDrivingPolicy?: {
    printName: string;
    signature: string;
    date: string;
  };
  contractorAgreement: {
    agreed: boolean;
    contractorName: string;
    signature: string;
    date: string;
    initials: string;
  };
  emergencyContacts?: Array<{
    firstName: string;
    lastName: string;
    phone: string;
    address: string;
    relationship: string;
  }>;
  inviteId?: string;
}

const steps = [
  { id: 1, name: "Personal Info", shortName: "Personal", component: PersonalInfo, stepKey: "personal_info" },
  { id: 2, name: "License Info", shortName: "License", component: LicenseInfo, stepKey: "license_info" },
  { id: 3, name: "Employment History", shortName: "Employment", component: EmploymentHistory, stepKey: "employment_history" },
  { id: 4, name: "Driving History", shortName: "Driving", component: DrivingHistory, stepKey: "driving_history" },
  { id: 5, name: "Emergency Contacts", shortName: "Emergency", component: EmergencyContact, stepKey: "emergency_contacts" },
  { id: 6, name: "Documents", shortName: "Documents", component: DocumentUpload, stepKey: "document_upload" },
  { id: 7, name: "Direct Deposit", shortName: "Payment", component: DirectDeposit, stepKey: "direct_deposit" },
  { id: 8, name: "Why Hire You", shortName: "Statement", component: WhyHireYou, stepKey: "why_hire_you" },
  { id: 9, name: "Review & Submit", shortName: "Review", component: ReviewSubmit, stepKey: null },
];

interface ApplicationFormProps {
  publicToken: string;
  isPreviewMode?: boolean;
}

interface CompanyBranding {
  name: string;
  logo_url: string | null;
}

export const ApplicationForm = ({ publicToken, isPreviewMode = false }: ApplicationFormProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [applicationData, setApplicationData] = useState<Partial<ApplicationData>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [companyBranding, setCompanyBranding] = useState<CompanyBranding | null>(null);
  const [canEdit, setCanEdit] = useState(true);
  const [lastSaved, setLastSaved] = useState<Date | null>(null);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Load existing application data on mount
  useEffect(() => {
    const loadApplication = async () => {
      // PREVIEW MODE: Skip loading, just show empty form
      if (isPreviewMode) {
        setIsLoading(false);
        setCompanyBranding({ name: "Preview Mode", logo_url: null });
        return;
      }

      try {
        setIsLoading(true);
        setLoadError(null);

        const { data, error } = await supabase.functions.invoke('load-application', {
          body: { public_token: publicToken },
        });

        if (error) {
          throw error;
        }

        if (!data.success) {
          throw new Error(data.error || 'Failed to load application');
        }

        // Set company branding
        if (data.company) {
          setCompanyBranding(data.company);
        }

        // Set edit permission
        setCanEdit(data.can_edit);

        // Populate form with existing data
        if (data.application) {
          const app = data.application;
          setCurrentStep(app.current_step || 1);
          setApplicationData({
            personalInfo: app.personal_info || {},
            licenseInfo: app.license_info || {},
            employmentHistory: Array.isArray(app.employment_history) ? app.employment_history : [],
            drivingHistory: app.driving_history || { accidents: [], violations: [] },
            emergencyContacts: Array.isArray(app.emergency_contacts) ? app.emergency_contacts : [],
            documents: app.document_upload || {},
            directDeposit: app.direct_deposit || {},
            whyHireYou: app.why_hire_you || {},
          });

          if (app.updated_at) {
            setLastSaved(new Date(app.updated_at));
          }
        } else if (data.invite) {
          // Pre-fill from invite
          setApplicationData({
            personalInfo: {
              email: data.invite.email || '',
              firstName: data.invite.name?.split(' ')[0] || '',
              lastName: data.invite.name?.split(' ').slice(1).join(' ') || '',
            } as any,
          });
        }
      } catch (err: any) {
        console.error('Error loading application:', err);
        setLoadError(err.message || 'Failed to load application');
      } finally {
        setIsLoading(false);
      }
    };

    loadApplication();
  }, [publicToken, isPreviewMode]);

  // Autosave function
  const saveStep = useCallback(async (stepKey: string, payload: any, step: number) => {
    // PREVIEW MODE: Skip saving entirely
    if (isPreviewMode || !canEdit) return;

    try {
      setIsSaving(true);
      const { data, error } = await supabase.functions.invoke('save-application-step', {
        body: {
          public_token: publicToken,
          step_key: stepKey,
          current_step: step,
          payload,
        },
      });

      if (error) {
        console.error('Autosave error:', error);
        toast.error('Failed to save progress');
        return;
      }

      if (data.success) {
        setLastSaved(new Date(data.updated_at));
      }
    } catch (err) {
      console.error('Autosave error:', err);
    } finally {
      setIsSaving(false);
    }
  }, [publicToken, canEdit]);

  // Debounced autosave
  const debouncedSave = useCallback((stepKey: string, payload: any, step: number) => {
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }
    saveTimeoutRef.current = setTimeout(() => {
      saveStep(stepKey, payload, step);
    }, 2000);
  }, [saveStep]);

  const progress = (currentStep / steps.length) * 100;
  const CurrentStepComponent = steps[currentStep - 1].component;
  const currentStepKey = steps[currentStep - 1].stepKey;

  const handleNext = async (data: any) => {
    const newData = { ...applicationData, ...data };
    setApplicationData(newData);

    // Save current step data
    if (currentStepKey && canEdit) {
      const dataKey = Object.keys(data)[0];
      const payload = data[dataKey];
      await saveStep(currentStepKey, payload, currentStep + 1);
    }

    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSaveAndContinueLater = async () => {
    if (!currentStepKey || !canEdit) return;

    toast.info('Saving your progress...');
    
    // Get current step data from applicationData
    const stepDataMap: Record<string, any> = {
      personal_info: applicationData.personalInfo,
      license_info: applicationData.licenseInfo,
      employment_history: applicationData.employmentHistory,
      driving_history: applicationData.drivingHistory,
      emergency_contacts: applicationData.emergencyContacts,
      document_upload: applicationData.documents,
      direct_deposit: applicationData.directDeposit,
      why_hire_you: applicationData.whyHireYou,
    };

    const payload = stepDataMap[currentStepKey];
    if (payload) {
      await saveStep(currentStepKey, payload, currentStep);
      toast.success('Progress saved! You can return anytime to continue.');
    }
  };

  // Loading state
  if (isLoading) {
    return (
      <div className="min-h-screen bg-scifi py-6 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="card-scifi rounded-2xl p-8 flex flex-col items-center justify-center min-h-[300px]">
            <div className="relative">
              <div className="absolute inset-0 rounded-full bg-scifi-purple/20 animate-ping" />
              <Loader2 className="h-10 w-10 animate-spin text-scifi-purple relative z-10" />
            </div>
            <p className="text-base text-scifi-text-muted mt-4">Loading your application...</p>
          </div>
        </div>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className="min-h-screen bg-scifi py-6 px-4">
        <div className="max-w-3xl mx-auto">
          <div className="card-scifi rounded-2xl p-8">
            <div className="flex flex-col items-center text-center">
              <div className="h-14 w-14 rounded-full bg-destructive/20 flex items-center justify-center mb-4">
                <AlertCircle className="h-7 w-7 text-destructive" />
              </div>
              <h2 className="text-xl font-bold text-scifi-text mb-2">Unable to Load Application</h2>
              <p className="text-scifi-text-muted mb-5 text-sm">{loadError}</p>
              <Button onClick={() => window.location.reload()} className="btn-scifi rounded-full px-6">
                Try Again
              </Button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-scifi py-6 px-4">
      <div className="max-w-3xl mx-auto">
        {/* Company Branding Header */}
        {companyBranding && (
          <div className="flex items-center justify-center gap-3 mb-4">
            {companyBranding.logo_url && (
              <img 
                src={companyBranding.logo_url} 
                alt={companyBranding.name} 
                className="h-10 w-auto object-contain"
              />
            )}
            <span className="text-lg font-semibold text-scifi-text">{companyBranding.name}</span>
          </div>
        )}

        <div className="card-scifi rounded-2xl p-5 md:p-6">
          {/* Header */}
          <div className="mb-5">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
              <div>
                <h2 className="text-xl md:text-2xl font-bold text-scifi-text">
                  Driver Employment Application
                </h2>
                <p className="text-scifi-text-muted text-sm mt-0.5">
                  Complete all sections to submit
                </p>
              </div>
              <div className="flex items-center gap-2">
                {isSaving && (
                  <div className="flex items-center gap-1.5 text-scifi-cyan text-xs font-medium bg-scifi-cyan/10 px-2.5 py-1 rounded-full border border-scifi-cyan/20">
                    <Loader2 className="h-3 w-3 animate-spin" />
                    <span>Saving...</span>
                  </div>
                )}
                {lastSaved && !isSaving && (
                  <div className="flex items-center gap-1.5 text-scifi-text-muted text-xs bg-scifi-card-elevated px-2.5 py-1 rounded-full border border-scifi-border">
                    <Save className="h-3 w-3" />
                    <span>Saved {lastSaved.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="font-medium text-scifi-text">
                  Step {currentStep}/{steps.length}: {steps[currentStep - 1].name}
                </span>
                <span className="text-scifi-purple-light font-semibold">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />

              {/* Step Indicators - Desktop */}
              <div className="hidden md:flex justify-between mt-4 px-1">
                {steps.map((step) => (
                  <div key={step.id} className="flex flex-col items-center group">
                    <div
                      className={`w-8 h-8 rounded-full flex items-center justify-center mb-1.5 transition-all duration-300 ${
                        step.id < currentStep
                          ? "step-scifi-complete"
                          : step.id === currentStep
                          ? "step-scifi-active"
                          : "bg-scifi-border text-scifi-text-muted"
                      }`}
                    >
                      {step.id < currentStep ? (
                        <Check className="w-4 h-4" />
                      ) : (
                        <span className="text-xs font-bold">{step.id}</span>
                      )}
                    </div>
                    <span className={`text-[10px] text-center max-w-[55px] leading-tight ${
                      step.id <= currentStep ? "text-scifi-text font-medium" : "text-scifi-text-muted"
                    }`}>
                      {step.shortName}
                    </span>
                  </div>
                ))}
              </div>

              {/* Step Indicators - Mobile */}
              <div className="flex md:hidden gap-1 justify-center">
                {steps.map((step) => (
                  <div
                    key={step.id}
                    className={`h-1.5 rounded-full transition-all duration-300 ${
                      step.id < currentStep
                        ? "bg-scifi-cyan w-5"
                        : step.id === currentStep
                        ? "bg-scifi-purple w-8"
                        : "bg-scifi-border w-4"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="divider-scifi" />

          {/* Read-only notice */}
          {!canEdit && (
            <div className="mb-4 p-3 bg-scifi-purple/10 border border-scifi-purple/30 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-4 w-4 text-scifi-purple-light flex-shrink-0" />
                <p className="text-xs text-scifi-purple-light">
                  This application has been submitted and cannot be modified.
                </p>
              </div>
            </div>
          )}

          {/* Form Content */}
          <div className="min-h-[400px]">
            <CurrentStepComponent
              data={applicationData}
              onNext={handleNext}
              onBack={handleBack}
              isFirstStep={currentStep === 1}
              isLastStep={currentStep === steps.length}
            />
          </div>

          {/* Save & Continue Later Button */}
          {canEdit && currentStep < steps.length && (
            <div className="mt-6 pt-4 border-t border-scifi-border flex justify-center">
              <Button
                variant="ghost"
                onClick={handleSaveAndContinueLater}
                className="btn-scifi-outline gap-2 rounded-full text-sm"
                disabled={isSaving}
              >
                <Save className="h-3.5 w-3.5" />
                Save & Continue Later
              </Button>
            </div>
          )}
        </div>

        {/* Help Text */}
        <p className="text-center text-xs text-scifi-text-muted mt-4">
          Your progress is automatically saved. Return anytime to continue.
        </p>
      </div>
    </div>
  );
};
