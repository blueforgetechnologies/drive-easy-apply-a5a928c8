import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Plus, Trash2, AlertCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
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
}

interface Employment {
  companyName: string;
  position: string;
  address: string;
  phone: string;
  supervisor: string;
  startDate: string;
  endDate: string;
  reasonForLeaving: string;
}

export const EmploymentHistory = ({ data, onNext, onBack }: EmploymentHistoryProps) => {
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
            reasonForLeaving: "",
          },
        ]
  );
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
    
    // Check if employment history covers at least 3 years
    const totalYears = calculateTotalYears();
    
    if (totalYears < 3) {
      setAlertMessage(
        `Your employment history covers approximately ${totalYears.toFixed(1)} years. DOT regulations require a minimum of 3 years of employment history. Please add more employment records to continue.`
      );
      setShowAlert(true);
      return;
    }
    
    onNext({ employmentHistory });
  };

  const totalYears = calculateTotalYears();

  return (
    <>
      <form onSubmit={handleSubmit} className="space-y-6">
        <div>
          <h3 className="text-xl font-semibold mb-4 text-foreground">Employment History</h3>
          <p className="text-sm text-muted-foreground mb-2">
            List your employment for the past 3 years (DOT requirement). Start with most recent.
          </p>
          <div className={`text-sm font-medium ${totalYears >= 3 ? 'text-success' : 'text-warning'}`}>
            Current coverage: {totalYears.toFixed(1)} years {totalYears < 3 && '(minimum 3 years required)'}
          </div>
        </div>

        <div className="space-y-6">
          {employmentHistory.map((employment, index) => (
            <Card key={index} className="p-6 relative">
              {employmentHistory.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute top-4 right-4"
                  onClick={() => removeEmployment(index)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>
              )}

              <h4 className="font-semibold mb-4 text-foreground">
                Employment {index + 1}
                {index === 0 && <span className="text-muted-foreground text-sm ml-2">(Most Recent)</span>}
              </h4>

              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`company-${index}`}>Company Name *</Label>
                    <Input
                      id={`company-${index}`}
                      value={employment.companyName}
                      onChange={(e) => updateEmployment(index, "companyName", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`position-${index}`}>Position *</Label>
                    <Input
                      id={`position-${index}`}
                      value={employment.position}
                      onChange={(e) => updateEmployment(index, "position", e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`address-${index}`}>Company Address *</Label>
                  <Input
                    id={`address-${index}`}
                    value={employment.address}
                    onChange={(e) => updateEmployment(index, "address", e.target.value)}
                    required
                  />
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`phone-${index}`}>Phone *</Label>
                    <Input
                      id={`phone-${index}`}
                      type="tel"
                      value={employment.phone}
                      onChange={(e) => updateEmployment(index, "phone", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`supervisor-${index}`}>Supervisor Name *</Label>
                    <Input
                      id={`supervisor-${index}`}
                      value={employment.supervisor}
                      onChange={(e) => updateEmployment(index, "supervisor", e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor={`start-${index}`}>Start Date *</Label>
                    <Input
                      id={`start-${index}`}
                      type="date"
                      value={employment.startDate}
                      onChange={(e) => updateEmployment(index, "startDate", e.target.value)}
                      required
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor={`end-${index}`}>End Date *</Label>
                    <Input
                      id={`end-${index}`}
                      type="date"
                      value={employment.endDate}
                      onChange={(e) => updateEmployment(index, "endDate", e.target.value)}
                      required
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor={`reason-${index}`}>Reason for Leaving *</Label>
                  <Textarea
                    id={`reason-${index}`}
                    value={employment.reasonForLeaving}
                    onChange={(e) => updateEmployment(index, "reasonForLeaving", e.target.value)}
                    required
                  />
                </div>
              </div>
            </Card>
          ))}
        </div>

        <Button type="button" variant="outline" onClick={addEmployment} className="w-full gap-2">
          <Plus className="w-4 h-4" />
          Add Another Employment
        </Button>

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

      <AlertDialog open={showAlert} onOpenChange={setShowAlert}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2 text-destructive">
              <AlertCircle className="w-5 h-5" />
              Insufficient Employment History
            </AlertDialogTitle>
            <AlertDialogDescription>
              {alertMessage}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => setShowAlert(false)}>
              OK, I'll add more
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
};