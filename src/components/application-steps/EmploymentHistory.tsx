import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, AlertCircle, Briefcase, Building, Phone, User, Calendar, DollarSign } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface EmploymentHistoryProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  isPreviewMode?: boolean;
}

interface Employment {
  companyName: string;
  position: string;
  address: string;
  phone: string;
  supervisor: string;
  startDate: string;
  endDate: string;
  payType: string;
  payRate: string;
  reasonForLeaving: string;
}

export const EmploymentHistory = ({ data, onNext, onBack, isPreviewMode = false }: EmploymentHistoryProps) => {
  // Check if Test Mode is enabled (set via Applications Manager toggle)
  const isTestMode = isPreviewMode || (typeof window !== 'undefined' && localStorage.getItem("app_test_mode") === "true");
  
  // Debug log to verify test mode
  console.log('[EmploymentHistory] Test Mode Active:', isTestMode, '(Preview:', isPreviewMode, 'LocalStorage:', localStorage.getItem("app_test_mode"), ')');

  const [employmentHistory, setEmploymentHistory] = useState<Employment[]>(
    data?.employmentHistory?.length > 0
      ? data.employmentHistory
      : [
          {
            companyName: "",
            position: "",
            address: "",
            phone: "",
            supervisor: "",
            startDate: "",
            endDate: "",
            payType: "",
            payRate: "",
            reasonForLeaving: "",
          },
        ]
  );
  
  // Track if this is the initial mount to prevent overwriting user-entered data
  const hasInitialized = useRef(false);
  
  // Sync form data with prop changes ONLY on initial mount
  useEffect(() => {
    if (data?.employmentHistory?.length > 0 && !hasInitialized.current) {
      hasInitialized.current = true;
      setEmploymentHistory(data.employmentHistory);
    }
  }, [data?.employmentHistory]);
  
  const [showAlert, setShowAlert] = useState(false);
  const [alertMessage, setAlertMessage] = useState("");

  const addEmployment = () => {
    setEmploymentHistory([
      ...employmentHistory,
      {
        companyName: "",
        position: "",
        address: "",
        phone: "",
        supervisor: "",
        startDate: "",
        endDate: "",
        payType: "",
        payRate: "",
        reasonForLeaving: "",
      },
    ]);
  };

  const removeEmployment = (index: number) => {
    if (employmentHistory.length > 1) {
      setEmploymentHistory(employmentHistory.filter((_, i) => i !== index));
    }
  };

  const updateEmployment = (index: number, field: keyof Employment, value: string) => {
    const updated = [...employmentHistory];
    updated[index] = { ...updated[index], [field]: value };
    setEmploymentHistory(updated);
  };

  const calculateTotalYears = (): number => {
    let totalMonths = 0;
    
    employmentHistory.forEach((emp) => {
      if (emp.startDate && emp.endDate) {
        const start = new Date(emp.startDate);
        const end = new Date(emp.endDate);
        const months = (end.getFullYear() - start.getFullYear()) * 12 + (end.getMonth() - start.getMonth());
        if (months > 0) {
          totalMonths += months;
        }
      }
    });
    
    return totalMonths / 12;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    // Skip validation in Test Mode
    if (!isTestMode) {
      const totalYears = calculateTotalYears();
      
      if (totalYears < 3) {
        setAlertMessage(
          `Your employment history covers approximately ${totalYears.toFixed(1)} years. DOT regulations require a minimum of 3 years of employment history. Please add more employment records to continue.`
        );
        setShowAlert(true);
        return;
      }
    }
    
    onNext({ employmentHistory });
  };

  const totalYears = calculateTotalYears();

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Header */}
        <div className="section-scifi p-4">
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-scifi-purple/20">
              <Briefcase className="h-5 w-5 text-scifi-purple" />
            </div>
            <div className="flex-1">
              <h2 className="text-xl font-semibold text-white">Employment History</h2>
              <p className="text-sm text-muted-foreground">
                List your employment for the past 3 years (DOT requirement). Start with most recent.
              </p>
            </div>
          </div>
          <div className={`mt-3 px-3 py-2 rounded-lg text-sm font-medium ${
            totalYears >= 3 
              ? 'bg-green-500/20 text-green-400 border border-green-500/30' 
              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
          }`}>
            Current coverage: {totalYears.toFixed(1)} years {totalYears < 3 && '(minimum 3 years required)'}
          </div>
        </div>

        {/* Employment Entries */}
        <div className="space-y-4">
          {employmentHistory.map((employment, index) => (
            <div key={index} className="section-scifi relative">
              {employmentHistory.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute top-3 right-3 text-destructive hover:bg-destructive/20"
                  onClick={() => removeEmployment(index)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              )}

              <div className="section-header-scifi pr-10">
                <h3 className="text-sm font-semibold text-scifi-text flex items-center gap-2">
                  <Building className="w-4 h-4 text-scifi-cyan" />
                  Employment {index + 1}
                  {index === 0 && <span className="text-xs text-scifi-purple ml-2">(Most Recent)</span>}
                </h3>
              </div>

              <div className="space-y-3 mt-3">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="form-field-scifi space-y-1">
                    <Label htmlFor={`company-${index}`} className="label-scifi">Company Name *</Label>
                    <Input
                      id={`company-${index}`}
                      className="input-scifi h-9 text-sm"
                      value={employment.companyName}
                      onChange={(e) => updateEmployment(index, "companyName", e.target.value)}
                      required={!isTestMode}
                    />
                  </div>
                  <div className="form-field-scifi space-y-1">
                    <Label htmlFor={`position-${index}`} className="label-scifi">Position *</Label>
                    <Input
                      id={`position-${index}`}
                      className="input-scifi h-9 text-sm"
                      value={employment.position}
                      onChange={(e) => updateEmployment(index, "position", e.target.value)}
                      required={!isTestMode}
                    />
                  </div>
                </div>

                <div className="form-field-scifi space-y-1">
                  <Label htmlFor={`address-${index}`} className="label-scifi">Company Address *</Label>
                  <Input
                    id={`address-${index}`}
                    className="input-scifi h-9 text-sm"
                    value={employment.address}
                    onChange={(e) => updateEmployment(index, "address", e.target.value)}
                    required={!isTestMode}
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="form-field-scifi space-y-1">
                    <Label htmlFor={`phone-${index}`} className="label-scifi flex items-center gap-1.5">
                      <Phone className="w-3.5 h-3.5" />
                      Phone *
                    </Label>
                    <Input
                      id={`phone-${index}`}
                      type="tel"
                      className="input-scifi h-9 text-sm"
                      value={employment.phone}
                      onChange={(e) => updateEmployment(index, "phone", e.target.value)}
                      required={!isTestMode}
                    />
                  </div>
                  <div className="form-field-scifi space-y-1">
                    <Label htmlFor={`supervisor-${index}`} className="label-scifi flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5" />
                      Supervisor Name *
                    </Label>
                    <Input
                      id={`supervisor-${index}`}
                      className="input-scifi h-9 text-sm"
                      value={employment.supervisor}
                      onChange={(e) => updateEmployment(index, "supervisor", e.target.value)}
                      required={!isTestMode}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="form-field-scifi space-y-1">
                    <Label htmlFor={`start-${index}`} className="label-scifi flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      Start Date *
                    </Label>
                    <Input
                      id={`start-${index}`}
                      type="date"
                      className="input-scifi h-9 text-sm"
                      value={employment.startDate}
                      onChange={(e) => updateEmployment(index, "startDate", e.target.value)}
                      required={!isTestMode}
                    />
                  </div>
                  <div className="form-field-scifi space-y-1">
                    <Label htmlFor={`end-${index}`} className="label-scifi flex items-center gap-1.5">
                      <Calendar className="w-3.5 h-3.5" />
                      End Date *
                    </Label>
                    <Input
                      id={`end-${index}`}
                      type="date"
                      className="input-scifi h-9 text-sm"
                      value={employment.endDate}
                      onChange={(e) => updateEmployment(index, "endDate", e.target.value)}
                      required={!isTestMode}
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="form-field-scifi space-y-1">
                    <Label htmlFor={`payType-${index}`} className="label-scifi flex items-center gap-1.5">
                      <DollarSign className="w-3.5 h-3.5" />
                      Pay Type *
                    </Label>
                    <select
                      id={`payType-${index}`}
                      className="input-scifi h-9 text-sm w-full"
                      value={employment.payType}
                      onChange={(e) => updateEmployment(index, "payType", e.target.value)}
                      required={!isTestMode}
                    >
                      <option value="">Select pay type...</option>
                      <option value="hourly">Hourly</option>
                      <option value="salary">Salary</option>
                      <option value="per-mile">Per Mile</option>
                      <option value="percentage">Percentage</option>
                    </select>
                  </div>
                  <div className="form-field-scifi space-y-1">
                    <Label htmlFor={`payRate-${index}`} className="label-scifi">
                      {employment.payType === "hourly" ? "Hourly Rate ($)" : 
                       employment.payType === "salary" ? "Annual Salary ($)" :
                       employment.payType === "per-mile" ? "Rate Per Mile ($)" :
                       employment.payType === "percentage" ? "Percentage (%)" :
                       "Pay Rate"} *
                    </Label>
                    <Input
                      id={`payRate-${index}`}
                      placeholder={employment.payType === "hourly" ? "e.g., 25.00" : 
                                   employment.payType === "salary" ? "e.g., 65000" :
                                   employment.payType === "per-mile" ? "e.g., 0.55" :
                                   employment.payType === "percentage" ? "e.g., 30" :
                                   "Enter pay rate"}
                      className="input-scifi h-9 text-sm"
                      value={employment.payRate}
                      onChange={(e) => updateEmployment(index, "payRate", e.target.value)}
                      required={!isTestMode}
                    />
                  </div>
                </div>

                <div className="form-field-scifi space-y-1">
                  <Label htmlFor={`reason-${index}`} className="label-scifi">Reason for Leaving *</Label>
                  <Textarea
                    id={`reason-${index}`}
                    className="input-scifi text-sm min-h-[60px] resize-y"
                    value={employment.reasonForLeaving}
                    onChange={(e) => updateEmployment(index, "reasonForLeaving", e.target.value)}
                    required={!isTestMode}
                  />
                </div>
              </div>
            </div>
          ))}
        </div>

        <Button 
          type="button" 
          variant="outline" 
          onClick={addEmployment} 
          className="w-full btn-scifi-outline gap-2"
        >
          <Plus className="w-4 h-4" />
          Add Another Employment
        </Button>

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

      <AlertDialog open={showAlert} onOpenChange={setShowAlert}>
        <AlertDialogContent className="bg-scifi-card border-scifi-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              Insufficient Employment History
            </AlertDialogTitle>
            <AlertDialogDescription className="text-scifi-text-muted">
              {alertMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowAlert(false)} className="btn-scifi">
              OK, I'll add more
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};
