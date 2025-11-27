import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import jsPDF from "https://esm.sh/jspdf@2.5.1";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ApplicationData {
  personalInfo: any;
  payrollPolicy?: any;
  licenseInfo: any;
  employmentHistory: any[];
  drivingHistory: any;
  documents: any;
  policyAcknowledgment: any;
  directDeposit: any;
  driverDispatchSheet: any;
  noRyderPolicy: any;
  safeDrivingPolicy?: any;
  contractorAgreement: any;
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

  // Emergency Contact
  addSection("EMERGENCY CONTACT");
  addField("Name:", applicationData.personalInfo?.emergencyContactName || '');
  addField("Relationship:", applicationData.personalInfo?.emergencyContactRelationship || '');
  addField("Phone:", applicationData.personalInfo?.emergencyContactPhone || '');
  yPos += 5;

  // Payroll Policy
  if (applicationData.payrollPolicy) {
    checkPageBreak(30);
    addSection("PAYROLL POLICY ACKNOWLEDGMENT");
    addField("Name:", applicationData.payrollPolicy.agreedName || '');
    addField("Signature:", applicationData.payrollPolicy.signature || '');
    addField("Date:", applicationData.payrollPolicy.date || '');
    yPos += 5;
  }

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

  // Policies & Agreements
  checkPageBreak(30);
  addTitle("POLICIES & AGREEMENTS");

  addSection("Drug & Alcohol Policy");
  addField("Policy Acknowledged:", applicationData.policyAcknowledgment?.agreedToPolicy ? 'Yes' : 'No');
  addField("Signature:", applicationData.policyAcknowledgment?.signature || '');
  addField("Date Signed:", applicationData.policyAcknowledgment?.dateSigned || '');
  yPos += 5;

  checkPageBreak(25);
  addSection("Driver Dispatch Sheet");
  addField("Agreed:", applicationData.driverDispatchSheet?.agreed ? 'Yes' : 'No');
  addField("Driver Name:", applicationData.driverDispatchSheet?.driverFullName || '');
  addField("Signature:", applicationData.driverDispatchSheet?.signature || '');
  addField("Date:", applicationData.driverDispatchSheet?.date || '');
  yPos += 5;

  checkPageBreak(25);
  addSection("No Ryder Policy");
  addField("Agreed:", applicationData.noRyderPolicy?.agreed ? 'Yes' : 'No');
  addField("Employee Name:", applicationData.noRyderPolicy?.employeeName || '');
  addField("Signature:", applicationData.noRyderPolicy?.signature || '');
  addField("Date:", applicationData.noRyderPolicy?.date || '');
  yPos += 5;

  if (applicationData.safeDrivingPolicy) {
    checkPageBreak(25);
    addSection("Safe Driving Policy");
    addField("Print Name:", applicationData.safeDrivingPolicy.printName || '');
    addField("Signature:", applicationData.safeDrivingPolicy.signature || '');
    addField("Date:", applicationData.safeDrivingPolicy.date || '');
    yPos += 5;
  }

  checkPageBreak(30);
  addSection("Contractor Agreement");
  addField("Agreed:", applicationData.contractorAgreement?.agreed ? 'Yes' : 'No');
  addField("Contractor Name:", applicationData.contractorAgreement?.contractorName || '');
  addField("Initials:", applicationData.contractorAgreement?.initials || '');
  addField("Signature:", applicationData.contractorAgreement?.signature || '');
  addField("Date:", applicationData.contractorAgreement?.date || '');

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
    const filename = `Driver_Application_${applicantName}_${new Date().toISOString().split('T')[0]}.pdf`;

    const emailResponse = await resend.emails.send({
      from: "Driver Application <onboarding@resend.dev>",
      to: ["ben@nexustechsolution.com"],
      subject: `New Driver Application - ${applicationData.personalInfo?.firstName} ${applicationData.personalInfo?.lastName}`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #2563eb;">New Driver Application Received</h1>
          <p>A new driver application has been submitted.</p>
          <p><strong>Applicant Name:</strong> ${applicationData.personalInfo?.firstName || ''} ${applicationData.personalInfo?.lastName || ''}</p>
          <p><strong>Email:</strong> ${applicationData.personalInfo?.email || ''}</p>
          <p><strong>Phone:</strong> ${applicationData.personalInfo?.phone || ''}</p>
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

    console.log("Email sent successfully:", emailResponse);

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
