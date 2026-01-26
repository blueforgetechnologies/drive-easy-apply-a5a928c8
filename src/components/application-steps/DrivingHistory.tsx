import { useState, useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Plus, Trash2, Car, AlertTriangle, FileWarning, MapPin, Calendar } from "lucide-react";

interface DrivingHistoryProps {
  data: any;
  onNext: (data: any) => void;
  onBack: () => void;
  isFirstStep: boolean;
  isLastStep: boolean;
  isPreviewMode?: boolean;
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

export const DrivingHistory = ({ data, onNext, onBack, isPreviewMode = false }: DrivingHistoryProps) => {
  const isTestMode = isPreviewMode || (typeof window !== 'undefined' && localStorage.getItem("app_test_mode") === "true");
  
  const [accidents, setAccidents] = useState<Accident[]>(
    data?.drivingHistory?.accidents || []
  );
  const [violations, setViolations] = useState<Violation[]>(
    data?.drivingHistory?.violations || []
  );
  
  // Track if this is the initial mount to prevent overwriting user-entered data
  const hasInitialized = useRef(false);
  
  // Sync form data with prop changes ONLY on initial mount
  useEffect(() => {
    if (data?.drivingHistory && !hasInitialized.current) {
      hasInitialized.current = true;
      if (data.drivingHistory.accidents) setAccidents(data.drivingHistory.accidents);
      if (data.drivingHistory.violations) setViolations(data.drivingHistory.violations);
    }
  }, [data?.drivingHistory]);

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
    e.stopPropagation(); // Prevent event bubbling
    onNext({ drivingHistory: { accidents, violations } });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Header */}
      <div className="section-scifi p-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="p-2 rounded-lg bg-scifi-purple/20">
            <Car className="h-5 w-5 text-scifi-purple" />
          </div>
          <div>
            <h2 className="text-xl font-semibold text-white">Driving History</h2>
            <p className="text-sm text-muted-foreground">
              List all accidents and traffic violations for the past 3 years. If none, leave sections empty.
            </p>
          </div>
        </div>
      </div>

      {/* Accidents Section */}
      <div className="section-scifi">
        <div className="flex items-center justify-between mb-3">
          <div className="section-header-scifi">
            <h3 className="text-sm font-semibold text-scifi-text flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-500" />
              Accidents (Past 3 Years)
            </h3>
          </div>
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            onClick={addAccident} 
            className="btn-scifi-outline text-xs h-8"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Accident
          </Button>
        </div>

        {accidents.length === 0 ? (
          <div className="p-4 rounded-lg bg-scifi-card/50 border border-scifi-border/50 text-center">
            <p className="text-sm text-scifi-text-muted">
              No accidents reported. Click "Add Accident" if you need to report any.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {accidents.map((accident, index) => (
              <div key={index} className="p-3 rounded-lg bg-scifi-card/50 border border-scifi-border/50 relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2 text-destructive hover:bg-destructive/20 h-7 w-7 p-0"
                  onClick={() => removeAccident(index)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>

                <h5 className="font-medium text-sm text-scifi-text mb-3 pr-8">Accident {index + 1}</h5>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="form-field-scifi space-y-1">
                      <Label className="label-scifi flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Date of Accident *
                      </Label>
                      <Input
                        type="date"
                        className="input-scifi h-9 text-sm"
                        value={accident.date}
                        onChange={(e) => {
                          const updated = [...accidents];
                          updated[index].date = e.target.value;
                          setAccidents(updated);
                        }}
                      />
                    </div>
                    <div className="form-field-scifi space-y-1">
                      <Label className="label-scifi flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        Location *
                      </Label>
                      <Input
                        className="input-scifi h-9 text-sm"
                        value={accident.location}
                        onChange={(e) => {
                          const updated = [...accidents];
                          updated[index].location = e.target.value;
                          setAccidents(updated);
                        }}
                      />
                    </div>
                  </div>

                  <div className="form-field-scifi space-y-1">
                    <Label className="label-scifi">Description *</Label>
                    <Textarea
                      className="input-scifi text-sm min-h-[60px] resize-y"
                      value={accident.description}
                      onChange={(e) => {
                        const updated = [...accidents];
                        updated[index].description = e.target.value;
                        setAccidents(updated);
                      }}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="form-field-scifi space-y-1">
                      <Label className="label-scifi">Fatalities</Label>
                      <Input
                        type="number"
                        min="0"
                        className="input-scifi h-9 text-sm"
                        value={accident.fatalities}
                        onChange={(e) => {
                          const updated = [...accidents];
                          updated[index].fatalities = parseInt(e.target.value) || 0;
                          setAccidents(updated);
                        }}
                      />
                    </div>
                    <div className="form-field-scifi space-y-1">
                      <Label className="label-scifi">Injuries</Label>
                      <Input
                        type="number"
                        min="0"
                        className="input-scifi h-9 text-sm"
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
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Violations Section */}
      <div className="section-scifi">
        <div className="flex items-center justify-between mb-3">
          <div className="section-header-scifi">
            <h3 className="text-sm font-semibold text-scifi-text flex items-center gap-2">
              <FileWarning className="w-4 h-4 text-red-500" />
              Traffic Violations (Past 3 Years)
            </h3>
          </div>
          <Button 
            type="button" 
            variant="outline" 
            size="sm" 
            onClick={addViolation} 
            className="btn-scifi-outline text-xs h-8"
          >
            <Plus className="w-3.5 h-3.5 mr-1" />
            Add Violation
          </Button>
        </div>

        {violations.length === 0 ? (
          <div className="p-4 rounded-lg bg-scifi-card/50 border border-scifi-border/50 text-center">
            <p className="text-sm text-scifi-text-muted">
              No violations reported. Click "Add Violation" if you need to report any.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {violations.map((violation, index) => (
              <div key={index} className="p-3 rounded-lg bg-scifi-card/50 border border-scifi-border/50 relative">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="absolute top-2 right-2 text-destructive hover:bg-destructive/20 h-7 w-7 p-0"
                  onClick={() => removeViolation(index)}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </Button>

                <h5 className="font-medium text-sm text-scifi-text mb-3 pr-8">Violation {index + 1}</h5>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="form-field-scifi space-y-1">
                      <Label className="label-scifi flex items-center gap-1.5">
                        <Calendar className="w-3.5 h-3.5" />
                        Date of Violation *
                      </Label>
                      <Input
                        type="date"
                        className="input-scifi h-9 text-sm"
                        value={violation.date}
                        onChange={(e) => {
                          const updated = [...violations];
                          updated[index].date = e.target.value;
                          setViolations(updated);
                        }}
                      />
                    </div>
                    <div className="form-field-scifi space-y-1">
                      <Label className="label-scifi flex items-center gap-1.5">
                        <MapPin className="w-3.5 h-3.5" />
                        Location *
                      </Label>
                      <Input
                        className="input-scifi h-9 text-sm"
                        value={violation.location}
                        onChange={(e) => {
                          const updated = [...violations];
                          updated[index].location = e.target.value;
                          setViolations(updated);
                        }}
                      />
                    </div>
                  </div>

                  <div className="form-field-scifi space-y-1">
                    <Label className="label-scifi">Type of Violation *</Label>
                    <Input
                      placeholder="e.g., Speeding, Following too close"
                      className="input-scifi h-9 text-sm"
                      value={violation.violation}
                      onChange={(e) => {
                        const updated = [...violations];
                        updated[index].violation = e.target.value;
                        setViolations(updated);
                      }}
                    />
                  </div>

                  <div className="form-field-scifi space-y-1">
                    <Label className="label-scifi">Penalty *</Label>
                    <Input
                      placeholder="e.g., Fine amount, points"
                      className="input-scifi h-9 text-sm"
                      value={violation.penalty}
                      onChange={(e) => {
                        const updated = [...violations];
                        updated[index].penalty = e.target.value;
                        setViolations(updated);
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

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
  );
};
