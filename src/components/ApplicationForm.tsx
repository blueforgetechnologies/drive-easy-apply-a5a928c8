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
}

interface CompanyBranding {
  name: string;
  logo_url: string | null;
}

export const ApplicationForm = ({ publicToken }: ApplicationFormProps) => {
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
  }, [publicToken]);

  // Autosave function
  const saveStep = useCallback(async (stepKey: string, payload: any, step: number) => {
    if (!canEdit) return;

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
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <Card className="p-12 shadow-xl flex flex-col items-center justify-center min-h-[400px]">
            <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
            <p className="text-lg text-muted-foreground">Loading your application...</p>
          </Card>
        </div>
      </div>
    );
  }

  // Error state
  if (loadError) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-8 px-4">
        <div className="max-w-4xl mx-auto">
          <Card className="p-12 shadow-xl">
            <div className="flex flex-col items-center text-center">
              <div className="h-16 w-16 rounded-full bg-destructive/10 flex items-center justify-center mb-4">
                <AlertCircle className="h-8 w-8 text-destructive" />
              </div>
              <h2 className="text-2xl font-bold text-foreground mb-2">Unable to Load Application</h2>
              <p className="text-muted-foreground mb-6">{loadError}</p>
              <Button onClick={() => window.location.reload()}>Try Again</Button>
            </div>
          </Card>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 dark:from-slate-900 dark:to-slate-800 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Company Branding Header */}
        {companyBranding && (
          <div className="flex items-center justify-center gap-4 mb-6">
            {companyBranding.logo_url && (
              <img 
                src={companyBranding.logo_url} 
                alt={companyBranding.name} 
                className="h-12 w-auto object-contain"
              />
            )}
            <span className="text-xl font-semibold text-foreground">{companyBranding.name}</span>
          </div>
        )}

        <Card className="p-6 md:p-8 shadow-xl border-0 bg-card">
          {/* Header */}
          <div className="mb-8">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
              <div>
                <h2 className="text-2xl md:text-3xl font-bold text-foreground">
                  Driver Employment Application
                </h2>
                <p className="text-muted-foreground mt-1">
                  Complete all required sections to submit your application
                </p>
              </div>
              <div className="flex items-center gap-3">
                {isSaving && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    <span>Saving...</span>
                  </div>
                )}
                {lastSaved && !isSaving && (
                  <div className="flex items-center gap-2 text-muted-foreground text-sm">
                    <Save className="h-4 w-4" />
                    <span>Last saved {lastSaved.toLocaleTimeString()}</span>
                  </div>
                )}
              </div>
            </div>

            {/* Progress Bar */}
            <div className="space-y-4">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">
                  Step {currentStep} of {steps.length}: {steps[currentStep - 1].name}
                </span>
                <span className="text-muted-foreground">{Math.round(progress)}% complete</span>
              </div>
              <Progress value={progress} className="h-2" />

              {/* Step Indicators - Desktop */}
              <div className="hidden md:flex justify-between mt-6">
                {steps.map((step) => (
                  <div
                    key={step.id}
                    className="flex flex-col items-center group"
                  >
                    <div
                      className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-all duration-200 ${
                        step.id < currentStep
                          ? "bg-emerald-500 text-white shadow-md"
                          : step.id === currentStep
                          ? "bg-primary text-primary-foreground shadow-lg ring-4 ring-primary/20"
                          : "bg-muted text-muted-foreground"
                      }`}
                    >
                      {step.id < currentStep ? (
                        <Check className="w-5 h-5" />
                      ) : (
                        <span className="text-sm font-semibold">{step.id}</span>
                      )}
                    </div>
                    <span className={`text-xs text-center max-w-[70px] leading-tight ${
                      step.id <= currentStep ? "text-foreground font-medium" : "text-muted-foreground"
                    }`}>
                      {step.shortName}
                    </span>
                  </div>
                ))}
              </div>

              {/* Step Indicators - Mobile */}
              <div className="flex md:hidden overflow-x-auto gap-1 pb-2">
                {steps.map((step) => (
                  <div
                    key={step.id}
                    className={`flex-shrink-0 h-2 rounded-full transition-all ${
                      step.id < currentStep
                        ? "bg-emerald-500 w-8"
                        : step.id === currentStep
                        ? "bg-primary w-12"
                        : "bg-muted w-6"
                    }`}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Read-only notice */}
          {!canEdit && (
            <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800 rounded-lg">
              <div className="flex items-center gap-2">
                <AlertCircle className="h-5 w-5 text-amber-600" />
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  This application has already been submitted and cannot be modified.
                </p>
              </div>
            </div>
          )}

          {/* Form Content */}
          <div className="min-h-[500px]">
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
            <div className="mt-8 pt-6 border-t flex justify-center">
              <Button
                variant="outline"
                onClick={handleSaveAndContinueLater}
                className="gap-2"
                disabled={isSaving}
              >
                <Save className="h-4 w-4" />
                Save & Continue Later
              </Button>
            </div>
          )}
        </Card>

        {/* Help Text */}
        <p className="text-center text-sm text-muted-foreground mt-6">
          Your progress is automatically saved. You can close this page and return anytime to continue.
        </p>
      </div>
    </div>
  );
};
