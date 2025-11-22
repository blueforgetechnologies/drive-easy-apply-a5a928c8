import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ChevronLeft, ChevronRight, Plus, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";

interface DrivingHistoryProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
}

interface Accident {
  date: string;
  location: string;
  description: string;
  fatalities: number;
  injuries: number;
}

interface Violation {
  date: string;
  violation: string;
  location: string;
  penalty: string;
}

export const DrivingHistory = ({ data, onNext, onBack }: DrivingHistoryProps) => {
  const [accidents, setAccidents] = useState<Accident[]>(
    data?.drivingHistory?.accidents || []
  );
  const [violations, setViolations] = useState<Violation[]>(
    data?.drivingHistory?.violations || []
  );

  const addAccident = () => {
    setAccidents([...accidents, { date: "", location: "", description: "", fatalities: 0, injuries: 0 }]);
  };

  const addViolation = () => {
    setViolations([...violations, { date: "", violation: "", location: "", penalty: "" }]);
  };

  const removeAccident = (index: number) => {
    setAccidents(accidents.filter((_, i) => i !== index));
  };

  const removeViolation = (index: number) => {
    setViolations(violations.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onNext({ drivingHistory: { accidents, violations } });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-8">
      <div>
        <h3 className="text-xl font-semibold mb-4 text-foreground">Driving History</h3>
        <p className="text-sm text-muted-foreground mb-6">
          List all accidents and traffic violations for the past 3 years. If none, leave sections empty.
        </p>
      </div>

      {/* Accidents Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-foreground">Accidents (Past 3 Years)</h4>
          <Button type="button" variant="outline" size="sm" onClick={addAccident} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Accident
          </Button>
        </div>

        {accidents.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            No accidents reported. Click "Add Accident" if you need to report any.
          </Card>
        ) : (
          <div className="space-y-4">
            {accidents.map((accident, index) => (
              <Card key={index} className="p-6 relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute top-4 right-4"
                  onClick={() => removeAccident(index)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>

                <h5 className="font-semibold mb-4">Accident {index + 1}</h5>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date of Accident *</Label>
                      <Input
                        type="date"
                        value={accident.date}
                        onChange={(e) => {
                          const updated = [...accidents];
                          updated[index].date = e.target.value;
                          setAccidents(updated);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Location *</Label>
                      <Input
                        value={accident.location}
                        onChange={(e) => {
                          const updated = [...accidents];
                          updated[index].location = e.target.value;
                          setAccidents(updated);
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Description *</Label>
                    <Textarea
                      value={accident.description}
                      onChange={(e) => {
                        const updated = [...accidents];
                        updated[index].description = e.target.value;
                        setAccidents(updated);
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Fatalities</Label>
                      <Input
                        type="number"
                        min="0"
                        value={accident.fatalities}
                        onChange={(e) => {
                          const updated = [...accidents];
                          updated[index].fatalities = parseInt(e.target.value) || 0;
                          setAccidents(updated);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Injuries</Label>
                      <Input
                        type="number"
                        min="0"
                        value={accident.injuries}
                        onChange={(e) => {
                          const updated = [...accidents];
                          updated[index].injuries = parseInt(e.target.value) || 0;
                          setAccidents(updated);
                        }}
                      />
                    </div>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* Violations Section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h4 className="font-semibold text-foreground">Traffic Violations (Past 3 Years)</h4>
          <Button type="button" variant="outline" size="sm" onClick={addViolation} className="gap-2">
            <Plus className="w-4 h-4" />
            Add Violation
          </Button>
        </div>

        {violations.length === 0 ? (
          <Card className="p-6 text-center text-muted-foreground">
            No violations reported. Click "Add Violation" if you need to report any.
          </Card>
        ) : (
          <div className="space-y-4">
            {violations.map((violation, index) => (
              <Card key={index} className="p-6 relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute top-4 right-4"
                  onClick={() => removeViolation(index)}
                >
                  <Trash2 className="w-4 h-4 text-destructive" />
                </Button>

                <h5 className="font-semibold mb-4">Violation {index + 1}</h5>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>Date of Violation *</Label>
                      <Input
                        type="date"
                        value={violation.date}
                        onChange={(e) => {
                          const updated = [...violations];
                          updated[index].date = e.target.value;
                          setViolations(updated);
                        }}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label>Location *</Label>
                      <Input
                        value={violation.location}
                        onChange={(e) => {
                          const updated = [...violations];
                          updated[index].location = e.target.value;
                          setViolations(updated);
                        }}
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label>Type of Violation *</Label>
                      <Input
                        placeholder="e.g., Speeding, Following too close"
                        value={violation.violation}
                        onChange={(e) => {
                          const updated = [...violations];
                          updated[index].violation = e.target.value;
                          setViolations(updated);
                        }}
                      />
                  </div>

                  <div className="space-y-2">
                    <Label>Penalty *</Label>
                      <Input
                        placeholder="e.g., Fine amount, points"
                        value={violation.penalty}
                        onChange={(e) => {
                          const updated = [...violations];
                          updated[index].penalty = e.target.value;
                          setViolations(updated);
                        }}
                      />
                  </div>
                </div>
              </Card>
            ))}
          </div>
        )}
      </div>

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
