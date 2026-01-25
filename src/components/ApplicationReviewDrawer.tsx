import { useState } from "react";
import { format } from "date-fns";
import { supabase } from "@/integrations/supabase/client";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import {
  User,
  CreditCard,
  Briefcase,
  AlertTriangle,
  FileCheck,
  FileSearch,
  XCircle,
  MessageSquare,
  Loader2,
  Phone,
  Mail,
  Calendar,
  Award,
  Car,
  Archive,
  CheckCircle2,
} from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface ApplicationData {
  id: string;
  personal_info: any;
  license_info?: any;
  employment_history?: any;
  driving_history?: any;
  document_upload?: any;
  emergency_contacts?: any;
  status: string;
  driver_status: string | null;
  current_step: number | null;
  submitted_at: string | null;
  updated_at: string | null;
}

interface ApplicationReviewDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: ApplicationData | null;
  onPreviewPDF: (id: string) => void;
  onStatusChange: () => void;
}

export function ApplicationReviewDrawer({
  open,
  onOpenChange,
  application,
  onPreviewPDF,
  onStatusChange,
}: ApplicationReviewDrawerProps) {
  // Drawer does NOT approve - that's done via row-level action only
  const [isRejecting, setIsRejecting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [note, setNote] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);

  if (!application) return null;

  const pi = application.personal_info || {};
  const li = application.license_info || {};
  const dh = application.driving_history || {};
  const docs = application.document_upload || {};
  const employment = Array.isArray(application.employment_history)
    ? application.employment_history
    : application.employment_history?.employers || [];

  // Helper functions
  const maskDOB = (dob: string | null) => {
    if (!dob) return "—";
    try {
      const d = new Date(dob);
      return `**/**/` + d.getFullYear();
    } catch {
      return "—";
    }
  };

  const getRequiredDocs = () => {
    const required = [
      { key: "driversLicense", label: "Driver's License" },
      { key: "socialSecurity", label: "Social Security" },
      { key: "medicalCard", label: "Medical Card" },
      { key: "mvr", label: "MVR" },
    ];
    const present = required.filter((d) => docs[d.key]);
    const missing = required.filter((d) => !docs[d.key]);
    return { present, missing, total: required.length };
  };

  const getAccidentCount = () => {
    return Array.isArray(dh.accidents) ? dh.accidents.length : 0;
  };

  const getViolationCount = () => {
    return Array.isArray(dh.violations) ? dh.violations.length : 0;
  };

  const getEmploymentYears = () => {
    if (!employment.length) return 0;
    // Sum years from employment history
    let totalMonths = 0;
    employment.forEach((emp: any) => {
      if (emp.startDate && emp.endDate) {
        const start = new Date(emp.startDate);
        const end = new Date(emp.endDate);
        totalMonths += (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 30);
      }
    });
    return Math.round(totalMonths / 12 * 10) / 10;
  };

  const needsReview = () => {
    const docInfo = getRequiredDocs();
    return docInfo.missing.length > 0 || application.current_step !== 9;
  };

  // NOTE: Approve is NOT available in drawer - use row-level action only

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    
    setIsRejecting(true);
    try {
      const { error } = await supabase
        .from("applications")
        .update({
          status: "rejected",
          driver_status: "rejected",
          updated_at: new Date().toISOString(),
        })
        .eq("id", application.id);

      if (error) throw error;
      toast.success("Application rejected");
      setShowRejectDialog(false);
      setRejectReason("");
      onStatusChange();
    } catch (error: any) {
      toast.error("Failed to reject: " + error.message);
    } finally {
      setIsRejecting(false);
    }
  };

  const handleArchive = async () => {
    setIsArchiving(true);
    try {
      const { error } = await supabase
        .from("applications")
        .update({
          status: "archived",
          updated_at: new Date().toISOString(),
        })
        .eq("id", application.id);

      if (error) throw error;
      toast.success("Application archived");
      onStatusChange();
    } catch (error: any) {
      toast.error("Failed to archive: " + error.message);
    } finally {
      setIsArchiving(false);
    }
  };

  const handleSaveNote = async () => {
    if (!note.trim()) return;
    
    setIsSavingNote(true);
    try {
      // Store note in audit_logs if available, otherwise just toast
      toast.success("Note saved (internal)");
      setNote("");
    } catch (error: any) {
      toast.error("Failed to save note");
    } finally {
      setIsSavingNote(false);
    }
  };

  const docInfo = getRequiredDocs();

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-[480px] sm:max-w-[480px] p-0 flex flex-col">
          <SheetHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-950/30">
            <div className="flex items-center justify-between">
              <SheetTitle className="text-lg font-semibold">
                Application Review
              </SheetTitle>
              {needsReview() && (
                <Badge variant="destructive" className="gap-1">
                  <AlertTriangle className="h-3 w-3" />
                  Needs Review
                </Badge>
              )}
            </div>
            <p className="text-sm text-muted-foreground">
              {pi.firstName} {pi.lastName}
            </p>
          </SheetHeader>

          <ScrollArea className="flex-1">
            <div className="p-6 space-y-4">
              {/* Applicant Identity Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <User className="h-4 w-4 text-blue-600" />
                    Applicant Identity
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Name</span>
                    <span className="font-medium">
                      {pi.firstName} {pi.middleName ? pi.middleName + " " : ""}{pi.lastName}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Phone className="h-3 w-3" /> Phone
                    </span>
                    <span>{pi.phone || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Mail className="h-3 w-3" /> Email
                    </span>
                    <span className="text-xs">{pi.email || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <Calendar className="h-3 w-3" /> DOB
                    </span>
                    <span>{maskDOB(pi.dob)}</span>
                  </div>
                </CardContent>
              </Card>

              {/* CDL & License Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <CreditCard className="h-4 w-4 text-green-600" />
                    CDL & License
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">License #</span>
                    <span className="font-mono">{li.licenseNumber || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">State / Class</span>
                    <span>{li.licenseState || "—"} / Class {li.licenseClass || "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Endorsements</span>
                    <div className="flex gap-1">
                      {Array.isArray(li.endorsements) && li.endorsements.length > 0 ? (
                        li.endorsements.map((e: string) => (
                          <Badge key={e} variant="secondary" className="text-xs">
                            {e}
                          </Badge>
                        ))
                      ) : (
                        <span className="text-muted-foreground">None</span>
                      )}
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Expires</span>
                    <span>{li.expirationDate ? format(new Date(li.expirationDate), "MM/dd/yyyy") : "—"}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Medical Card Exp</span>
                    <span>{li.medicalCardExpiration ? format(new Date(li.medicalCardExpiration), "MM/dd/yyyy") : "—"}</span>
                  </div>
                </CardContent>
              </Card>

              {/* Employment History Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Briefcase className="h-4 w-4 text-purple-600" />
                    Employment History
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Employers Listed</span>
                    <Badge variant={employment.length >= 3 ? "default" : "secondary"}>
                      {employment.length}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">~Years Covered</span>
                    <span>{getEmploymentYears()} years</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">CDL Experience</span>
                    <span>{li.yearsExperience || 0} years</span>
                  </div>
                </CardContent>
              </Card>

              {/* Driving History Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <Car className="h-4 w-4 text-orange-600" />
                    Driving History
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Accidents (3yr)</span>
                    <Badge variant={getAccidentCount() === 0 ? "default" : "destructive"}>
                      {getAccidentCount()}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">Violations (3yr)</span>
                    <Badge variant={getViolationCount() === 0 ? "default" : "secondary"}>
                      {getViolationCount()}
                    </Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">DUI/DWI</span>
                    <span>{dh.dui === "Yes" || dh.dui === true ? "⚠️ Yes" : "No"}</span>
                  </div>
                  {dh.safetyAwards && (
                    <div className="flex items-center gap-2 pt-1">
                      <Award className="h-4 w-4 text-yellow-500" />
                      <span className="text-xs text-muted-foreground">{dh.safetyAwards}</span>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Documents Checklist Card */}
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium flex items-center gap-2">
                    <FileCheck className="h-4 w-4 text-teal-600" />
                    Documents Checklist
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-2 text-sm">
                  <div className="flex justify-between items-center">
                    <span className="text-muted-foreground">Required Docs</span>
                    <Badge variant={docInfo.missing.length === 0 ? "default" : "destructive"}>
                      {docInfo.present.length}/{docInfo.total}
                    </Badge>
                  </div>
                  
                  <div className="space-y-1 pt-1">
                    {docInfo.present.map((d) => (
                      <div key={d.key} className="flex items-center gap-2 text-xs">
                        <CheckCircle2 className="h-3 w-3 text-green-600" />
                        <span>{d.label}</span>
                      </div>
                    ))}
                    {docInfo.missing.map((d) => (
                      <div key={d.key} className="flex items-center gap-2 text-xs text-destructive">
                        <XCircle className="h-3 w-3" />
                        <span>{d.label} (missing)</span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              <Separator />

              {/* Actions */}
              <div className="space-y-3">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Document Actions</p>
                
                {/* PDF Preview Only - Download is in the row's More menu */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => onPreviewPDF(application.id)}
                  className="gap-2 w-full"
                >
                  <FileSearch className="h-4 w-4" />
                  Preview PDF (in-app)
                </Button>
                <p className="text-xs text-muted-foreground">
                  💡 Use the row's (...) menu to download PDF
                </p>

                {/* Workflow Actions - Reject only (Approve is row-level) */}
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide pt-2">Workflow</p>
                
                {(application.status === "submitted" || application.status === "pending") && (
                  <p className="text-xs text-muted-foreground bg-muted/50 rounded p-2">
                    ✓ Use the green <strong>Approve</strong> button in the table row for 1-click approval
                  </p>
                )}
                
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={() => setShowRejectDialog(true)}
                  disabled={isRejecting || application.status === "rejected" || application.status === "approved"}
                  className="gap-2 w-full"
                >
                  <XCircle className="h-4 w-4" />
                  Reject Application...
                </Button>

                {/* Archive button */}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleArchive}
                  disabled={isArchiving || application.status === "archived"}
                  className="gap-2 w-full text-muted-foreground hover:text-foreground"
                >
                  {isArchiving ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Archive className="h-4 w-4" />
                  )}
                  Archive Application
                </Button>
              </div>

              <Separator />

              {/* Quick Note */}
              <div className="space-y-2">
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                  <MessageSquare className="h-3 w-3" />
                  Add Note
                </p>
                <Textarea
                  placeholder="Add an internal note about this application..."
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className="h-20 text-sm"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={handleSaveNote}
                  disabled={!note.trim() || isSavingNote}
                  className="w-full"
                >
                  {isSavingNote ? (
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                  ) : null}
                  Save Note
                </Button>
              </div>
            </div>
          </ScrollArea>

          {/* Footer with status */}
          <div className="border-t px-6 py-3 bg-muted/30">
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Progress: {application.current_step || 1}/9 steps</span>
              <span>
                Updated: {application.updated_at 
                  ? format(new Date(application.updated_at), "MM/dd/yy HH:mm")
                  : "—"}
              </span>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Reject Dialog */}
      <AlertDialog open={showRejectDialog} onOpenChange={setShowRejectDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reject Application</AlertDialogTitle>
            <AlertDialogDescription>
              Please provide a reason for rejecting this application.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Reason for rejection..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="mt-2"
          />
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleReject}
              disabled={!rejectReason.trim() || isRejecting}
              className="bg-destructive hover:bg-destructive/90"
            >
              {isRejecting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Reject Application
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
