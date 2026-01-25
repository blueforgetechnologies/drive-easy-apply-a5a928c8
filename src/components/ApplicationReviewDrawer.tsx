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
  Home,
  Truck,
  IdCard,
  GraduationCap,
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
  account_name?: string | null;
  account_type?: string | null;
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
    if (!value) return "Not Provided";
    if (value.length <= showLast) return value;
    return "•".repeat(value.length - showLast) + value.slice(-showLast);
  };

  const formatDate = (date: string | null | undefined) => {
    if (!date) return "Not Provided";
    try {
      return format(new Date(date), "MMMM dd, yyyy");
    } catch {
      return "Not Provided";
    }
  };

  const formatDateShort = (date: string | null | undefined) => {
    if (!date) return "Not Provided";
    try {
      return format(new Date(date), "MM/dd/yyyy");
    } catch {
      return "Not Provided";
    }
  };

  const getRequiredDocs = () => {
    const required = [
      { key: "driversLicense", label: "Driver's License" },
      { key: "socialSecurity", label: "Social Security Card" },
      { key: "medicalCard", label: "DOT Medical Card" },
      { key: "mvr", label: "Motor Vehicle Record (MVR)" },
    ];
    const present = required.filter((d) => docs[d.key]);
    const missing = required.filter((d) => !docs[d.key]);
    return { present, missing, total: required.length };
  };

  const getAccidentCount = () => {
    return Array.isArray(dh.accidents) ? dh.accidents.length : (dh.accidentsLast3Years || 0);
  };

  const getViolationCount = () => {
    return Array.isArray(dh.violations) ? dh.violations.length : (dh.violationsLast3Years || 0);
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
  if (docs.socialSecurity) documentList.push({ key: 'socialSecurity', label: 'Social Security Card', doc: docs.socialSecurity });
  if (docs.medicalCard) documentList.push({ key: 'medicalCard', label: 'DOT Medical Card', doc: docs.medicalCard });
  if (docs.mvr) documentList.push({ key: 'mvr', label: 'Motor Vehicle Record', doc: docs.mvr });
  if (docs.twicCard) documentList.push({ key: 'twicCard', label: 'TWIC Card', doc: docs.twicCard });
  if (docs.passport) documentList.push({ key: 'passport', label: 'Passport', doc: docs.passport });
  if (docs.other && Array.isArray(docs.other)) {
    docs.other.forEach((doc: any, idx: number) => {
      const name = typeof doc === 'string' ? doc.split('/').pop() || `Additional Document ${idx + 1}` : doc?.name || `Additional Document ${idx + 1}`;
      documentList.push({ key: `other_${idx}`, label: name, doc });
    });
  }

  const hasDocuments = documentList.length > 0;

  // Full address formatting
  const formatFullAddress = (addr: any) => {
    if (!addr) return "Not Provided";
    const parts = [
      addr.address,
      addr.apartment,
      addr.city,
      addr.state,
      addr.zip,
      addr.county ? `(${addr.county} County)` : null,
    ].filter(Boolean);
    return parts.length > 0 ? parts.join(", ") : "Not Provided";
  };

  const currentAddress = formatFullAddress(pi);
  const previousAddresses = pi.previousAddresses || [];

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

  // Info row component for cleaner display
  const InfoRow = ({ label, value, className = "" }: { label: string; value: React.ReactNode; className?: string }) => (
    <div className={`flex justify-between py-1 ${className}`}>
      <span className="text-muted-foreground text-sm">{label}</span>
      <span className="text-sm font-medium text-right">{value || "Not Provided"}</span>
    </div>
  );

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent className="w-full sm:max-w-[55vw] p-0 flex flex-col">
          {/* Header */}
          <SheetHeader className="px-6 py-4 border-b bg-gradient-to-r from-blue-50 to-slate-50 dark:from-blue-950/30 dark:to-slate-950/30 flex-shrink-0">
            <div className="flex items-center justify-between">
              <div>
                <SheetTitle className="text-xl font-semibold">Application Review</SheetTitle>
                <p className="text-sm text-muted-foreground mt-1">
                  {pi.firstName} {pi.middleName ? pi.middleName + " " : ""}{pi.lastName}
                  {pi.suffix ? ` ${pi.suffix}` : ""}
                </p>
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
                    ← Back to Application
                  </Button>
                )}
              </div>
            </div>
          </SheetHeader>

          {/* Main Content - Split Panel */}
          <div className="flex flex-1 overflow-hidden">
            {/* Left Panel - Documents */}
            {!selectedDocUrl && hasDocuments && (
              <div className="w-60 border-r bg-muted/30 flex-shrink-0 flex flex-col">
                <div className="p-3 border-b">
                  <h3 className="font-semibold text-xs flex items-center gap-1.5 uppercase tracking-wide text-muted-foreground">
                    <FileText className="h-3.5 w-3.5" />
                    Uploaded Documents ({documentList.length})
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
                          <div className="p-2 border-t">
                            <p className="text-xs font-medium truncate">{item.label}</p>
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
                  <div className="p-5 space-y-5">
                    {/* SECTION 1: Personal Information */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <User className="h-5 w-5 text-blue-600" />
                          Personal Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <InfoRow label="Full Legal Name" value={`${pi.firstName || ""} ${pi.middleName || ""} ${pi.lastName || ""} ${pi.suffix || ""}`.trim()} />
                        <InfoRow label="Date of Birth" value={formatDate(pi.dob)} />
                        <InfoRow label="Social Security Number" value={maskSensitive(pi.ssn)} />
                        <InfoRow label="Gender" value={pi.gender} />
                        <InfoRow label="Marital Status" value={pi.maritalStatus} />
                        <Separator className="my-2" />
                        <InfoRow label="Primary Phone" value={pi.phone} />
                        <InfoRow label="Alternate Phone" value={pi.alternatePhone} />
                        <InfoRow label="Email Address" value={pi.email} />
                        <Separator className="my-2" />
                        <InfoRow label="Citizenship Status" value={pi.citizenship} />
                        <InfoRow label="Legally Authorized to Work" value={pi.legallyAuthorized} />
                        <InfoRow label="Requires Sponsorship" value={pi.requiresSponsorship} />
                        <InfoRow label="Veteran Status" value={pi.veteranStatus} />
                        <Separator className="my-2" />
                        <InfoRow label="Felony Conviction" value={pi.felonyConviction} />
                        {pi.felonyExplanation && <InfoRow label="Felony Explanation" value={pi.felonyExplanation} />}
                        <InfoRow label="Misdemeanor Conviction" value={pi.misdemeanorConviction} />
                      </CardContent>
                    </Card>

                    {/* SECTION 2: Current Address */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <Home className="h-5 w-5 text-indigo-600" />
                          Residential Address History
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="p-3 bg-muted/50 rounded-lg border">
                          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-2">Current Address</p>
                          <p className="text-sm font-medium">{currentAddress}</p>
                          {(pi.yearsAtAddress || pi.monthsAtAddress) && (
                            <p className="text-xs text-muted-foreground mt-1">
                              Time at address: {pi.yearsAtAddress || 0} years, {pi.monthsAtAddress || 0} months
                            </p>
                          )}
                        </div>
                        
                        {previousAddresses.length > 0 && (
                          <>
                            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Previous Addresses</p>
                            {previousAddresses.map((addr: any, idx: number) => (
                              <div key={idx} className="p-3 bg-muted/30 rounded-lg border">
                                <p className="text-sm font-medium">{formatFullAddress(addr)}</p>
                                <p className="text-xs text-muted-foreground mt-1">
                                  {formatDateShort(addr.fromDate)} — {formatDateShort(addr.toDate)}
                                  {(addr.yearsAtAddress || addr.monthsAtAddress) && (
                                    <> • {addr.yearsAtAddress || 0} years, {addr.monthsAtAddress || 0} months</>
                                  )}
                                </p>
                              </div>
                            ))}
                          </>
                        )}
                      </CardContent>
                    </Card>

                    {/* SECTION 3: Additional IDs */}
                    {(pi.hasTwicCard || pi.hasPassport || pi.hasHazmatEndorsement) && (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <IdCard className="h-5 w-5 text-cyan-600" />
                            Additional Identification
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-1">
                          {pi.hasTwicCard && (
                            <>
                              <InfoRow label="TWIC Card" value={pi.hasTwicCard ? "Yes" : "No"} />
                              <InfoRow label="TWIC Card Number" value={pi.twicCardNumber} />
                              <InfoRow label="TWIC Expiration Date" value={formatDate(pi.twicExpiration)} />
                            </>
                          )}
                          {pi.hasPassport && (
                            <>
                              <Separator className="my-2" />
                              <InfoRow label="Passport" value={pi.hasPassport ? "Yes" : "No"} />
                              <InfoRow label="Passport Number" value={maskSensitive(pi.passportNumber)} />
                              <InfoRow label="Passport Country" value={pi.passportCountry} />
                              <InfoRow label="Passport Expiration Date" value={formatDate(pi.passportExpiration)} />
                            </>
                          )}
                          {pi.hasHazmatEndorsement && (
                            <>
                              <Separator className="my-2" />
                              <InfoRow label="HazMat Endorsement" value="Yes" />
                            </>
                          )}
                        </CardContent>
                      </Card>
                    )}

                    {/* SECTION 4: Commercial Driver's License */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <CreditCard className="h-5 w-5 text-green-600" />
                          Commercial Driver's License (CDL)
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <InfoRow label="License Number" value={li.licenseNumber} />
                        <InfoRow label="Name on License" value={li.nameOnLicense} />
                        <InfoRow label="Issuing State" value={li.licenseState} />
                        <InfoRow label="License Class" value={li.licenseClass ? `Class ${li.licenseClass}` : null} />
                        <InfoRow label="Issue Date" value={formatDate(li.issuedDate)} />
                        <InfoRow label="Expiration Date" value={formatDate(li.expirationDate)} />
                        <InfoRow label="Restrictions" value={li.restrictions || "None"} />
                        <Separator className="my-2" />
                        <div className="flex justify-between py-1">
                          <span className="text-muted-foreground text-sm">Endorsements</span>
                          <div className="flex gap-1 flex-wrap justify-end">
                            {Array.isArray(li.endorsements) && li.endorsements.length > 0 ? (
                              li.endorsements.map((e: string) => (
                                <Badge key={e} variant="secondary" className="text-xs">{e}</Badge>
                              ))
                            ) : (
                              <span className="text-sm font-medium">None</span>
                            )}
                          </div>
                        </div>
                        <Separator className="my-2" />
                        <InfoRow label="DOT Medical Card Number" value={li.medicalCardNumber} />
                        <InfoRow label="Medical Card Expiration" value={formatDate(li.medicalCardExpiration)} />
                        <InfoRow label="Medical Examiner Name" value={li.medicalExaminerName} />
                        <InfoRow label="DOT Medical Certified" value={li.dotMedical ? "Yes" : "No"} />
                        <Separator className="my-2" />
                        <InfoRow label="Years of CDL Experience" value={li.yearsExperience ? `${li.yearsExperience} years` : null} />
                        <InfoRow label="Other States Licensed" value={li.otherStatesLicensed} />
                        <InfoRow label="Willing to Team Drive" value={li.willingToTeamDrive ? "Yes" : (li.teamDriving || "No")} />
                        <InfoRow label="Willing to Relocate" value={li.willingToRelocate} />
                        <InfoRow label="Preferred Routes" value={li.preferredRoutes} />
                        <InfoRow label="Home Time Preference" value={li.homeTime} />
                        <Separator className="my-2" />
                        <InfoRow label="License Ever Suspended/Revoked" value={li.suspendedRevoked} />
                        <InfoRow label="Ever Denied a License" value={li.deniedLicense} />
                      </CardContent>
                    </Card>

                    {/* SECTION 5: Equipment Experience */}
                    {li.equipmentExperience && li.equipmentExperience.length > 0 && (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <Truck className="h-5 w-5 text-orange-600" />
                            Equipment Experience
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="flex flex-wrap gap-2">
                            {li.equipmentExperience.map((eq: string, idx: number) => (
                              <Badge key={idx} variant="outline" className="text-sm">{eq}</Badge>
                            ))}
                          </div>
                          <div className="grid grid-cols-2 gap-x-4 mt-3">
                            <InfoRow label="Straight Truck" value={li.straightTruck ? "Yes" : "No"} />
                            <InfoRow label="Tractor-Trailer" value={li.tractorTrailer ? "Yes" : "No"} />
                            <InfoRow label="Doubles/Triples" value={li.doubleTripples ? "Yes" : "No"} />
                            <InfoRow label="Tanker" value={li.tankerExperience ? "Yes" : "No"} />
                            <InfoRow label="HazMat" value={li.hazmatExperience ? "Yes" : "No"} />
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    {/* SECTION 6: Employment History */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <Briefcase className="h-5 w-5 text-purple-600" />
                          Employment History
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-4">
                        <div className="grid grid-cols-3 gap-3">
                          <div className="text-center p-3 bg-muted/50 rounded-lg border">
                            <div className="text-2xl font-bold text-primary">{employment.length}</div>
                            <div className="text-xs text-muted-foreground">Employers Listed</div>
                          </div>
                          <div className="text-center p-3 bg-muted/50 rounded-lg border">
                            <div className="text-2xl font-bold text-primary">{getEmploymentYears()}</div>
                            <div className="text-xs text-muted-foreground">Years Covered</div>
                          </div>
                          <div className="text-center p-3 bg-muted/50 rounded-lg border">
                            <div className="text-2xl font-bold text-primary">{li.yearsExperience || 0}</div>
                            <div className="text-xs text-muted-foreground">CDL Experience</div>
                          </div>
                        </div>
                        
                        {employment.map((emp: any, idx: number) => (
                          <div key={idx} className="p-4 bg-muted/30 rounded-lg border space-y-2">
                            <div className="flex justify-between items-start">
                              <div>
                                <p className="font-semibold text-sm">{emp.companyName || emp.employer}</p>
                                <p className="text-xs text-muted-foreground">{emp.position}</p>
                              </div>
                              <Badge variant="outline" className="text-xs">
                                {formatDateShort(emp.startDate)} — {formatDateShort(emp.endDate)}
                              </Badge>
                            </div>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                              <InfoRow label="Address" value={`${emp.address || ""} ${emp.city || ""} ${emp.state || ""} ${emp.zip || ""}`.trim()} />
                              <InfoRow label="Phone" value={emp.phone} />
                              <InfoRow label="Supervisor" value={emp.supervisor} />
                              <InfoRow label="Supervisor Title" value={emp.supervisorTitle} />
                              <InfoRow label="Equipment Driven" value={emp.equipmentDriven} />
                              <InfoRow label="Miles Per Week" value={emp.milesPerWeek} />
                              <InfoRow label="Starting Salary" value={emp.startingSalary} />
                              <InfoRow label="Ending Salary" value={emp.endingSalary} />
                            </div>
                            <InfoRow label="Reason for Leaving" value={emp.reasonForLeaving} />
                            <div className="flex gap-4 text-xs pt-1">
                              <span className={emp.subjectToFMCSR ? "text-green-600" : "text-muted-foreground"}>
                                {emp.subjectToFMCSR ? "✓" : "○"} Subject to FMCSR
                              </span>
                              <span className={emp.subjectToTesting ? "text-green-600" : "text-muted-foreground"}>
                                {emp.subjectToTesting ? "✓" : "○"} Subject to Drug Testing
                              </span>
                              <span className={emp.mayWeContact ? "text-green-600" : "text-muted-foreground"}>
                                {emp.mayWeContact ? "✓" : "○"} May Contact
                              </span>
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    </Card>

                    {/* SECTION 7: Driving Record */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <Car className="h-5 w-5 text-red-600" />
                          Driving Record & Safety History
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        <div className="grid grid-cols-4 gap-3">
                          <div className="text-center p-3 bg-muted/50 rounded-lg border">
                            <div className={`text-2xl font-bold ${getAccidentCount() === 0 ? "text-green-600" : "text-red-600"}`}>
                              {getAccidentCount()}
                            </div>
                            <div className="text-xs text-muted-foreground">Accidents (3 Year)</div>
                          </div>
                          <div className="text-center p-3 bg-muted/50 rounded-lg border">
                            <div className={`text-2xl font-bold ${getViolationCount() === 0 ? "text-green-600" : "text-amber-600"}`}>
                              {getViolationCount()}
                            </div>
                            <div className="text-xs text-muted-foreground">Violations (3 Year)</div>
                          </div>
                          <div className="text-center p-3 bg-muted/50 rounded-lg border">
                            <div className={`text-2xl font-bold ${dh.dui === "No" || !dh.dui ? "text-green-600" : "text-red-600"}`}>
                              {dh.dui === "No" || !dh.dui ? "No" : "Yes"}
                            </div>
                            <div className="text-xs text-muted-foreground">DUI/DWI</div>
                          </div>
                          <div className="text-center p-3 bg-muted/50 rounded-lg border">
                            <div className={`text-2xl font-bold ${dh.failedDrugTest === "No" || !dh.failedDrugTest ? "text-green-600" : "text-red-600"}`}>
                              {dh.failedDrugTest === "No" || !dh.failedDrugTest ? "No" : "Yes"}
                            </div>
                            <div className="text-xs text-muted-foreground">Failed Drug Test</div>
                          </div>
                        </div>
                        
                        <InfoRow label="License Ever Suspended" value={dh.licenseSuspension} />
                        <InfoRow label="License Ever Revoked" value={dh.licenseRevocation} />
                        <InfoRow label="Refused Drug Test" value={dh.refusedDrugTest} />
                        <InfoRow label="Preventable Accidents" value={dh.preventableAccidents} />
                        <InfoRow label="Last MVR Date" value={formatDate(dh.lastMVRDate)} />
                        <InfoRow label="PSP Record Check" value={dh.pspRecordCheck} />
                        
                        {dh.safetyAwards && (
                          <div className="flex items-start gap-2 p-3 bg-green-50 dark:bg-green-950/30 rounded-lg border border-green-200 dark:border-green-800">
                            <Award className="h-5 w-5 text-yellow-500 flex-shrink-0 mt-0.5" />
                            <div>
                              <p className="text-sm font-medium text-green-800 dark:text-green-200">Safety Award</p>
                              <p className="text-xs text-green-700 dark:text-green-300">{dh.safetyAwards}</p>
                            </div>
                          </div>
                        )}

                        {dh.safetyTraining && dh.safetyTraining.length > 0 && (
                          <div>
                            <p className="text-sm text-muted-foreground mb-2">Safety Training Completed:</p>
                            <div className="flex flex-wrap gap-2">
                              {dh.safetyTraining.map((training: string, idx: number) => (
                                <Badge key={idx} variant="secondary" className="text-xs">{training}</Badge>
                              ))}
                            </div>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* SECTION 8: Emergency Contacts */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <Heart className="h-5 w-5 text-pink-600" />
                          Emergency Contacts
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-3">
                        {Array.isArray(ec) && ec.length > 0 ? (
                          ec.map((contact: any, idx: number) => (
                            <div key={idx} className="p-3 bg-muted/30 rounded-lg border">
                              <div className="flex justify-between items-start mb-2">
                                <p className="font-semibold text-sm">{contact.firstName} {contact.lastName}</p>
                                {contact.isPrimary && <Badge variant="default" className="text-xs">Primary</Badge>}
                              </div>
                              <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                                <InfoRow label="Relationship" value={contact.relationship} />
                                <InfoRow label="Phone" value={contact.phone} />
                                <InfoRow label="Alternate Phone" value={contact.alternatePhone} />
                                <InfoRow label="Email" value={contact.email} />
                              </div>
                              {(contact.address || contact.city) && (
                                <InfoRow label="Address" value={formatFullAddress(contact)} className="text-xs mt-1" />
                              )}
                            </div>
                          ))
                        ) : ec.name || ec.contactName || ec.firstName ? (
                          <div className="p-3 bg-muted/30 rounded-lg border">
                            <p className="font-semibold text-sm mb-2">{ec.name || ec.contactName || `${ec.firstName} ${ec.lastName}`}</p>
                            <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-xs">
                              <InfoRow label="Relationship" value={ec.relationship} />
                              <InfoRow label="Phone" value={ec.phone} />
                            </div>
                          </div>
                        ) : (
                          <p className="text-sm text-muted-foreground">No emergency contacts provided</p>
                        )}
                      </CardContent>
                    </Card>

                    {/* SECTION 9: Banking / Direct Deposit */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <DollarSign className="h-5 w-5 text-emerald-600" />
                          Banking & Direct Deposit Information
                        </CardTitle>
                      </CardHeader>
                      <CardContent className="space-y-1">
                        <InfoRow label="Account Holder Name" value={dd.accountHolderName || dd.firstName && dd.lastName ? `${dd.firstName} ${dd.lastName}` : application.account_name} />
                        <InfoRow label="Bank Name" value={dd.bankName || application.bank_name} />
                        <InfoRow label="Bank Address" value={dd.bankAddress} />
                        <InfoRow label="Account Type" value={dd.accountType || application.account_type} />
                        <InfoRow label="Routing Number" value={maskSensitive(dd.routingNumber || application.routing_number)} />
                        <InfoRow label="Account Number" value={maskSensitive(dd.accountNumber || application.checking_number)} />
                        <Separator className="my-2" />
                        <InfoRow label="Preferred Payment Method" value={dd.preferredPaymentMethod} />
                        <InfoRow label="Cash App ($Cashtag)" value={dd.cashAppCashtag} />
                        <InfoRow label="Venmo Handle" value={dd.venmoHandle} />
                        <InfoRow label="Zelle Email" value={dd.zelleEmail} />
                      </CardContent>
                    </Card>

                    {/* SECTION 10: Documents Checklist */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <FileCheck className="h-5 w-5 text-teal-600" />
                          Required Documents Checklist
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="flex justify-between items-center mb-3">
                          <span className="text-sm text-muted-foreground">Completion Status</span>
                          <Badge variant={docInfo.missing.length === 0 ? "default" : "destructive"} className="text-sm">
                            {docInfo.present.length} of {docInfo.total} Required Documents
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          {docInfo.present.map((d) => (
                            <div key={d.key} className="flex items-center gap-2 p-2 bg-green-50 dark:bg-green-950/30 rounded border border-green-200 dark:border-green-800">
                              <CheckCircle2 className="h-4 w-4 text-green-600" />
                              <span className="text-sm">{d.label}</span>
                            </div>
                          ))}
                          {docInfo.missing.map((d) => (
                            <div key={d.key} className="flex items-center gap-2 p-2 bg-red-50 dark:bg-red-950/30 rounded border border-red-200 dark:border-red-800">
                              <XCircle className="h-4 w-4 text-red-600" />
                              <span className="text-sm text-red-700 dark:text-red-300">{d.label} (Missing)</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* SECTION 11: Policy Agreements */}
                    <Card>
                      <CardHeader className="pb-3">
                        <CardTitle className="text-base font-semibold flex items-center gap-2">
                          <Shield className="h-5 w-5 text-indigo-600" />
                          Policy Agreements & Acknowledgements
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="grid grid-cols-1 gap-2">
                          {[
                            { key: "contractor_agreement", label: "Independent Contractor Agreement", data: application.contractor_agreement },
                            { key: "drug_alcohol_policy", label: "Drug & Alcohol Testing Policy", data: application.drug_alcohol_policy },
                            { key: "safe_driving_policy", label: "Safe Driving Policy", data: application.safe_driving_policy },
                            { key: "no_rider_policy", label: "No Rider Policy", data: application.no_rider_policy },
                            { key: "payroll_policy", label: "Payroll & Compensation Policy", data: application.payroll_policy },
                            { key: "driver_dispatch_sheet", label: "Driver Dispatch Sheet Acknowledgement", data: application.driver_dispatch_sheet },
                          ].map((policy) => (
                            <div 
                              key={policy.key} 
                              className={`flex items-center justify-between p-3 rounded border ${
                                policy.data?.agreed || policy.data?.acknowledged 
                                  ? "bg-green-50 dark:bg-green-950/30 border-green-200 dark:border-green-800" 
                                  : "bg-muted/30 border-muted"
                              }`}
                            >
                              <div className="flex items-center gap-2">
                                {policy.data?.agreed || policy.data?.acknowledged ? (
                                  <CheckCircle2 className="h-4 w-4 text-green-600" />
                                ) : (
                                  <AlertCircle className="h-4 w-4 text-muted-foreground" />
                                )}
                                <span className="text-sm">{policy.label}</span>
                              </div>
                              {policy.data?.signature && (
                                <span className="text-xs text-muted-foreground italic">
                                  Signed: {policy.data.signature}
                                </span>
                              )}
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* SECTION 12: Why Hire You */}
                    {(why.whyHireYou || why.statement || why.experience || why.skills || why.goals) && (
                      <Card>
                        <CardHeader className="pb-3">
                          <CardTitle className="text-base font-semibold flex items-center gap-2">
                            <GraduationCap className="h-5 w-5 text-cyan-600" />
                            Applicant Statement - Why Hire Me
                          </CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-4">
                          {(why.whyHireYou || why.statement) && (
                            <div className="p-4 bg-muted/30 rounded-lg border italic text-sm">
                              "{why.whyHireYou || why.statement}"
                            </div>
                          )}
                          {why.experience && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Experience</p>
                              <p className="text-sm">{why.experience}</p>
                            </div>
                          )}
                          {why.skills && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Skills & Qualifications</p>
                              <p className="text-sm">{why.skills}</p>
                            </div>
                          )}
                          {why.goals && (
                            <div>
                              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Career Goals</p>
                              <p className="text-sm">{why.goals}</p>
                            </div>
                          )}
                          <div className="grid grid-cols-2 gap-x-4">
                            <InfoRow label="Availability" value={why.availability} />
                            <InfoRow label="Desired Compensation" value={why.desiredPay} />
                            <InfoRow label="Preferred Routes" value={why.preferredRoutes} />
                          </div>
                        </CardContent>
                      </Card>
                    )}

                    <Separator />

                    {/* Workflow Actions */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Workflow Actions</p>
                      
                      {canApprove && (
                        <Button
                          onClick={handleApprove}
                          size="default"
                          className="gap-2 w-full bg-green-600 hover:bg-green-700 text-white"
                          disabled={isApproving}
                        >
                          {isApproving ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
                          Approve Application
                        </Button>
                      )}

                      {isSubmittedOrPending && !canApprove && application.status !== "approved" && (
                        <div className="text-sm text-amber-600 bg-amber-50 dark:bg-amber-950/30 rounded-lg p-3 flex items-start gap-2 border border-amber-200 dark:border-amber-800">
                          <AlertTriangle className="h-5 w-5 flex-shrink-0 mt-0.5" />
                          <div>
                            <p className="font-medium">Application Not Ready for Approval</p>
                            <p className="text-xs mt-1">
                              {application.current_step !== 9 ? `Application incomplete: Step ${application.current_step || 1} of 9` : ""}
                              {needsReview() && (application.current_step !== 9 ? " • " : "")}
                              {needsReview() ? "Missing required documents" : ""}
                            </p>
                          </div>
                        </div>
                      )}
                      
                      <Button
                        variant="destructive"
                        size="default"
                        onClick={() => setShowRejectDialog(true)}
                        disabled={isRejecting || application.status === "rejected" || application.status === "approved"}
                        className="gap-2 w-full"
                      >
                        <XCircle className="h-4 w-4" />
                        Reject Application
                      </Button>

                      <Button
                        variant="outline"
                        size="default"
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
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Document Actions</p>
                      <Button
                        variant="outline"
                        size="default"
                        onClick={() => onPreviewPDF(application.id, docs)}
                        className="gap-2 w-full"
                      >
                        <FileSearch className="h-4 w-4" />
                        Preview Application PDF
                      </Button>
                    </div>

                    <Separator />

                    {/* Quick Note */}
                    <div className="space-y-3">
                      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide flex items-center gap-1">
                        <MessageSquare className="h-3.5 w-3.5" />
                        Internal Notes
                      </p>
                      <Textarea
                        placeholder="Add an internal note about this application..."
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        className="min-h-[80px] text-sm"
                      />
                      <Button
                        variant="secondary"
                        size="default"
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
              <span>Application Progress: {application.current_step || 1} of 9 steps complete</span>
              <span>
                Last Updated: {application.updated_at 
                  ? format(new Date(application.updated_at), "MMMM dd, yyyy 'at' h:mm a")
                  : "Not Available"}
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
              Please provide a reason for rejecting this application. This will be recorded for reference.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea
            placeholder="Enter rejection reason..."
            value={rejectReason}
            onChange={(e) => setRejectReason(e.target.value)}
            className="mt-2 min-h-[100px]"
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
