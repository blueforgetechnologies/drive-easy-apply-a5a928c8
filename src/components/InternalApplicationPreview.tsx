import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Eye, FileText, Download, AlertTriangle, Loader2 } from "lucide-react";
import { useTenantContext } from "@/contexts/TenantContext";
import { SAMPLE_APPLICATION_DATA, SAMPLE_COMPANY_PROFILE } from "@/lib/sampleApplicationData";
import jsPDF from "jspdf";
import { toast } from "sonner";

/**
 * Internal-only Preview for Application Wizard and PDF
 * 
 * SECURITY: This component is gated to platform admins in the internal channel only.
 * It does NOT write to the database - uses local fixture data only.
 */
export function InternalApplicationPreview() {
  const { isPlatformAdmin, effectiveTenant } = useTenantContext();
  const [open, setOpen] = useState(false);
  const [generatingPdf, setGeneratingPdf] = useState(false);

  // INTERNAL GATING: Only show to platform admins in internal channel
  const releaseChannel = effectiveTenant?.release_channel;
  const isInternal = isPlatformAdmin && releaseChannel === "internal";
  
  if (!isInternal) {
    return null;
  }

  const handleDownloadSamplePdf = async () => {
    setGeneratingPdf(true);
    try {
      const doc = new jsPDF();
      const data = SAMPLE_APPLICATION_DATA;
      const company = SAMPLE_COMPANY_PROFILE;
      
      let yPos = 20;
      const margin = 20;
      const pageWidth = doc.internal.pageSize.width;

      // Letterhead
      doc.setFontSize(22);
      doc.setTextColor(30, 64, 175);
      doc.setFont(undefined, 'bold');
      doc.text(company.company_name, margin, yPos);
      yPos += 10;

      doc.setFontSize(10);
      doc.setTextColor(100, 100, 100);
      doc.setFont(undefined, 'normal');
      doc.text(`${company.address}, ${company.city}, ${company.state} ${company.zip}`, margin, yPos);
      yPos += 15;

      // Title
      doc.setDrawColor(59, 130, 246);
      doc.setLineWidth(2);
      doc.line(margin, yPos, pageWidth - margin, yPos);
      yPos += 15;

      doc.setFontSize(16);
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'bold');
      doc.text('DRIVER EMPLOYMENT APPLICATION (SAMPLE)', pageWidth / 2, yPos, { align: 'center' });
      yPos += 10;

      doc.setFontSize(10);
      doc.setTextColor(255, 0, 0);
      doc.text('*** INTERNAL PREVIEW - NOT A REAL APPLICATION ***', pageWidth / 2, yPos, { align: 'center' });
      yPos += 15;

      // Personal Info
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(margin, yPos - 5, pageWidth - 2 * margin, 12, 2, 2, 'F');
      doc.setFontSize(12);
      doc.setTextColor(30, 64, 175);
      doc.setFont(undefined, 'bold');
      doc.text('PERSONAL INFORMATION', margin + 5, yPos + 3);
      yPos += 15;

      const pi = data.personal_info;
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      doc.setFont(undefined, 'normal');
      
      const fields = [
        ['Full Name:', `${pi.firstName} ${pi.middleName} ${pi.lastName}`],
        ['Date of Birth:', pi.dob],
        ['Phone:', pi.phone],
        ['Email:', pi.email],
        ['Address:', `${pi.address}, ${pi.city}, ${pi.state} ${pi.zip}`],
      ];

      fields.forEach(([label, value]) => {
        doc.setFont(undefined, 'bold');
        doc.text(label, margin, yPos);
        doc.setFont(undefined, 'normal');
        doc.text(value, margin + 40, yPos);
        yPos += 6;
      });

      yPos += 10;

      // License Info
      doc.setFillColor(243, 244, 246);
      doc.roundedRect(margin, yPos - 5, pageWidth - 2 * margin, 12, 2, 2, 'F');
      doc.setFontSize(12);
      doc.setTextColor(30, 64, 175);
      doc.setFont(undefined, 'bold');
      doc.text('LICENSE INFORMATION', margin + 5, yPos + 3);
      yPos += 15;

      const li = data.license_info;
      doc.setFontSize(9);
      doc.setTextColor(0, 0, 0);
      
      const licenseFields = [
        ['License #:', li.licenseNumber],
        ['State:', li.licenseState],
        ['Class:', li.licenseClass],
        ['Endorsements:', li.endorsements.join(', ')],
        ['Expiration:', li.expirationDate],
      ];

      licenseFields.forEach(([label, value]) => {
        doc.setFont(undefined, 'bold');
        doc.text(label, margin, yPos);
        doc.setFont(undefined, 'normal');
        doc.text(value, margin + 40, yPos);
        yPos += 6;
      });

      // Footer
      const pageHeight = doc.internal.pageSize.height;
      doc.setFontSize(8);
      doc.setTextColor(150, 150, 150);
      doc.text('SAMPLE PDF - Generated for internal preview only', pageWidth / 2, pageHeight - 20, { align: 'center' });

      // Download
      doc.save(`Sample_Driver_Application_${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success("Sample PDF downloaded (internal preview only)");
    } catch (error) {
      console.error("Error generating sample PDF:", error);
      toast.error("Failed to generate sample PDF");
    } finally {
      setGeneratingPdf(false);
    }
  };

  const data = SAMPLE_APPLICATION_DATA;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Eye className="h-4 w-4" />
          Preview (Sample)
          <Badge variant="secondary" className="ml-1 text-xs">INTERNAL</Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Eye className="h-5 w-5" />
            Internal Application Preview
            <Badge variant="destructive">INTERNAL ONLY</Badge>
          </DialogTitle>
          <DialogDescription className="flex items-center gap-2 text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            This preview uses sample data and does NOT write to the database
          </DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="data" className="flex-1 overflow-hidden flex flex-col">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="data">Application Data</TabsTrigger>
            <TabsTrigger value="review">Review Preview</TabsTrigger>
            <TabsTrigger value="pdf">PDF Preview</TabsTrigger>
          </TabsList>

          <TabsContent value="data" className="flex-1 overflow-hidden">
            <ScrollArea className="h-[500px] rounded-md border p-4">
              <div className="space-y-4">
                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Personal Information</CardTitle>
                  </CardHeader>
                  <CardContent className="py-2">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">Name:</span> {data.personal_info.firstName} {data.personal_info.lastName}</div>
                      <div><span className="text-muted-foreground">Email:</span> {data.personal_info.email}</div>
                      <div><span className="text-muted-foreground">Phone:</span> {data.personal_info.phone}</div>
                      <div><span className="text-muted-foreground">DOB:</span> {data.personal_info.dob}</div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">License Information</CardTitle>
                  </CardHeader>
                  <CardContent className="py-2">
                    <div className="grid grid-cols-2 gap-2 text-sm">
                      <div><span className="text-muted-foreground">License #:</span> {data.license_info.licenseNumber}</div>
                      <div><span className="text-muted-foreground">Class:</span> {data.license_info.licenseClass}</div>
                      <div><span className="text-muted-foreground">State:</span> {data.license_info.licenseState}</div>
                      <div><span className="text-muted-foreground">Endorsements:</span> {data.license_info.endorsements.join(", ")}</div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Employment History ({data.employment_history.length} entries)</CardTitle>
                  </CardHeader>
                  <CardContent className="py-2">
                    {data.employment_history.map((emp, i) => (
                      <div key={i} className="mb-3 p-2 bg-muted rounded text-sm">
                        <div className="font-medium">{emp.companyName}</div>
                        <div className="text-muted-foreground">{emp.position} ({emp.startDate} - {emp.endDate})</div>
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Emergency Contacts ({data.emergency_contacts.length})</CardTitle>
                  </CardHeader>
                  <CardContent className="py-2">
                    {data.emergency_contacts.map((contact, i) => (
                      <div key={i} className="text-sm">
                        {contact.firstName} {contact.lastName} ({contact.relationship}) - {contact.phone}
                      </div>
                    ))}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader className="py-3">
                    <CardTitle className="text-sm">Why Hire You</CardTitle>
                  </CardHeader>
                  <CardContent className="py-2">
                    <p className="text-sm text-muted-foreground italic">
                      "{data.why_hire_you.statement}"
                    </p>
                  </CardContent>
                </Card>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="review" className="flex-1 overflow-hidden">
            <ScrollArea className="h-[500px] rounded-md border p-4">
              <div className="space-y-6">
                <div className="text-center py-4 bg-amber-50 dark:bg-amber-950/30 rounded-lg">
                  <AlertTriangle className="h-8 w-8 mx-auto text-amber-600 mb-2" />
                  <p className="text-sm text-amber-700 dark:text-amber-400">
                    This is a preview of how the Review & Submit step would appear
                  </p>
                </div>

                <section>
                  <h3 className="font-semibold text-lg border-b pb-2 mb-3">Personal Information</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><strong>Full Name:</strong> {data.personal_info.firstName} {data.personal_info.middleName} {data.personal_info.lastName}</div>
                    <div><strong>Date of Birth:</strong> {data.personal_info.dob}</div>
                    <div><strong>Phone:</strong> {data.personal_info.phone}</div>
                    <div><strong>Email:</strong> {data.personal_info.email}</div>
                    <div className="col-span-2"><strong>Address:</strong> {data.personal_info.address}, {data.personal_info.city}, {data.personal_info.state} {data.personal_info.zip}</div>
                  </div>
                </section>

                <section>
                  <h3 className="font-semibold text-lg border-b pb-2 mb-3">License Information</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><strong>License Number:</strong> {data.license_info.licenseNumber}</div>
                    <div><strong>State:</strong> {data.license_info.licenseState}</div>
                    <div><strong>Class:</strong> {data.license_info.licenseClass}</div>
                    <div><strong>Endorsements:</strong> {data.license_info.endorsements.join(", ")}</div>
                    <div><strong>Expiration:</strong> {data.license_info.expirationDate}</div>
                    <div><strong>Years Experience:</strong> {data.license_info.yearsExperience}</div>
                  </div>
                </section>

                <section>
                  <h3 className="font-semibold text-lg border-b pb-2 mb-3">Employment History</h3>
                  {data.employment_history.map((emp, i) => (
                    <div key={i} className="p-3 bg-muted rounded-lg mb-2">
                      <div className="font-medium">{emp.companyName}</div>
                      <div className="text-sm text-muted-foreground">{emp.position}</div>
                      <div className="text-sm">{emp.startDate} - {emp.endDate}</div>
                    </div>
                  ))}
                </section>

                <section>
                  <h3 className="font-semibold text-lg border-b pb-2 mb-3">Documents</h3>
                  <div className="flex gap-2">
                    <Badge variant={data.document_upload.driversLicense ? "default" : "secondary"}>
                      Driver's License {data.document_upload.driversLicense ? "✓" : "✗"}
                    </Badge>
                    <Badge variant={data.document_upload.socialSecurity ? "default" : "secondary"}>
                      Social Security {data.document_upload.socialSecurity ? "✓" : "✗"}
                    </Badge>
                    <Badge variant={data.document_upload.medicalCard ? "default" : "secondary"}>
                      Medical Card {data.document_upload.medicalCard ? "✓" : "✗"}
                    </Badge>
                  </div>
                </section>
              </div>
            </ScrollArea>
          </TabsContent>

          <TabsContent value="pdf" className="flex-1">
            <div className="h-[500px] flex flex-col items-center justify-center border rounded-lg bg-muted/50">
              <FileText className="h-16 w-16 text-muted-foreground mb-4" />
              <h3 className="text-lg font-medium mb-2">Generate Sample PDF</h3>
              <p className="text-sm text-muted-foreground mb-4 text-center max-w-md">
                Click below to generate and download a sample PDF using the fixture data.
                This does NOT send any emails or write to the database.
              </p>
              <Button onClick={handleDownloadSamplePdf} disabled={generatingPdf} className="gap-2">
                {generatingPdf ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Download className="h-4 w-4" />
                )}
                {generatingPdf ? "Generating..." : "Download Sample PDF"}
              </Button>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
