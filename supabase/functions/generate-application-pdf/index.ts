import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import jsPDF from "https://esm.sh/jspdf@2.5.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess } from "../_shared/assertTenantAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface GeneratePDFRequest {
  application_id: string;
}

interface ApplicationData {
  personalInfo: any;
  licenseInfo: any;
  employmentHistory: any[];
  drivingHistory: any;
  documents: any;
  directDeposit: any;
  whyHireYou?: any;
  emergencyContacts?: any[];
}

interface CompanyProfile {
  company_name: string;
  logo_url: string | null;
  address: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  phone: string | null;
  email: string | null;
}

// Professional PDF Generator Class (same as send-application)
class DriverApplicationPDF {
  private doc: any;
  private yPos: number = 20;
  private readonly pageHeight: number;
  private readonly pageWidth: number;
  private readonly margin: number = 20;
  private readonly lineHeight: number = 6;
  private company: CompanyProfile | null;

  constructor(company: CompanyProfile | null) {
    this.doc = new jsPDF();
    this.pageHeight = this.doc.internal.pageSize.height;
    this.pageWidth = this.doc.internal.pageSize.width;
    this.company = company;
  }

  private checkPageBreak(requiredSpace: number = 30): void {
    if (this.yPos + requiredSpace > this.pageHeight - this.margin - 20) {
      this.doc.addPage();
      this.yPos = 30;
      this.addPageHeader();
    }
  }

  private addPageHeader(): void {
    this.doc.setDrawColor(59, 130, 246);
    this.doc.setLineWidth(0.5);
    this.doc.line(this.margin, 15, this.pageWidth - this.margin, 15);
    
    if (this.company?.company_name) {
      this.doc.setFontSize(8);
      this.doc.setTextColor(100, 100, 100);
      this.doc.text(this.company.company_name, this.margin, 12);
    }
    
    const pageNumber = this.doc.internal.getNumberOfPages();
    this.doc.text(`Page ${pageNumber}`, this.pageWidth - this.margin - 15, 12);
  }

  private addLetterhead(): void {
    this.doc.setFontSize(22);
    this.doc.setTextColor(30, 64, 175);
    this.doc.setFont(undefined, 'bold');
    this.doc.text(this.company?.company_name || 'Driver Employment Application', this.margin, this.yPos);
    this.yPos += 10;

    if (this.company?.address) {
      this.doc.setFontSize(10);
      this.doc.setTextColor(100, 100, 100);
      this.doc.setFont(undefined, 'normal');
      const address = [
        this.company.address,
        `${this.company.city || ''}, ${this.company.state || ''} ${this.company.zip || ''}`.trim(),
        this.company.phone ? `Tel: ${this.company.phone}` : '',
        this.company.email ? `Email: ${this.company.email}` : '',
      ].filter(Boolean).join(' | ');
      this.doc.text(address, this.margin, this.yPos);
      this.yPos += 8;
    }

    this.doc.setDrawColor(59, 130, 246);
    this.doc.setLineWidth(2);
    this.doc.line(this.margin, this.yPos, this.pageWidth - this.margin, this.yPos);
    this.yPos += 15;

    this.doc.setFontSize(16);
    this.doc.setTextColor(0, 0, 0);
    this.doc.setFont(undefined, 'bold');
    this.doc.text('DRIVER EMPLOYMENT APPLICATION', this.pageWidth / 2, this.yPos, { align: 'center' });
    this.yPos += 10;

    this.doc.setFontSize(10);
    this.doc.setFont(undefined, 'normal');
    this.doc.setTextColor(100, 100, 100);
    this.doc.text(`Generated: ${new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`, this.pageWidth / 2, this.yPos, { align: 'center' });
    this.yPos += 15;
  }

  private addSectionHeader(title: string): void {
    this.checkPageBreak(20);
    
    this.doc.setFillColor(243, 244, 246);
    this.doc.roundedRect(this.margin, this.yPos - 5, this.pageWidth - 2 * this.margin, 12, 2, 2, 'F');
    
    this.doc.setFontSize(12);
    this.doc.setTextColor(30, 64, 175);
    this.doc.setFont(undefined, 'bold');
    this.doc.text(title.toUpperCase(), this.margin + 5, this.yPos + 3);
    this.yPos += 15;
    
    this.doc.setTextColor(0, 0, 0);
    this.doc.setFont(undefined, 'normal');
  }

  private addFieldRow(label: string, value: string | number | null | undefined, indent: number = 0): void {
    this.checkPageBreak(this.lineHeight + 2);
    
    const displayValue = value?.toString() || '—';
    const xPos = this.margin + indent;
    
    this.doc.setFontSize(9);
    this.doc.setFont(undefined, 'bold');
    this.doc.setTextColor(60, 60, 60);
    this.doc.text(label, xPos, this.yPos);
    
    this.doc.setFont(undefined, 'normal');
    this.doc.setTextColor(0, 0, 0);
    
    const maxWidth = 100;
    const splitValue = this.doc.splitTextToSize(displayValue, maxWidth);
    this.doc.text(splitValue, xPos + 55, this.yPos);
    
    this.yPos += this.lineHeight * Math.max(splitValue.length, 1);
  }

  private addSubsectionHeader(title: string): void {
    this.checkPageBreak(15);
    this.doc.setFontSize(10);
    this.doc.setFont(undefined, 'bold');
    this.doc.setTextColor(59, 130, 246);
    this.doc.text(title, this.margin + 5, this.yPos);
    this.yPos += 8;
    this.doc.setTextColor(0, 0, 0);
  }

  private addCheckbox(label: string, checked: boolean): void {
    this.checkPageBreak(this.lineHeight + 2);
    
    this.doc.setDrawColor(100, 100, 100);
    this.doc.setLineWidth(0.3);
    this.doc.rect(this.margin, this.yPos - 4, 4, 4);
    
    if (checked) {
      this.doc.setFillColor(34, 197, 94);
      this.doc.rect(this.margin + 0.5, this.yPos - 3.5, 3, 3, 'F');
    }
    
    this.doc.setFontSize(9);
    this.doc.setFont(undefined, 'normal');
    this.doc.text(label, this.margin + 7, this.yPos);
    this.yPos += this.lineHeight;
  }

  public generate(applicationData: ApplicationData): Uint8Array {
    this.addLetterhead();

    // Personal Information
    this.addSectionHeader('Personal Information');
    const pi = applicationData.personalInfo || {};
    this.addFieldRow('Full Name:', `${pi.firstName || ''} ${pi.middleName || ''} ${pi.lastName || ''}`.replace(/\s+/g, ' ').trim());
    this.addFieldRow('Date of Birth:', pi.dob);
    this.addFieldRow('SSN:', pi.ssn ? `XXX-XX-${pi.ssn.slice(-4)}` : null);
    this.addFieldRow('Phone:', pi.phone);
    this.addFieldRow('Email:', pi.email);
    this.addFieldRow('Address:', `${pi.address || ''}, ${pi.city || ''}, ${pi.state || ''} ${pi.zip || ''}`);
    this.yPos += 10;

    // License Information
    this.addSectionHeader('CDL & License Information');
    const li = applicationData.licenseInfo || {};
    this.addFieldRow('License Number:', li.licenseNumber);
    this.addFieldRow('State:', li.licenseState);
    this.addFieldRow('Class:', li.licenseClass);
    this.addFieldRow('Endorsements:', Array.isArray(li.endorsements) ? li.endorsements.join(', ') : li.endorsements);
    this.addFieldRow('Expiration:', li.expirationDate);
    this.yPos += 10;

    // Employment History
    this.doc.addPage();
    this.yPos = 30;
    this.addPageHeader();
    this.addSectionHeader('Employment History');
    
    if (applicationData.employmentHistory && applicationData.employmentHistory.length > 0) {
      applicationData.employmentHistory.forEach((emp: any, index: number) => {
        this.checkPageBreak(50);
        this.addSubsectionHeader(`Employer ${index + 1}: ${emp.companyName || 'N/A'}`);
        this.addFieldRow('Position:', emp.position, 5);
        this.addFieldRow('Period:', `${emp.startDate || '?'} to ${emp.endDate || 'Present'}`, 5);
        this.addFieldRow('Reason for Leaving:', emp.reasonForLeaving, 5);
        this.yPos += 5;
      });
    } else {
      this.doc.setFontSize(9);
      this.doc.text('No employment history provided', this.margin + 5, this.yPos);
      this.yPos += 10;
    }

    // Driving History
    this.addSectionHeader('Driving History');
    const dh = applicationData.drivingHistory || {};
    
    if (dh.accidents && dh.accidents.length > 0) {
      this.addSubsectionHeader('Accidents');
      dh.accidents.forEach((acc: any, index: number) => {
        this.addFieldRow(`Accident ${index + 1}:`, `${acc.date} - ${acc.description}`, 5);
      });
    } else {
      this.addCheckbox('No accidents to report', true);
    }
    
    if (dh.violations && dh.violations.length > 0) {
      this.addSubsectionHeader('Violations');
      dh.violations.forEach((vio: any, index: number) => {
        this.addFieldRow(`Violation ${index + 1}:`, `${vio.date} - ${vio.violation}`, 5);
      });
    } else {
      this.addCheckbox('No violations to report', true);
    }
    this.yPos += 10;

    // Emergency Contacts
    this.addSectionHeader('Emergency Contacts');
    if (applicationData.emergencyContacts && applicationData.emergencyContacts.length > 0) {
      applicationData.emergencyContacts.forEach((contact: any, index: number) => {
        if (contact.firstName) {
          this.addFieldRow(`Contact ${index + 1}:`, `${contact.firstName} ${contact.lastName} - ${contact.phone}`, 5);
        }
      });
    }
    this.yPos += 10;

    // Direct Deposit
    this.addSectionHeader('Direct Deposit');
    const dd = applicationData.directDeposit || {};
    this.addFieldRow('Bank Name:', dd.bankName);
    this.addFieldRow('Account Type:', dd.accountType);
    this.yPos += 10;

    // Documents
    this.addSectionHeader('Documents');
    const docs = applicationData.documents || {};
    this.addCheckbox("Driver's License", !!docs.driversLicense);
    this.addCheckbox('Social Security Card', !!docs.socialSecurity);
    this.addCheckbox('Medical Card', !!docs.medicalCard);

    // Footer
    this.yPos = this.pageHeight - 25;
    this.doc.setDrawColor(200, 200, 200);
    this.doc.setLineWidth(0.3);
    this.doc.line(this.margin, this.yPos, this.pageWidth - this.margin, this.yPos);
    this.yPos += 5;
    this.doc.setFontSize(8);
    this.doc.setTextColor(150, 150, 150);
    this.doc.text('This document is confidential.', this.pageWidth / 2, this.yPos, { align: 'center' });

    return this.doc.output('arraybuffer');
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { application_id }: GeneratePDFRequest = await req.json();

    if (!application_id) {
      return new Response(
        JSON.stringify({ error: "application_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
    const supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey);

    // Load application from DB
    const { data: application, error: appError } = await supabaseService
      .from('applications')
      .select(`
        id,
        tenant_id,
        personal_info,
        license_info,
        employment_history,
        driving_history,
        emergency_contacts,
        document_upload,
        direct_deposit,
        why_hire_you
      `)
      .eq('id', application_id)
      .maybeSingle();

    if (appError) {
      console.error("Error loading application:", appError);
      return new Response(
        JSON.stringify({ error: "Failed to load application" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!application) {
      return new Response(
        JSON.stringify({ error: "Application not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify tenant access (authenticated user must have access to this tenant)
    const authHeader = req.headers.get("Authorization");
    const accessResult = await assertTenantAccess(authHeader, application.tenant_id);
    
    if (!accessResult.allowed) {
      console.error("Tenant access denied:", accessResult.reason);
      return accessResult.response || new Response(
        JSON.stringify({ error: "Access denied to this application" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch company profile
    const { data: profile } = await supabaseService
      .from('company_profile')
      .select('company_name, logo_url, address, city, state, zip, phone, email')
      .eq('tenant_id', application.tenant_id)
      .maybeSingle();

    // Build application data
    const employmentArray = Array.isArray(application.employment_history) 
      ? application.employment_history 
      : (application.employment_history as any)?.employers || [];

    const applicationData: ApplicationData = {
      personalInfo: application.personal_info || {},
      licenseInfo: application.license_info || {},
      employmentHistory: employmentArray,
      drivingHistory: application.driving_history || {},
      documents: application.document_upload || {},
      directDeposit: application.direct_deposit || {},
      whyHireYou: application.why_hire_you,
      emergencyContacts: Array.isArray(application.emergency_contacts) 
        ? application.emergency_contacts 
        : (application.emergency_contacts as any)?.contacts || [],
    };

    // Generate PDF
    const pdfGenerator = new DriverApplicationPDF(profile);
    const pdfBuffer = pdfGenerator.generate(applicationData);
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

    const applicantName = `${applicationData.personalInfo?.firstName || 'Unknown'}_${applicationData.personalInfo?.lastName || 'Applicant'}`;
    const filename = `Driver_Application_${applicantName}_${new Date().toISOString().split('T')[0]}.pdf`;

    console.log(`Generated PDF for application ${application_id} (download-only, no email)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        pdf_base64: pdfBase64,
        filename,
        content_type: 'application/pdf'
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in generate-application-pdf:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
