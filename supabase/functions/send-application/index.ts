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

const generatePDF = (applicationData: ApplicationData): Uint8Array => {
  const doc = new jsPDF();
  let yPos = 20;
  const lineHeight = 7;
  const pageHeight = doc.internal.pageSize.height;
  const margin = 20;

  const checkPageBreak = (requiredSpace = 20) => {
    if (yPos + requiredSpace > pageHeight - margin) {
      doc.addPage();
      yPos = 20;
    }
  };

  const addTitle = (title: string) => {
    checkPageBreak(15);
    doc.setFontSize(16);
    doc.setTextColor(37, 99, 235);
    doc.text(title, margin, yPos);
    yPos += 3;
    doc.setDrawColor(37, 99, 235);
    doc.setLineWidth(0.5);
    doc.line(margin, yPos, 190, yPos);
    yPos += 10;
    doc.setTextColor(0, 0, 0);
  };

  const addSection = (title: string) => {
    checkPageBreak(12);
    doc.setFontSize(12);
    doc.setTextColor(30, 64, 175);
    doc.text(title, margin, yPos);
    yPos += lineHeight;
    doc.setTextColor(0, 0, 0);
    doc.setFontSize(10);
  };

  const addField = (label: string, value: string) => {
    checkPageBreak(lineHeight + 2);
    doc.setFont(undefined, 'bold');
    doc.text(label, margin, yPos);
    doc.setFont(undefined, 'normal');
    const splitValue = doc.splitTextToSize(value || 'N/A', 120);
    doc.text(splitValue, margin + 60, yPos);
    yPos += lineHeight * splitValue.length;
  };

  const addParagraph = (text: string, fontSize: number = 10) => {
    doc.setFontSize(fontSize);
    const splitText = doc.splitTextToSize(text, 170);
    splitText.forEach((line: string) => {
      checkPageBreak(lineHeight);
      doc.text(line, margin, yPos);
      yPos += lineHeight;
    });
  };

  // Title Page
  addTitle("DRIVER EMPLOYMENT APPLICATION");
  doc.setFontSize(10);
  doc.text(`Submitted: ${new Date().toLocaleString()}`, margin, yPos);
  yPos += 15;

  // Personal Information
  addSection("PERSONAL INFORMATION");
  addField("Full Name:", `${applicationData.personalInfo?.firstName || ''} ${applicationData.personalInfo?.middleName || ''} ${applicationData.personalInfo?.lastName || ''}`);
  addField("Date of Birth:", applicationData.personalInfo?.dob || '');
  addField("Social Security Number:", applicationData.personalInfo?.ssn || '');
  addField("Phone:", applicationData.personalInfo?.phone || '');
  addField("Email:", applicationData.personalInfo?.email || '');
  addField("Address:", `${applicationData.personalInfo?.address || ''}, ${applicationData.personalInfo?.city || ''}, ${applicationData.personalInfo?.state || ''} ${applicationData.personalInfo?.zip || ''}`);
  addField("Legally Authorized to Work:", applicationData.personalInfo?.legallyAuthorized || '');
  addField("Felony Conviction:", applicationData.personalInfo?.felonyConviction || '');
  if (applicationData.personalInfo?.felonyDetails) {
    addField("Felony Details:", applicationData.personalInfo.felonyDetails);
  }
  yPos += 5;

  // Emergency Contacts
  if (applicationData.emergencyContacts && applicationData.emergencyContacts.length > 0) {
    addSection("EMERGENCY CONTACTS");
    applicationData.emergencyContacts.forEach((contact: any, index: number) => {
      if (contact.firstName) {
        checkPageBreak(30);
        doc.setFont(undefined, 'bold');
        doc.text(`Emergency Contact ${index + 1}:`, margin, yPos);
        doc.setFont(undefined, 'normal');
        yPos += lineHeight;
        addField("  Name:", `${contact.firstName || ''} ${contact.lastName || ''}`);
        addField("  Relationship:", contact.relationship || '');
        addField("  Phone:", contact.phone || '');
        addField("  Address:", contact.address || '');
        yPos += 3;
      }
    });
  }
  yPos += 5;

  // License Information
  addSection("LICENSE INFORMATION");
  addField("License Number:", applicationData.licenseInfo?.licenseNumber || '');
  addField("State:", applicationData.licenseInfo?.licenseState || '');
  addField("Class:", applicationData.licenseInfo?.licenseClass || '');
  addField("Years of Experience:", applicationData.licenseInfo?.yearsExperience || '');
  addField("Endorsements:", applicationData.licenseInfo?.endorsements?.join(', ') || 'None');
  addField("Expiration Date:", applicationData.licenseInfo?.expirationDate || '');
  addField("License Ever Denied:", applicationData.licenseInfo?.deniedLicense || '');
  addField("License Suspended/Revoked:", applicationData.licenseInfo?.suspendedRevoked || '');
  if (applicationData.licenseInfo?.deniedDetails) {
    addField("Details:", applicationData.licenseInfo.deniedDetails);
  }
  yPos += 5;

  // Employment History
  checkPageBreak(30);
  addSection("EMPLOYMENT HISTORY");
  if (applicationData.employmentHistory && applicationData.employmentHistory.length > 0) {
    applicationData.employmentHistory.forEach((emp: any, index: number) => {
      checkPageBreak(50);
      doc.setFont(undefined, 'bold');
      doc.text(`Employer ${index + 1}:`, margin, yPos);
      doc.setFont(undefined, 'normal');
      yPos += lineHeight;
      addField("  Company:", emp.companyName || '');
      addField("  Position:", emp.position || '');
      addField("  Address:", emp.address || '');
      addField("  Phone:", emp.phone || '');
      addField("  Supervisor:", emp.supervisor || '');
      addField("  Start Date:", emp.startDate || '');
      addField("  End Date:", emp.endDate || '');
      addField("  Reason for Leaving:", emp.reasonForLeaving || '');
      yPos += 3;
    });
  } else {
    doc.text("No employment history provided", margin, yPos);
    yPos += lineHeight;
  }
  yPos += 5;

  // Driving History
  checkPageBreak(20);
  addSection("DRIVING HISTORY");
  addField("Accidents Reported:", `${applicationData.drivingHistory?.accidents?.length || 0}`);
  addField("Violations Reported:", `${applicationData.drivingHistory?.violations?.length || 0}`);
  yPos += 5;

  // Direct Deposit
  checkPageBreak(40);
  addSection("DIRECT DEPOSIT INFORMATION");
  addField("Name:", `${applicationData.directDeposit?.firstName || ''} ${applicationData.directDeposit?.lastName || ''}`);
  addField("Business Name:", applicationData.directDeposit?.businessName || 'N/A');
  addField("Email:", applicationData.directDeposit?.email || '');
  addField("Bank Name:", applicationData.directDeposit?.bankName || '');
  addField("Routing Number:", applicationData.directDeposit?.routingNumber || '');
  addField("Account Number:", applicationData.directDeposit?.checkingNumber || '');
  addField("Account Type:", applicationData.directDeposit?.accountType?.replace('-', ' ') || '');
  addField("CashApp Cashtag:", applicationData.directDeposit?.cashAppCashtag || 'N/A');
  yPos += 5;

  // Why Should We Hire You
  if (applicationData.whyHireYou?.statement) {
    doc.addPage();
    yPos = 20;
    addTitle("WHY SHOULD WE HIRE YOU?");
    yPos += 5;
    addParagraph(applicationData.whyHireYou.statement);
  }

  return doc.output('arraybuffer');
};

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const applicationData: ApplicationData = await req.json();
    
    console.log("Received application data:", applicationData);

    // Generate PDF
    const pdfBuffer = generatePDF(applicationData);
    const pdfBase64 = btoa(String.fromCharCode(...new Uint8Array(pdfBuffer)));

    const applicantName = `${applicationData.personalInfo?.firstName || 'Unknown'}_${applicationData.personalInfo?.lastName || 'Applicant'}`;
    const applicantFullName = `${applicationData.personalInfo?.firstName || ''} ${applicationData.personalInfo?.lastName || ''}`.trim();
    const applicantEmail = applicationData.personalInfo?.email;
    const filename = `Driver_Application_${applicantName}_${new Date().toISOString().split('T')[0]}.pdf`;

    // Get Driver Trainer emails from the tenant
    let driverTrainerEmails: string[] = [];
    
    if (applicationData.tenantId) {
      const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
      const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
      const supabaseService = createClient(supabaseUrl, supabaseServiceRoleKey);

      // Get users with "Driver Trainer" role in this tenant
      const { data: driverTrainers, error: trainerError } = await supabaseService
        .from('user_custom_roles')
        .select(`
          user_id,
          custom_roles!inner (name),
          profiles!inner (email)
        `)
        .eq('tenant_id', applicationData.tenantId)
        .ilike('custom_roles.name', '%driver trainer%');

      if (trainerError) {
        console.error("Error fetching driver trainers:", trainerError);
      } else if (driverTrainers && driverTrainers.length > 0) {
        driverTrainerEmails = driverTrainers
          .map((t: any) => t.profiles?.email)
          .filter((email: string | null) => email);
        console.log("Found Driver Trainer emails:", driverTrainerEmails);
      }
    }

    // Send confirmation email to the driver/applicant
    if (applicantEmail) {
      try {
        await resend.emails.send({
          from: "Driver Application <noreply@blueforgetechnologies.org>",
          to: [applicantEmail],
          subject: "Application Submitted Successfully",
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h1 style="color: #2563eb;">Application Received!</h1>
              <p>Dear ${applicantFullName},</p>
              <p>Thank you for submitting your driver employment application. We have received your application and it is now under review.</p>
              <p><strong>What happens next?</strong></p>
              <ul>
                <li>Our team will review your application within the next few business days.</li>
                <li>You will be contacted if we need any additional information.</li>
                <li>If your application is approved, you will receive further instructions about the next steps.</li>
              </ul>
              <p>If you have any questions, please don't hesitate to contact us.</p>
              <p>Best regards,<br>The Hiring Team</p>
            </div>
          `,
        });
        console.log("Confirmation email sent to applicant:", applicantEmail);
      } catch (emailErr) {
        console.error("Error sending confirmation to applicant:", emailErr);
      }
    }

    // Send PDF to Driver Trainers
    const trainerRecipients = driverTrainerEmails.length > 0 
      ? driverTrainerEmails 
      : ["ben@nexustechsolution.com"]; // Fallback

    const emailResponse = await resend.emails.send({
      from: "Driver Application <noreply@blueforgetechnologies.org>",
      to: trainerRecipients,
      subject: `New Driver Application - ${applicantFullName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb;">New Driver Application Received</h1>
          <p>A new driver application has been submitted.</p>
          <p><strong>Applicant Name:</strong> ${applicantFullName}</p>
          <p><strong>Email:</strong> ${applicantEmail || 'N/A'}</p>
          <p><strong>Phone:</strong> ${applicationData.personalInfo?.phone || 'N/A'}</p>
          <p><strong>Submitted:</strong> ${new Date().toLocaleString()}</p>
          <p>Please see the attached PDF for the complete application.</p>
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