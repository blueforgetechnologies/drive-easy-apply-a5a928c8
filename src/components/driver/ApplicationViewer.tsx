import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Button } from "@/components/ui/button";
import { 
  User, Phone, Mail, MapPin, Calendar, Shield, 
  Briefcase, GraduationCap, AlertTriangle, FileCheck,
  CreditCard, Building2, Heart, ClipboardCheck,
  CheckCircle2, XCircle, Clock, FileImage, File, Eye, FileText
} from "lucide-react";
import { format, parseISO } from "date-fns";

interface ApplicationViewerProps {
  data: any;
  onViewMvr?: () => void;
}

export const ApplicationViewer = ({ data, onViewMvr }: ApplicationViewerProps) => {
  const personalInfo = data.personal_info || {};
  const licenseInfo = data.license_info || {};
  const directDeposit = data.direct_deposit || {};
  const drivingHistory = data.driving_history || {};
  const employmentHistory = data.employment_history || [];
  const emergencyContacts = data.emergency_contacts || [];
  const drugAlcoholPolicy = data.drug_alcohol_policy || {};
  const noRiderPolicy = data.no_rider_policy || {};
  const contractorAgreement = data.contractor_agreement || {};
  const driverDispatchSheet = data.driver_dispatch_sheet || {};
  const safeDrivingPolicy = data.safe_driving_policy || {};
  const payrollPolicy = data.payroll_policy || {};
  const whyHireYou = data.why_hire_you || {};
  const documentUpload = data.document_upload || {};

  const formatDate = (dateStr: string | undefined) => {
    if (!dateStr) return "—";
    try {
      return format(parseISO(dateStr), "MMM d, yyyy");
    } catch {
      return dateStr;
    }
  };

  const InfoRow = ({ label, value, icon: Icon }: { label: string; value: React.ReactNode; icon?: any }) => (
    <div className="flex items-start gap-3 py-2">
      {Icon && <Icon className="w-4 h-4 text-muted-foreground mt-0.5 shrink-0" />}
      <div className="flex-1 min-w-0">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{label}</p>
        <p className="text-sm font-medium text-foreground mt-0.5">{value || "—"}</p>
      </div>
    </div>
  );

  const SectionCard = ({ 
    title, 
    icon: Icon, 
    children, 
    variant = "default" 
  }: { 
    title: string; 
    icon: any; 
    children: React.ReactNode;
    variant?: "default" | "success" | "warning" | "info";
  }) => {
    const variantStyles = {
      default: "border-l-slate-400",
      success: "border-l-emerald-500",
      warning: "border-l-amber-500",
      info: "border-l-blue-500",
    };

    const iconStyles = {
      default: "text-slate-600",
      success: "text-emerald-600",
      warning: "text-amber-600",
      info: "text-blue-600",
    };

    return (
      <Card className={`border-l-4 ${variantStyles[variant]} shadow-sm`}>
        <CardHeader className="pb-3">
          <CardTitle className={`flex items-center gap-2 text-base ${iconStyles[variant]}`}>
            <Icon className="w-5 h-5" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="pt-0">{children}</CardContent>
      </Card>
    );
  };

  const PolicyBadge = ({ agreed, label }: { agreed: boolean; label: string }) => (
    <div className="flex items-center gap-2 py-1.5 px-3 rounded-lg bg-muted/50">
      {agreed ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-600" />
      ) : (
        <XCircle className="w-4 h-4 text-rose-600" />
      )}
      <span className="text-sm font-medium">{label}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* Header with submission info */}
      <div className="bg-gradient-to-r from-blue-600 to-indigo-600 rounded-xl p-6 text-white">
        <div className="flex items-start justify-between">
          <div>
            <h2 className="text-2xl font-bold">
              {personalInfo.firstName} {personalInfo.middleName} {personalInfo.lastName}
            </h2>
            <p className="text-blue-100 mt-1">Driver Employment Application</p>
          </div>
          <div className="text-right">
            <div className="flex items-center gap-2 text-blue-100">
              <Clock className="w-4 h-4" />
              <span className="text-sm">Submitted {formatDate(data.submitted_at || data.application_date)}</span>
            </div>
            <Badge 
              variant="secondary" 
              className="mt-2 bg-white/20 text-white hover:bg-white/30"
            >
              {data.status || data.driver_status || "Pending Review"}
            </Badge>
          </div>
        </div>
      </div>

      {/* Personal Information */}
      <SectionCard title="Personal Information" icon={User} variant="info">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6">
          <InfoRow label="Full Name" value={`${personalInfo.firstName || ''} ${personalInfo.middleName || ''} ${personalInfo.lastName || ''}`.replace(/\s+/g, ' ').trim()} icon={User} />
          <InfoRow label="Date of Birth" value={formatDate(personalInfo.dob)} icon={Calendar} />
          <InfoRow label="SSN" value={personalInfo.ssn ? `***-**-${personalInfo.ssn.slice(-4)}` : "—"} icon={Shield} />
          <InfoRow label="Phone" value={personalInfo.phone} icon={Phone} />
          <InfoRow label="Email" value={personalInfo.email} icon={Mail} />
          <InfoRow 
            label="Address" 
            value={[personalInfo.address, personalInfo.city, personalInfo.state, personalInfo.zip].filter(Boolean).join(", ")}
            icon={MapPin} 
          />
        </div>
        
        <Separator className="my-4" />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InfoRow 
            label="Legally Authorized to Work in US" 
            value={personalInfo.legallyAuthorized === "yes" ? "Yes" : personalInfo.legallyAuthorized === "no" ? "No" : "—"} 
          />
          <InfoRow 
            label="Felony Conviction" 
            value={personalInfo.felonyConviction === "yes" ? "Yes" : personalInfo.felonyConviction === "no" ? "No" : "—"} 
          />
          {personalInfo.felonyConviction === "yes" && personalInfo.felonyDetails && (
            <div className="md:col-span-2">
              <InfoRow label="Felony Details" value={personalInfo.felonyDetails} />
            </div>
          )}
        </div>
      </SectionCard>

      {/* License Information */}
      <SectionCard title="CDL & License Information" icon={CreditCard} variant="success">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6">
          <InfoRow label="License Number" value={licenseInfo.licenseNumber} />
          <InfoRow label="State" value={licenseInfo.licenseState} />
          <InfoRow label="Class" value={licenseInfo.licenseClass} />
          <InfoRow label="Endorsements" value={Array.isArray(licenseInfo.endorsements) ? licenseInfo.endorsements.join(", ") : licenseInfo.endorsements} />
          <InfoRow label="Expiration Date" value={formatDate(licenseInfo.expirationDate)} />
          <InfoRow label="Years of Experience" value={licenseInfo.yearsExperience ? `${licenseInfo.yearsExperience} years` : "—"} />
        </div>
        
        <Separator className="my-4" />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6">
          <InfoRow 
            label="Ever Denied a License" 
            value={licenseInfo.deniedLicense === "yes" ? "Yes" : licenseInfo.deniedLicense === "no" ? "No" : "—"} 
          />
          <InfoRow 
            label="License Suspended/Revoked" 
            value={licenseInfo.suspendedRevoked === "yes" ? "Yes" : licenseInfo.suspendedRevoked === "no" ? "No" : "—"} 
          />
          {licenseInfo.deniedDetails && (
            <div className="md:col-span-2">
              <InfoRow label="Details" value={licenseInfo.deniedDetails} />
            </div>
          )}
        </div>
      </SectionCard>

      {/* Employment History */}
      <SectionCard title="Employment History" icon={Briefcase} variant="default">
        {employmentHistory.length > 0 ? (
          <div className="space-y-4">
            {employmentHistory.map((job: any, index: number) => (
              <div key={index} className="border rounded-lg p-4 bg-muted/30">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h4 className="font-semibold text-foreground">{job.companyName || "Employer"}</h4>
                    <p className="text-sm text-muted-foreground">{job.position}</p>
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {formatDate(job.startDate)} — {formatDate(job.endDate) || "Present"}
                  </Badge>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2 mt-3 text-sm">
                  {job.address && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <MapPin className="w-3 h-3" />
                      {job.address}
                    </div>
                  )}
                  {job.phone && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <Phone className="w-3 h-3" />
                      {job.phone}
                    </div>
                  )}
                  {job.supervisor && (
                    <div className="flex items-center gap-2 text-muted-foreground">
                      <User className="w-3 h-3" />
                      Supervisor: {job.supervisor}
                    </div>
                  )}
                </div>
                {job.reasonForLeaving && (
                  <div className="mt-3 pt-3 border-t">
                    <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">Reason for Leaving</p>
                    <p className="text-sm">{job.reasonForLeaving}</p>
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No employment history provided</p>
        )}
      </SectionCard>

      {/* Driving History */}
      <SectionCard title="Driving History" icon={AlertTriangle} variant="warning">
        <div className="space-y-6">
          {/* Accidents */}
          <div>
            <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600" />
              Accidents (Last 3 Years)
            </h4>
            {drivingHistory.accidents && drivingHistory.accidents.length > 0 ? (
              <div className="space-y-2">
                {drivingHistory.accidents.map((accident: any, index: number) => (
                  <div key={index} className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{formatDate(accident.date)}</p>
                        <p className="text-sm text-muted-foreground">{accident.location}</p>
                      </div>
                      <div className="text-right text-sm">
                        <p>Fatalities: {accident.fatalities || 0}</p>
                        <p>Injuries: {accident.injuries || 0}</p>
                      </div>
                    </div>
                    {accident.description && (
                      <p className="text-sm mt-2">{accident.description}</p>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                No accidents reported
              </p>
            )}
          </div>

          {/* Violations */}
          <div>
            <h4 className="font-medium text-sm mb-3 flex items-center gap-2">
              <FileCheck className="w-4 h-4 text-amber-600" />
              Traffic Violations (Last 3 Years)
            </h4>
            {drivingHistory.violations && drivingHistory.violations.length > 0 ? (
              <div className="space-y-2">
                {drivingHistory.violations.map((violation: any, index: number) => (
                  <div key={index} className="border rounded-lg p-3 bg-amber-50 dark:bg-amber-950/20">
                    <div className="flex items-start justify-between">
                      <div>
                        <p className="font-medium">{violation.violation}</p>
                        <p className="text-sm text-muted-foreground">{formatDate(violation.date)} • {violation.location}</p>
                      </div>
                      {violation.penalty && (
                        <Badge variant="outline">{violation.penalty}</Badge>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground bg-emerald-50 dark:bg-emerald-950/20 p-3 rounded-lg flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                No violations reported
              </p>
            )}
          </div>
        </div>
      </SectionCard>

      {/* Emergency Contacts */}
      <SectionCard title="Emergency Contacts" icon={Heart} variant="default">
        {emergencyContacts.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {emergencyContacts.map((contact: any, index: number) => (
              <div key={index} className="border rounded-lg p-4 bg-muted/30">
                <h4 className="font-semibold text-foreground">
                  {contact.firstName} {contact.lastName}
                </h4>
                <p className="text-sm text-muted-foreground capitalize">{contact.relationship}</p>
                <div className="mt-2 space-y-1">
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-3 h-3 text-muted-foreground" />
                    {contact.phone}
                  </div>
                  {contact.address && (
                    <div className="flex items-center gap-2 text-sm">
                      <MapPin className="w-3 h-3 text-muted-foreground" />
                      {contact.address}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-muted-foreground text-sm">No emergency contacts provided</p>
        )}
      </SectionCard>

      {/* Direct Deposit Information */}
      <SectionCard title="Direct Deposit Information" icon={Building2} variant="info">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-x-6">
          <InfoRow label="Account Holder" value={`${directDeposit.firstName || ''} ${directDeposit.lastName || ''}`.trim()} />
          {directDeposit.businessName && (
            <InfoRow label="Business Name" value={directDeposit.businessName} />
          )}
          <InfoRow label="Email" value={directDeposit.email} />
          <InfoRow label="Bank Name" value={directDeposit.bankName} />
          <InfoRow label="Routing Number" value={directDeposit.routingNumber ? `****${directDeposit.routingNumber.slice(-4)}` : "—"} />
          <InfoRow label="Account Number" value={directDeposit.checkingNumber ? `****${directDeposit.checkingNumber.slice(-4)}` : "—"} />
          <InfoRow label="Account Type" value={directDeposit.accountType?.replace(/_/g, ' ').replace(/\b\w/g, (l: string) => l.toUpperCase())} />
          {directDeposit.cashAppCashtag && (
            <InfoRow label="Cash App" value={directDeposit.cashAppCashtag} />
          )}
        </div>
      </SectionCard>

      {/* Policies & Agreements */}
      <SectionCard title="Policies & Agreements Acknowledged" icon={ClipboardCheck} variant="success">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <PolicyBadge 
            agreed={drugAlcoholPolicy.agreedToPolicy || false} 
            label="Drug & Alcohol Policy" 
          />
          <PolicyBadge 
            agreed={noRiderPolicy.agreed || false} 
            label="No Rider Policy" 
          />
          <PolicyBadge 
            agreed={contractorAgreement.agreed || false} 
            label="Contractor Agreement" 
          />
          <PolicyBadge 
            agreed={driverDispatchSheet.agreed || false} 
            label="Dispatch Sheet" 
          />
          <PolicyBadge 
            agreed={!!safeDrivingPolicy.signature} 
            label="Safe Driving Policy" 
          />
          <PolicyBadge 
            agreed={!!payrollPolicy.signature} 
            label="Payroll Policy" 
          />
        </div>
        
        {contractorAgreement.signature && (
          <div className="mt-6 pt-4 border-t">
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-2">Applicant Signature</p>
            <div className="bg-muted/50 rounded-lg p-4">
              <p className="font-signature text-2xl italic text-foreground">{contractorAgreement.signature}</p>
              <p className="text-xs text-muted-foreground mt-2">
                Signed by {contractorAgreement.contractorName} on {formatDate(contractorAgreement.date)}
              </p>
            </div>
          </div>
        )}
      </SectionCard>

      {/* Uploaded Documents */}
      <SectionCard title="Uploaded Documents" icon={FileImage} variant="info">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {/* Social Security Card */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <Shield className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">Social Security Card</span>
            </div>
            {documentUpload.socialSecurity ? (
              <div className="mt-2">
                {typeof documentUpload.socialSecurity === 'string' && documentUpload.socialSecurity.startsWith('data:image') ? (
                  <img 
                    src={documentUpload.socialSecurity} 
                    alt="Social Security Card" 
                    className="w-full h-32 object-cover rounded border cursor-pointer hover:opacity-80 transition"
                    onClick={() => window.open(documentUpload.socialSecurity, '_blank')}
                  />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <File className="w-4 h-4" />
                    <span>Document uploaded</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-500" />
                Not uploaded
              </p>
            )}
          </div>

          {/* Driver's License */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <CreditCard className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">Driver's License</span>
            </div>
            {documentUpload.driversLicense ? (
              <div className="mt-2">
                {typeof documentUpload.driversLicense === 'string' && documentUpload.driversLicense.startsWith('data:image') ? (
                  <img 
                    src={documentUpload.driversLicense} 
                    alt="Driver's License" 
                    className="w-full h-32 object-cover rounded border cursor-pointer hover:opacity-80 transition"
                    onClick={() => window.open(documentUpload.driversLicense, '_blank')}
                  />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <File className="w-4 h-4" />
                    <span>Document uploaded</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-500" />
                Not uploaded
              </p>
            )}
          </div>

          {/* Medical Card */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center gap-2 mb-2">
              <Heart className="w-4 h-4 text-muted-foreground" />
              <span className="font-medium text-sm">Medical Card</span>
            </div>
            {documentUpload.medicalCard ? (
              <div className="mt-2">
                {typeof documentUpload.medicalCard === 'string' && documentUpload.medicalCard.startsWith('data:image') ? (
                  <img 
                    src={documentUpload.medicalCard} 
                    alt="Medical Card" 
                    className="w-full h-32 object-cover rounded border cursor-pointer hover:opacity-80 transition"
                    onClick={() => window.open(documentUpload.medicalCard, '_blank')}
                  />
                ) : (
                  <div className="flex items-center gap-2 text-sm text-blue-600">
                    <File className="w-4 h-4" />
                    <span>Document uploaded</span>
                  </div>
                )}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-500" />
                Not uploaded
              </p>
            )}
          </div>

          {/* MVR (Motor Vehicle Record) */}
          <div className="border rounded-lg p-4 bg-muted/30">
            <div className="flex items-center justify-between mb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-muted-foreground" />
                <span className="font-medium text-sm">MVR (Motor Vehicle Record)</span>
              </div>
              {documentUpload.mvr && onViewMvr && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2 text-orange-600 hover:text-orange-700"
                  onClick={onViewMvr}
                >
                  <Eye className="w-3.5 h-3.5 mr-1" />
                  View
                </Button>
              )}
            </div>
            {documentUpload.mvr ? (
              <div className="flex items-center gap-2 text-sm text-emerald-600">
                <CheckCircle2 className="w-4 h-4" />
                <span>Document uploaded</span>
              </div>
            ) : (
              <p className="text-sm text-muted-foreground flex items-center gap-2">
                <XCircle className="w-4 h-4 text-rose-500" />
                Not uploaded
              </p>
            )}
          </div>
        </div>

        {/* Other Documents */}
        {documentUpload.other && documentUpload.other.length > 0 && (
          <div className="mt-4 pt-4 border-t">
            <h4 className="font-medium text-sm mb-3">Additional Documents ({documentUpload.other.length})</h4>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {documentUpload.other.map((doc: any, index: number) => (
                <div key={index} className="border rounded-lg p-3 bg-muted/30">
                  {typeof doc === 'string' && doc.startsWith('data:image') ? (
                    <img 
                      src={doc} 
                      alt={`Document ${index + 1}`} 
                      className="w-full h-20 object-cover rounded cursor-pointer hover:opacity-80 transition"
                      onClick={() => window.open(doc, '_blank')}
                    />
                  ) : (
                    <div className="flex items-center gap-2 text-sm text-blue-600">
                      <File className="w-4 h-4" />
                      <span>Document {index + 1}</span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </SectionCard>

      {/* Why Hire You */}
      {whyHireYou.statement && (
        <SectionCard title="Why Should We Hire You?" icon={GraduationCap} variant="info">
          <div className="bg-blue-50 dark:bg-blue-950/20 rounded-lg p-4">
            <p className="text-sm leading-relaxed whitespace-pre-wrap">{whyHireYou.statement}</p>
          </div>
        </SectionCard>
      )}

      {/* Application Footer */}
      <div className="bg-muted/50 rounded-lg p-4 text-center text-sm text-muted-foreground">
        <p>Application ID: {data.id}</p>
        {data.invite_id && <p>Invite ID: {data.invite_id}</p>}
      </div>
    </div>
  );
};
