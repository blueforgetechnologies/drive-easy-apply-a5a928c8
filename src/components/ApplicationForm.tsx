import { useState } from "react";
import { Card } from "@/components/ui/card";
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
import { Check } from "lucide-react";

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
  { id: 1, name: "Personal Info", component: PersonalInfo },
  { id: 2, name: "License Info", component: LicenseInfo },
  { id: 3, name: "Employment History", component: EmploymentHistory },
  { id: 4, name: "Driving History", component: DrivingHistory },
  { id: 5, name: "Emergency Contacts", component: EmergencyContact },
  { id: 6, name: "Documents", component: DocumentUpload },
  { id: 7, name: "Direct Deposit", component: DirectDeposit },
  { id: 8, name: "Why Hire You", component: WhyHireYou },
  { id: 9, name: "Review & Submit", component: ReviewSubmit },
];

interface ApplicationFormProps {
  inviteId: string;
}

export const ApplicationForm = ({ inviteId }: ApplicationFormProps) => {
  const [currentStep, setCurrentStep] = useState(1);
  const [applicationData, setApplicationData] = useState<Partial<ApplicationData>>({
    inviteId, // Store invite ID in application data
  });

  const progress = (currentStep / steps.length) * 100;
  const CurrentStepComponent = steps[currentStep - 1].component;

  const handleNext = (data: any) => {
    setApplicationData((prev) => ({ ...prev, ...data }));
    if (currentStep < steps.length) {
      setCurrentStep(currentStep + 1);
    }
  };

  const handleBack = () => {
    if (currentStep > 1) {
      setCurrentStep(currentStep - 1);
    }
  };

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-4xl mx-auto">
        <Card className="p-8 shadow-lg">
          {/* Progress Section */}
          <div className="mb-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-foreground">
                Driver Employment Application
              </h2>
              <span className="text-sm text-muted-foreground">
                Step {currentStep} of {steps.length}
              </span>
            </div>
            <Progress value={progress} className="mb-4" aria-label={`Application progress: step ${currentStep} of ${steps.length}`} />
            
            {/* Step Indicators */}
            <div className="flex justify-between">
              {steps.map((step) => (
                <div
                  key={step.id}
                  className="flex flex-col items-center"
                >
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-colors ${
                      step.id < currentStep
                        ? "bg-success text-success-foreground"
                        : step.id === currentStep
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    {step.id < currentStep ? (
                      <Check className="w-5 h-5" />
                    ) : (
                      <span className="text-sm font-semibold">{step.id}</span>
                    )}
                  </div>
                  <span className={`text-xs text-center hidden sm:block max-w-[80px] ${
                    step.id <= currentStep ? "text-foreground" : "text-muted-foreground"
                  }`}>
                    {step.name}
                  </span>
                </div>
              ))}
            </div>
          </div>

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
        </Card>
      </div>
    </div>
  );
};
