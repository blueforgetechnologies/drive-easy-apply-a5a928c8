import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import jsPDF from "https://esm.sh/jspdf@2.5.1";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApplicationData {
  personalInfo: any;
  licenseInfo: any;
  employmentHistory: any[];
  drivingHistory: any;
  documents: any;
  directDeposit: any;
  whyHireYou?: any;
  emergencyContacts?: any[];
  tenantId?: string;
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

// Professional PDF Generator Class
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
    // Subtle header line
    this.doc.setDrawColor(59, 130, 246);
    this.doc.setLineWidth(0.5);
    this.doc.line(this.margin, 15, this.pageWidth - this.margin, 15);
    
    // Company name in header
    if (this.company?.company_name) {
      this.doc.setFontSize(8);
      this.doc.setTextColor(100, 100, 100);
      this.doc.text(this.company.company_name, this.margin, 12);
    }
    
    // Page number
    const pageNumber = this.doc.internal.getNumberOfPages();
    this.doc.text(`Page ${pageNumber}`, this.pageWidth - this.margin - 15, 12);
  }

  private addLetterhead(): void {
    // Company name (large)
    this.doc.setFontSize(22);
    this.doc.setTextColor(30, 64, 175);
    this.doc.setFont(undefined, 'bold');
    this.doc.text(this.company?.company_name || 'Driver Employment Application', this.margin, this.yPos);
    this.yPos += 10;

    // Company address
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

    // Divider line
    this.doc.setDrawColor(59, 130, 246);
    this.doc.setLineWidth(2);
    this.doc.line(this.margin, this.yPos, this.pageWidth - this.margin, this.yPos);
    this.yPos += 15;

    // Document title
    this.doc.setFontSize(16);
    this.doc.setTextColor(0, 0, 0);
    this.doc.setFont(undefined, 'bold');
    this.doc.text('DRIVER EMPLOYMENT APPLICATION', this.pageWidth / 2, this.yPos, { align: 'center' });
    this.yPos += 10;

    // Submission date
    this.doc.setFontSize(10);
    this.doc.setFont(undefined, 'normal');
    this.doc.setTextColor(100, 100, 100);
    this.doc.text(`Submitted: ${new Date().toLocaleDateString('en-US', { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    })}`, this.pageWidth / 2, this.yPos, { align: 'center' });
    this.yPos += 15;
  }

  private addSectionHeader(title: string, icon?: string): void {
    this.checkPageBreak(20);
    
    // Section background
    this.doc.setFillColor(243, 244, 246);
    this.doc.roundedRect(this.margin, this.yPos - 5, this.pageWidth - 2 * this.margin, 12, 2, 2, 'F');
    
    // Section title
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
    
    // Wrap long values
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
    
    // Draw checkbox
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

  private addSignatureBlock(name: string, signature: string, date: string): void {
    this.checkPageBreak(30);
    
    this.doc.setDrawColor(200, 200, 200);
    this.doc.setLineWidth(0.3);
    
    // Signature line
    this.doc.line(this.margin, this.yPos + 15, this.margin + 80, this.yPos + 15);
    this.doc.setFontSize(8);
    this.doc.text('Signature', this.margin, this.yPos + 20);
    
    // Printed name
    if (signature) {
      this.doc.setFontSize(14);
      this.doc.setFont(undefined, 'italic');
      this.doc.text(signature, this.margin + 5, this.yPos + 12);
      this.doc.setFont(undefined, 'normal');
    }
    
    // Date line
    this.doc.line(this.margin + 100, this.yPos + 15, this.margin + 150, this.yPos + 15);
    this.doc.setFontSize(8);
    this.doc.text('Date', this.margin + 100, this.yPos + 20);
    if (date) {
      this.doc.setFontSize(10);
      this.doc.text(date, this.margin + 105, this.yPos + 12);
    }
    
    this.yPos += 30;
  }

  public generate(applicationData: ApplicationData): Uint8Array {
    // Letterhead
    this.addLetterhead();

    // SECTION 1: Personal Information
    this.addSectionHeader('Personal Information');
    const pi = applicationData.personalInfo || {};
    this.addFieldRow('Full Name:', `${pi.firstName || ''} ${pi.middleName || ''} ${pi.lastName || ''}`.replace(/\s+/g, ' ').trim());
    this.addFieldRow('Date of Birth:', pi.dob);
    this.addFieldRow('SSN:', pi.ssn ? `XXX-XX-${pi.ssn.slice(-4)}` : null);
    this.addFieldRow('Phone:', pi.phone);
    this.addFieldRow('Email:', pi.email);
    this.addFieldRow('Address:', `${pi.address || ''}, ${pi.city || ''}, ${pi.state || ''} ${pi.zip || ''}`);
    this.addFieldRow('Work Authorization:', pi.legallyAuthorized === 'yes' ? 'Yes - Authorized' : pi.legallyAuthorized === 'no' ? 'No' : null);
    this.addFieldRow('Felony Conviction:', pi.felonyConviction === 'yes' ? 'Yes' : pi.felonyConviction === 'no' ? 'No' : null);
    if (pi.felonyDetails) {
      this.addFieldRow('Details:', pi.felonyDetails);
    }
    this.yPos += 10;

    // SECTION 2: License Information
    this.addSectionHeader('CDL & License Information');
    const li = applicationData.licenseInfo || {};
    this.addFieldRow('License Number:', li.licenseNumber);
    this.addFieldRow('State:', li.licenseState);
    this.addFieldRow('Class:', li.licenseClass);
    this.addFieldRow('Endorsements:', Array.isArray(li.endorsements) ? li.endorsements.join(', ') : li.endorsements);
    this.addFieldRow('Expiration:', li.expirationDate);
    this.addFieldRow('Years Experience:', li.yearsExperience);
    this.addFieldRow('License Denied:', li.deniedLicense === 'yes' ? 'Yes' : li.deniedLicense === 'no' ? 'No' : null);
    this.addFieldRow('Suspended/Revoked:', li.suspendedRevoked === 'yes' ? 'Yes' : li.suspendedRevoked === 'no' ? 'No' : null);
    if (li.deniedDetails) {
      this.addFieldRow('Details:', li.deniedDetails);
    }
    this.yPos += 10;

    // SECTION 3: Employment History (new page for clarity)
    this.doc.addPage();
    this.yPos = 30;
    this.addPageHeader();
    this.addSectionHeader('Employment History (Last 3 Years)');
    
    if (applicationData.employmentHistory && applicationData.employmentHistory.length > 0) {
      applicationData.employmentHistory.forEach((emp: any, index: number) => {
        this.checkPageBreak(50);
        this.addSubsectionHeader(`Employer ${index + 1}: ${emp.companyName || 'N/A'}`);
        this.addFieldRow('Position:', emp.position, 5);
        this.addFieldRow('Address:', emp.address, 5);
        this.addFieldRow('Phone:', emp.phone, 5);
        this.addFieldRow('Supervisor:', emp.supervisor, 5);
        this.addFieldRow('Period:', `${emp.startDate || '?'} to ${emp.endDate || 'Present'}`, 5);
        this.addFieldRow('Reason for Leaving:', emp.reasonForLeaving, 5);
        this.yPos += 5;
      });
    } else {
      this.doc.setFontSize(9);
      this.doc.setTextColor(100, 100, 100);
      this.doc.text('No employment history provided', this.margin + 5, this.yPos);
      this.yPos += 10;
    }

    // SECTION 4: Driving History
    this.addSectionHeader('Driving History & Safety Record');
    const dh = applicationData.drivingHistory || {};
    
    this.addSubsectionHeader('Accidents (Last 3 Years)');
    if (dh.accidents && dh.accidents.length > 0) {
      dh.accidents.forEach((acc: any, index: number) => {
        this.checkPageBreak(25);
        this.addFieldRow(`Accident ${index + 1}:`, acc.date, 5);
        this.addFieldRow('Location:', acc.location, 5);
        this.addFieldRow('Description:', acc.description, 5);
        this.addFieldRow('Fatalities/Injuries:', `${acc.fatalities || 0} / ${acc.injuries || 0}`, 5);
        this.yPos += 3;
      });
    } else {
      this.addCheckbox('No accidents to report', true);
    }
    
    this.addSubsectionHeader('Traffic Violations (Last 3 Years)');
    if (dh.violations && dh.violations.length > 0) {
      dh.violations.forEach((vio: any, index: number) => {
        this.checkPageBreak(20);
        this.addFieldRow(`Violation ${index + 1}:`, vio.violation, 5);
        this.addFieldRow('Date/Location:', `${vio.date || '?'} - ${vio.location || 'N/A'}`, 5);
        this.addFieldRow('Penalty:', vio.penalty, 5);
        this.yPos += 3;
      });
    } else {
      this.addCheckbox('No violations to report', true);
    }
    this.yPos += 10;

    // SECTION 5: Emergency Contacts
    this.addSectionHeader('Emergency Contacts');
    if (applicationData.emergencyContacts && applicationData.emergencyContacts.length > 0) {
      applicationData.emergencyContacts.forEach((contact: any, index: number) => {
        if (contact.firstName) {
          this.checkPageBreak(25);
          this.addSubsectionHeader(`Contact ${index + 1}`);
          this.addFieldRow('Name:', `${contact.firstName || ''} ${contact.lastName || ''}`, 5);
          this.addFieldRow('Relationship:', contact.relationship, 5);
          this.addFieldRow('Phone:', contact.phone, 5);
          if (contact.address) {
            this.addFieldRow('Address:', contact.address, 5);
          }
        }
      });
    } else {
      this.doc.setFontSize(9);
      this.doc.text('No emergency contacts provided', this.margin + 5, this.yPos);
      this.yPos += 10;
    }

    // SECTION 6: Direct Deposit (new page)
    this.doc.addPage();
    this.yPos = 30;
    this.addPageHeader();
    this.addSectionHeader('Direct Deposit Information');
    const dd = applicationData.directDeposit || {};
    this.addFieldRow('Account Holder:', `${dd.firstName || ''} ${dd.lastName || ''}`.trim());
    if (dd.businessName) {
      this.addFieldRow('Business Name:', dd.businessName);
    }
    this.addFieldRow('Email:', dd.email);
    this.addFieldRow('Bank Name:', dd.bankName);
    this.addFieldRow('Routing Number:', dd.routingNumber ? `****${dd.routingNumber.slice(-4)}` : null);
    this.addFieldRow('Account Number:', (dd.checkingNumber || dd.accountNumber) ? `****${(dd.checkingNumber || dd.accountNumber).slice(-4)}` : null);
    this.addFieldRow('Account Type:', dd.accountType?.replace(/_/g, ' '));
    if (dd.cashAppCashtag) {
      this.addFieldRow('Cash App:', dd.cashAppCashtag);
    }
    this.yPos += 10;

    // SECTION 7: Documents
    this.addSectionHeader('Uploaded Documents');
    const docs = applicationData.documents || {};
    this.addCheckbox("Driver's License", !!docs.driversLicense);
    this.addCheckbox('Social Security Card', !!docs.socialSecurity);
    this.addCheckbox('Medical Card', !!docs.medicalCard);
    if (docs.other && Array.isArray(docs.other) && docs.other.length > 0) {
      this.addCheckbox(`Other Documents (${docs.other.length} files)`, true);
    }
    this.yPos += 10;

    // SECTION 8: Statement
    if (applicationData.whyHireYou?.statement) {
      this.addSectionHeader('Applicant Statement');
      this.doc.setFontSize(9);
      this.doc.setFont(undefined, 'italic');
      const statement = this.doc.splitTextToSize(applicationData.whyHireYou.statement, this.pageWidth - 2 * this.margin - 10);
      statement.forEach((line: string) => {
        this.checkPageBreak(this.lineHeight);
        this.doc.text(line, this.margin + 5, this.yPos);
        this.yPos += this.lineHeight;
      });
      this.doc.setFont(undefined, 'normal');
    }

    // SECTION 9: Attestation (new page)
    this.doc.addPage();
    this.yPos = 30;
    this.addPageHeader();
    this.addSectionHeader('Applicant Attestation');
    
    this.doc.setFontSize(9);
    this.doc.setTextColor(60, 60, 60);
    const attestationText = `I certify that the information provided in this application is true and complete to the best of my knowledge. I understand that any false information or omission may disqualify me from further consideration for employment and may result in my dismissal if discovered at a later date. I authorize the investigation of all statements contained in this application as may be necessary in arriving at an employment decision.`;
    const attestLines = this.doc.splitTextToSize(attestationText, this.pageWidth - 2 * this.margin - 10);
    attestLines.forEach((line: string) => {
      this.doc.text(line, this.margin + 5, this.yPos);
      this.yPos += this.lineHeight;
    });
    this.yPos += 15;

    // Signature
    const applicantName = `${applicationData.personalInfo?.firstName || ''} ${applicationData.personalInfo?.lastName || ''}`.trim();
    this.addSignatureBlock(
      applicantName,
      applicantName,
      new Date().toLocaleDateString()
    );

    // Footer
    this.yPos = this.pageHeight - 25;
    this.doc.setDrawColor(200, 200, 200);
    this.doc.setLineWidth(0.3);
    this.doc.line(this.margin, this.yPos, this.pageWidth - this.margin, this.yPos);
    this.yPos += 5;
    this.doc.setFontSize(8);
    this.doc.setTextColor(150, 150, 150);
    this.doc.text('This document is confidential and intended for authorized personnel only.', this.pageWidth / 2, this.yPos, { align: 'center' });
    this.yPos += 4;
    this.doc.text(`Generated on ${new Date().toISOString()}`, this.pageWidth / 2, this.yPos, { align: 'center' });

    return this.doc.output('arraybuffer');
  }
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const applicationData: ApplicationData = await req.json();
    
    console.log("Received application data for PDF generation");

    // Fetch company profile for branding
    let companyProfile: CompanyProfile | null = null;
    let driverTrainerEmails: string[] = [];
    
    if (applicationData.tenantId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey);

      const { data: profile } = await supabaseService
        .from('company_profile')
        .select('company_name, logo_url, address, city, state, zip, phone, email')
        .eq('tenant_id', applicationData.tenantId)
        .maybeSingle();

      if (profile) {
        companyProfile = profile;
      }

      // Get Driver Trainer emails
      const { data: driverTrainers } = await supabaseService
        .from('user_custom_roles')
        .select(`
          user_id,
          custom_roles!inner (name),
          profiles!inner (email)
        `)
        .eq('tenant_id', applicationData.tenantId)
        .ilike('custom_roles.name', '%driver trainer%');

      if (driverTrainers && driverTrainers.length > 0) {
        driverTrainerEmails = driverTrainers
          .map((t: any) => t.profiles?.email)
          .filter((email: string | null) => email);
        console.log("Found Driver Trainer emails:", driverTrainerEmails);
      }
    }

    // Generate professional PDF
    const pdfGenerator = new DriverApplicationPDF(companyProfile);
    const pdfBuffer = pdfGenerator.generate(applicationData);
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

    const applicantName = `${applicationData.personalInfo?.firstName || 'Unknown'}_${applicationData.personalInfo?.lastName || 'Applicant'}`;
    const applicantFullName = `${applicationData.personalInfo?.firstName || ''} ${applicationData.personalInfo?.lastName || ''}`.trim();
    const applicantEmail = applicationData.personalInfo?.email;
    const filename = `Driver_Application_${applicantName}_${new Date().toISOString().split('T')[0]}.pdf`;
    const companyName = companyProfile?.company_name || 'Our Company';

    // Send confirmation email to the driver/applicant
    if (applicantEmail) {
      try {
        await resend.emails.send({
          from: "Driver Application <noreply@blueforgetechnologies.org>",
          to: [applicantEmail],
          subject: "Application Submitted Successfully",
          html: `
            <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #f8fafc;">
              <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
                <div style="text-align: center; margin-bottom: 30px;">
                  <div style="width: 60px; height: 60px; background: linear-gradient(135deg, #3b82f6, #1e40af); border-radius: 50%; margin: 0 auto 15px; display: flex; align-items: center; justify-content: center;">
                    <span style="color: white; font-size: 28px;">✓</span>
                  </div>
                  <h1 style="color: #1e40af; margin: 0; font-size: 24px;">Application Received!</h1>
                </div>
                
                <p style="color: #334155; font-size: 16px; line-height: 1.6;">Dear ${applicantFullName},</p>
                
                <p style="color: #334155; font-size: 16px; line-height: 1.6;">
                  Thank you for submitting your driver employment application to <strong>${companyName}</strong>. We have received your application and it is now under review.
                </p>
                
                <div style="background-color: #f1f5f9; border-radius: 8px; padding: 20px; margin: 25px 0;">
                  <h3 style="color: #1e40af; margin: 0 0 15px 0; font-size: 16px;">What Happens Next?</h3>
                  <ul style="color: #475569; margin: 0; padding-left: 20px; line-height: 1.8;">
                    <li>Our team will review your application within 2-3 business days</li>
                    <li>We may contact you for additional information or documents</li>
                    <li>Qualified candidates will be invited for an interview</li>
                  </ul>
                </div>
                
                <p style="color: #334155; font-size: 16px; line-height: 1.6;">
                  If you have any questions about your application status, please don't hesitate to contact us.
                </p>
                
                <p style="color: #334155; font-size: 16px; line-height: 1.6; margin-bottom: 0;">
                  Best regards,<br>
                  <strong>The ${companyName} Team</strong>
                </p>
              </div>
              
              <p style="color: #94a3b8; font-size: 12px; text-align: center; margin-top: 20px;">
                This is an automated message. Please do not reply directly to this email.
              </p>
            </div>
          `,
        });
        console.log("Confirmation email sent to applicant:", applicantEmail);
      } catch (emailErr) {
        console.error("Error sending confirmation to applicant:", emailErr);
      }
    }

    // Send PDF to Driver Trainers
    const trainerRecipients = driverTrainerEmails && driverTrainerEmails.length > 0 
      ? driverTrainerEmails 
      : ["ben@nexustechsolution.com"];

    const emailResponse = await resend.emails.send({
      from: "Driver Application <noreply@blueforgetechnologies.org>",
      to: trainerRecipients,
      subject: `📋 New Driver Application - ${applicantFullName}`,
      html: `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 40px 20px; background-color: #f8fafc;">
          <div style="background-color: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0,0,0,0.05);">
            <h1 style="color: #1e40af; margin: 0 0 20px 0; font-size: 22px; border-bottom: 2px solid #e2e8f0; padding-bottom: 15px;">
              New Driver Application Received
            </h1>
            
            <table style="width: 100%; border-collapse: collapse;">
              <tr>
                <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Applicant Name:</td>
                <td style="padding: 10px 0; color: #1e293b; font-size: 14px; font-weight: 600;">${applicantFullName}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Email:</td>
                <td style="padding: 10px 0; color: #1e293b; font-size: 14px;">${applicantEmail || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Phone:</td>
                <td style="padding: 10px 0; color: #1e293b; font-size: 14px;">${applicationData.personalInfo?.phone || 'N/A'}</td>
              </tr>
              <tr>
                <td style="padding: 10px 0; color: #64748b; font-size: 14px;">Submitted:</td>
                <td style="padding: 10px 0; color: #1e293b; font-size: 14px;">${new Date().toLocaleString()}</td>
              </tr>
            </table>
            
            <div style="background-color: #eff6ff; border-left: 4px solid #3b82f6; padding: 15px; margin: 25px 0; border-radius: 0 8px 8px 0;">
              <p style="margin: 0; color: #1e40af; font-size: 14px;">
                📎 The complete application is attached as a PDF for your review.
              </p>
            </div>
            
            <p style="color: #64748b; font-size: 13px; margin-bottom: 0;">
              Log in to the dashboard to review the full application and update the driver status.
            </p>
          </div>
        </div>
      `,
      attachments: [
        {
          filename: filename,
          content: pdfBase64,
        },
      ],
    });

    console.log("Email sent to Driver Trainers:", emailResponse);

    return new Response(JSON.stringify({ success: true, data: emailResponse }), {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        ...corsHeaders,
      },
    });
  } catch (error: any) {
    console.error("Error in send-application function:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);
