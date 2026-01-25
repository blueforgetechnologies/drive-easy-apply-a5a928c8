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
  MapPin,
  FileText,
  Image as ImageIcon,
  Building,
  Clock,
  Shield,
  Heart,
  DollarSign,
  AlertCircle,
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
  direct_deposit?: any;
  contractor_agreement?: any;
  drug_alcohol_policy?: any;
  safe_driving_policy?: any;
  no_rider_policy?: any;
  payroll_policy?: any;
  why_hire_you?: any;
  driver_dispatch_sheet?: any;
  status: string;
  driver_status: string | null;
  current_step: number | null;
  submitted_at: string | null;
  updated_at: string | null;
  bank_name?: string | null;
  routing_number?: string | null;
  checking_number?: string | null;
}

interface ApplicationReviewDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  application: ApplicationData | null;
  onPreviewPDF: (id: string, documents?: any) => void;
  onStatusChange: () => void;
}

export function ApplicationReviewDrawer({
  open,
  onOpenChange,
  application,
  onPreviewPDF,
  onStatusChange,
}: ApplicationReviewDrawerProps) {
  const [isApproving, setIsApproving] = useState(false);
  const [isRejecting, setIsRejecting] = useState(false);
  const [isArchiving, setIsArchiving] = useState(false);
  const [showRejectDialog, setShowRejectDialog] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [note, setNote] = useState("");
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [selectedDocUrl, setSelectedDocUrl] = useState<string | null>(null);
  const [selectedDocName, setSelectedDocName] = useState<string>("");

  if (!application) return null;

  const pi = application.personal_info || {};
  const li = application.license_info || {};
  const dh = application.driving_history || {};
  const docs = application.document_upload || {};
  const dd = application.direct_deposit || {};
  const ec = application.emergency_contacts || {};
  const why = application.why_hire_you || {};
  const employment = Array.isArray(application.employment_history)
    ? application.employment_history
    : application.employment_history?.employers || [];

  // Helper functions
  const maskSensitive = (value: string | null | undefined, showLast = 4) => {
    if (!value) return "—";
    if (value.length <= showLast) return value;
    return "•".repeat(value.length - showLast) + value.slice(-showLast);
  };

  const maskDOB = (dob: string | null) => {
    if (!dob) return "—";
    try {
      const d = new Date(dob);
      return `**/**/` + d.getFullYear();
    } catch {
      return "—";
    }
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "—";
    try {
      return format(new Date(date), "MM/dd/yyyy");
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

  // Document helpers
  const getDocumentUrl = (doc: string | File | null | undefined): string | null => {
    if (!doc) return null;
    if (doc instanceof File) return URL.createObjectURL(doc);
    if (typeof doc === "string") {
      if (doc.startsWith("http://") || doc.startsWith("https://") || doc.startsWith("blob:") || doc.startsWith("data:")) {
        return doc;
      }
      const cleanPath = doc.startsWith('/') ? doc.slice(1) : doc;
      const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
      if (supabaseUrl && cleanPath) {
        return `${supabaseUrl}/storage/v1/object/public/load-documents/${cleanPath}`;
      }
    }
    return null;
  };

  const isImageUrl = (url: string): boolean => {
    const lowerUrl = url.toLowerCase();
    return lowerUrl.includes('.jpg') || lowerUrl.includes('.jpeg') || 
           lowerUrl.includes('.png') || lowerUrl.includes('.gif') ||
           lowerUrl.includes('.webp') || lowerUrl.startsWith('blob:') || 
           lowerUrl.startsWith('data:image');
  };

  // Build document list
  const documentList: { key: string; label: string; doc: any }[] = [];
  if (docs.driversLicense) documentList.push({ key: 'driversLicense', label: "Driver's License", doc: docs.driversLicense });
  if (docs.socialSecurity) documentList.push({ key: 'socialSecurity', label: 'Social Security', doc: docs.socialSecurity });
  if (docs.medicalCard) documentList.push({ key: 'medicalCard', label: 'Medical Card', doc: docs.medicalCard });
  if (docs.mvr) documentList.push({ key: 'mvr', label: 'MVR', doc: docs.mvr });
  if (docs.other && Array.isArray(docs.other)) {
    docs.other.forEach((doc: any, idx: number) => {
      const name = typeof doc === 'string' ? doc.split('/').pop() || `Other ${idx + 1}` : doc?.name || `Other ${idx + 1}`;
      documentList.push({ key: `other_${idx}`, label: name, doc });
    });
  }

  const hasDocuments = documentList.length > 0;

  // Check if application is ready for approval
  const isSubmittedOrPending = application.status === "submitted" || application.status === "pending";
  const isReady = isSubmittedOrPending && application.current_step === 9 && !needsReview();
  const canApprove = isReady && application.status !== "approved" && application.status !== "rejected";

  // Handlers
  const handleApprove = async () => {
    setIsApproving(true);
    try {
      const { data, error } = await supabase.functions.invoke("approve-application", {
        body: { application_id: application.id },
      });
      if (error) throw error;
      if (!data?.success) throw new Error(data?.error || "Failed to approve application");
      toast.success(data.message || "Application approved - driver is now pending onboarding");
      onStatusChange();
      onOpenChange(false);
    } catch (error: any) {
      toast.error("Failed to approve: " + error.message);
    } finally {
      setIsApproving(false);
    }
  };

  const handleReject = async () => {
    if (!rejectReason.trim()) {
      toast.error("Please provide a reason for rejection");
      return;
    }
    setIsRejecting(true);
    try {
      const { error } = await supabase
        .from("applications")
        .update({ status: "rejected", driver_status: "rejected", updated_at: new Date().toISOString() })
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
        .update({ status: "archived", updated_at: new Date().toISOString() })
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
      toast.success("Note saved (internal)");
      setNote("");
    } catch {
      toast.error("Failed to save note");
    } finally {
      setIsSavingNote(false);
    }
  };

  const docInfo = getRequiredDocs();

  // Full address formatting
  const fullAddress = [pi.address, pi.city, pi.state, pi.zip].filter(Boolean).join(", ") || "—";

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-[50vw] p-0 flex flex-col">
          {/* Header */}
          <SheetHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-950/30 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-lg font-semibold">Application Review</SheetTitle>
                <p className="text-sm text-muted-foreground">{pi.firstName} {pi.lastName}</p>
              </div>
              <div className="flex items-center gap-2">
                {needsReview() && (
                  <Badge variant="destructive" className="gap-1">
                    <AlertTriangle className="h-3 w-3" />
                    Needs Review
                  </Badge>
                )}
                {selectedDocUrl && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => { setSelectedDocUrl(null); setSelectedDocName(""); }}
                  >
                    ← Back
                  </Button>
                )}
              </div>
            </div>
          </SheetHeader>

          {/* Main Content - Split Panel */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left Panel - Documents */}
            {!selectedDocUrl && hasDocuments && (
              <div className="w-56 border-r bg-muted/30 flex-shrink-0 flex flex-col">
                <div className="p-3 border-b">
                  <h3 className="font-semibold text-xs flex items-center gap-1.5 uppercase tracking-wide text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    Uploaded Documents
                  </h3>
                </div>
                <ScrollArea className="flex-1">
                  <div className="p-2 space-y-2">
                    {documentList.map((item) => {
                      const url = getDocumentUrl(item.doc);
                      const isImage = url && isImageUrl(url);
                      
                      return (
                        <Card
                          key={item.key}
                          className="cursor-pointer hover:bg-accent/50 transition-colors overflow-hidden"
                          onClick={() => {
                            if (url) {
                              setSelectedDocUrl(url);
                              setSelectedDocName(item.label);
                            } else {
                              toast.error("Document not available");
                            }
                          }}
                        >
                          {isImage && url ? (
                            <div className="aspect-[4/3] relative bg-muted overflow-hidden">
                              <img
                                src={url}
                                alt={item.label}
                                className="w-full h-full object-cover"
                                loading="lazy"
                                onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }}
                              />
                              <div className="absolute inset-0 flex items-center justify-center -z-10">
                                <ImageIcon className="h-6 w-6 text-muted-foreground" />
                              </div>
                            </div>
                          ) : (
                            <div className="aspect-[4/3] flex items-center justify-center bg-muted">
                              <FileText className="h-6 w-6 text-muted-foreground" />
                            </div>
                          )}
                          <div className="p-1.5 border-t">
                            <p className="text-[10px] font-medium truncate">{item.label}</p>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </ScrollArea>
              </div>
            )}

            {/* Right Panel - Application Details or Document Viewer */}
            <div className="flex-1 overflow-hidden flex flex-col">
              {selectedDocUrl ? (
                // Document Full View
                <ScrollArea className="flex-1">
                  <div className="p-6 flex justify-center">
                    {isImageUrl(selectedDocUrl) ? (
                      <img
                        src={selectedDocUrl}
                        alt={selectedDocName}
                        className="max-w-full h-auto shadow-lg rounded-lg"
                      />
                    ) : (
                      <iframe
                        src={selectedDocUrl}
                        className="w-full h-[70vh] border rounded-lg"
                        title={selectedDocName}
                      />
                    )}
                  </div>
                </ScrollArea>
              ) : (
                // Application Details
                <ScrollArea className="flex-1">
                  <div className="p-4 space-y-4">
                    {/* Personal Information */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <User className="h-4 w-4 text-blue-600" />
                          Personal Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Full Name</span>
                          <span className="font-medium text-right">
                            {pi.firstName} {pi.middleName ? pi.middleName + " " : ""}{pi.lastName}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">DOB</span>
                          <span>{maskDOB(pi.dob)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground flex items-center gap-1"><Phone className="h-3 w-3" />Phone</span>
                          <span>{pi.phone || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground flex items-center gap-1"><Mail className="h-3 w-3" />Email</span>
                          <span className="text-xs truncate max-w-[140px]">{pi.email || "—"}</span>
                        </div>
                        <div className="col-span-2 flex justify-between">
                          <span className="text-muted-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />Address</span>
                          <span className="text-right text-xs max-w-[200px] truncate">{fullAddress}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">SSN</span>
                          <span className="font-mono">{maskSensitive(pi.ssn)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Citizenship</span>
                          <span>{pi.citizenship || "—"}</span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* CDL & License */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <CreditCard className="h-4 w-4 text-green-600" />
                          CDL & License
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">License #</span>
                          <span className="font-mono">{li.licenseNumber || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Name on License</span>
                          <span>{li.nameOnLicense || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">State</span>
                          <span>{li.licenseState || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Class</span>
                          <span>Class {li.licenseClass || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Issued</span>
                          <span>{formatDate(li.issuedDate)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Expires</span>
                          <span>{formatDate(li.expirationDate)}</span>
                        </div>
                        <div className="col-span-2 flex justify-between">
                          <span className="text-muted-foreground">Endorsements</span>
                          <div className="flex gap-1 flex-wrap justify-end">
                            {Array.isArray(li.endorsements) && li.endorsements.length > 0 ? (
                              li.endorsements.map((e: string) => (
                                <Badge key={e} variant="secondary" className="text-xs">{e}</Badge>
                              ))
                            ) : (
                              <span className="text-muted-foreground">None</span>
                            )}
                          </div>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Medical Card Exp</span>
                          <span>{formatDate(li.medicalCardExpiration)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">DOT Medical</span>
                          <span>{li.dotMedical ? "Yes" : "No"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Years Experience</span>
                          <span>{li.yearsExperience || 0} years</span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Employment History */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Briefcase className="h-4 w-4 text-purple-600" />
                          Employment History
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3 text-sm">
                        <div className="grid grid-cols-3 gap-2">
                          <div className="text-center p-2 bg-muted/50 rounded">
                            <div className="text-lg font-bold text-primary">{employment.length}</div>
                            <div className="text-xs text-muted-foreground">Employers</div>
                          </div>
                          <div className="text-center p-2 bg-muted/50 rounded">
                            <div className="text-lg font-bold text-primary">{getEmploymentYears()}</div>
                            <div className="text-xs text-muted-foreground">Years</div>
                          </div>
                          <div className="text-center p-2 bg-muted/50 rounded">
                            <div className="text-lg font-bold text-primary">{li.yearsExperience || 0}</div>
                            <div className="text-xs text-muted-foreground">CDL Exp</div>
                          </div>
                        </div>
                        {employment.length > 0 && (
                          <div className="space-y-2 pt-2">
                            {employment.slice(0, 3).map((emp: any, idx: number) => (
                              <div key={idx} className="p-2 bg-muted/30 rounded border text-xs">
                                <div className="font-medium">{emp.companyName || emp.employer || "Company"}</div>
                                <div className="text-muted-foreground flex items-center gap-1">
                                  <Clock className="h-3 w-3" />
                                  {formatDate(emp.startDate)} - {formatDate(emp.endDate)}
                                </div>
                                {emp.position && <div className="text-muted-foreground">{emp.position}</div>}
                              </div>
                            ))}
                            {employment.length > 3 && (
                              <p className="text-xs text-muted-foreground text-center">+{employment.length - 3} more employers</p>
                            )}
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Driving History */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Car className="h-4 w-4 text-orange-600" />
                          Driving History
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Accidents (3yr)</span>
                          <Badge variant={getAccidentCount() === 0 ? "default" : "destructive"}>{getAccidentCount()}</Badge>
                        </div>
                        <div className="flex justify-between items-center">
                          <span className="text-muted-foreground">Violations (3yr)</span>
                          <Badge variant={getViolationCount() === 0 ? "default" : "secondary"}>{getViolationCount()}</Badge>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">DUI/DWI</span>
                          <span className={dh.dui === "Yes" || dh.dui === true ? "text-destructive font-medium" : ""}>
                            {dh.dui === "Yes" || dh.dui === true ? "⚠️ Yes" : "No"}
                          </span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">License Suspended</span>
                          <span>{dh.licenseSuspended || "No"}</span>
                        </div>
                        {dh.safetyAwards && (
                          <div className="col-span-2 flex items-center gap-2 pt-1 text-xs">
                            <Award className="h-4 w-4 text-yellow-500" />
                            <span className="text-muted-foreground">{dh.safetyAwards}</span>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Emergency Contact */}
                    {(ec.name || ec.contactName || (Array.isArray(ec) && ec.length > 0)) && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <Heart className="h-4 w-4 text-red-500" />
                            Emergency Contact
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                          {Array.isArray(ec) ? (
                            ec.slice(0, 2).map((contact: any, idx: number) => (
                              <div key={idx} className="col-span-2 p-2 bg-muted/30 rounded text-xs">
                                <div className="font-medium">{contact.name || contact.contactName || "—"}</div>
                                <div className="text-muted-foreground">{contact.relationship || "—"} • {contact.phone || "—"}</div>
                              </div>
                            ))
                          ) : (
                            <>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Name</span>
                                <span>{ec.name || ec.contactName || "—"}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Phone</span>
                                <span>{ec.phone || "—"}</span>
                              </div>
                              <div className="flex justify-between">
                                <span className="text-muted-foreground">Relationship</span>
                                <span>{ec.relationship || "—"}</span>
                              </div>
                            </>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* Banking / Direct Deposit */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <DollarSign className="h-4 w-4 text-emerald-600" />
                          Banking Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Bank Name</span>
                          <span>{dd.bankName || application.bank_name || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Account Type</span>
                          <span>{dd.accountType || "—"}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Routing #</span>
                          <span className="font-mono">{maskSensitive(dd.routingNumber || application.routing_number)}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Account #</span>
                          <span className="font-mono">{maskSensitive(dd.accountNumber || application.checking_number)}</span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Documents Checklist */}
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
                        <div className="grid grid-cols-2 gap-1 pt-1">
                          {docInfo.present.map((d) => (
                            <div key={d.key} className="flex items-center gap-1.5 text-xs">
                              <CheckCircle2 className="h-3 w-3 text-green-600" />
                              <span>{d.label}</span>
                            </div>
                          ))}
                          {docInfo.missing.map((d) => (
                            <div key={d.key} className="flex items-center gap-1.5 text-xs text-destructive">
                              <XCircle className="h-3 w-3" />
                              <span>{d.label}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Policy Agreements */}
                    <Card>
                      <CardHeader className="pb-2">
                        <CardTitle className="text-sm font-medium flex items-center gap-2">
                          <Shield className="h-4 w-4 text-indigo-600" />
                          Policy Agreements
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="grid grid-cols-2 gap-2 text-xs">
                        <div className="flex items-center gap-1.5">
                          {application.contractor_agreement?.agreed ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span>Contractor Agreement</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {application.drug_alcohol_policy?.agreed ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span>Drug & Alcohol</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {application.safe_driving_policy?.agreed ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span>Safe Driving</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {application.no_rider_policy?.agreed ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span>No Rider Policy</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {application.payroll_policy?.agreed ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <AlertCircle className="h-3 w-3 text-muted-foreground" />
                          )}
                          <span>Payroll Policy</span>
                        </div>
                      </CardContent>
                    </Card>

                    {/* Why Hire Section */}
                    {(why.experience || why.skills || why.whyHireYou) && (
                      <Card>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-sm font-medium flex items-center gap-2">
                            <MessageSquare className="h-4 w-4 text-cyan-600" />
                            Why Hire You
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="text-sm space-y-2">
                          {why.whyHireYou && (
                            <p className="text-xs text-muted-foreground italic">"{why.whyHireYou}"</p>
                          )}
                          {why.experience && (
                            <div>
                              <span className="text-muted-foreground text-xs">Experience:</span>
                              <p className="text-xs">{why.experience}</p>
                            </div>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    <Separator />

                    {/* Workflow Actions */}
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Workflow Actions</p>
                      
                      {canApprove && (
                        <Button
                          onClick={handleApprove}
                          size="sm"
                          className="gap-2 w-full bg-green-600 hover:bg-green-700 text-white"
                          disabled={isApproving}
                        >
                          {isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Approve Application
                        </Button>
                      )}

                      {isSubmittedOrPending && !canApprove && application.status !== "approved" && (
                        <div className="text-xs text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded p-2 flex items-start gap-2">
                          <AlertTriangle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                          <span>
                            Not ready: {application.current_step !== 9 ? `Step ${application.current_step || 1}/9` : ""}
                            {needsReview() && (application.current_step !== 9 ? " • " : "")}
                            {needsReview() ? "Missing required documents" : ""}
                          </span>
                        </div>
                      )}
                      
                      <Button
                        variant="destructive"
                        size="sm"
                        onClick={() => setShowRejectDialog(true)}
                        disabled={isRejecting || application.status === "rejected" || application.status === "approved"}
                        className="gap-2 w-full"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject Application
                      </Button>

                      <Button
                        variant="outline"
                        size="sm"
                        onClick={handleArchive}
                        disabled={isArchiving || application.status === "archived"}
                        className="gap-2 w-full text-muted-foreground hover:text-foreground"
                      >
                        {isArchiving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Archive className="h-4 w-4" />}
                        Archive Application
                      </Button>
                    </div>

                    <Separator />

                    {/* Document Actions */}
                    <div className="space-y-3">
                      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Document Actions</p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onPreviewPDF(application.id, docs)}
                        className="gap-2 w-full"
                      >
                        <FileSearch className="h-4 w-4" />
                        Preview PDF
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
                        className="h-16 text-sm"
                      />
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={handleSaveNote}
                        disabled={!note.trim() || isSavingNote}
                        className="w-full"
                      >
                        {isSavingNote ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                        Save Note
                      </Button>
                    </div>
                  </div>
                </ScrollArea>
              )}
            </div>
          </div>

          {/* Footer */}
          <div className="border-t px-6 py-3 bg-muted/30 flex-shrink-0">
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
