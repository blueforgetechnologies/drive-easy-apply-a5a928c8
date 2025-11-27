import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";

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

const handler = async (req: Request): Promise<Response> => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const applicationData: ApplicationData = await req.json();
    
    console.log("Received application data:", applicationData);

    // Format the application data as HTML
    const emailHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #2563eb; border-bottom: 3px solid #2563eb; padding-bottom: 10px;">Driver Employment Application</h1>
        
        <h2 style="color: #1e40af; margin-top: 30px;">Personal Information</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.personalInfo?.firstName || ''} ${applicationData.personalInfo?.middleName || ''} ${applicationData.personalInfo?.lastName || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Date of Birth:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.personalInfo?.dob || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>SSN:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.personalInfo?.ssn || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Phone:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.personalInfo?.phone || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Email:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.personalInfo?.email || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Address:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.personalInfo?.address || ''}, ${applicationData.personalInfo?.city || ''}, ${applicationData.personalInfo?.state || ''} ${applicationData.personalInfo?.zip || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Legally Authorized to Work:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.personalInfo?.legallyAuthorized || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Felony Conviction:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.personalInfo?.felonyConviction || ''}</td></tr>
          ${applicationData.personalInfo?.felonyDetails ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Felony Details:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.personalInfo.felonyDetails}</td></tr>` : ''}
        </table>

        <h3 style="color: #1e40af; margin-top: 20px;">Emergency Contact</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.personalInfo?.emergencyContactName || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Relationship:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.personalInfo?.emergencyContactRelationship || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Phone:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.personalInfo?.emergencyContactPhone || ''}</td></tr>
        </table>

        ${applicationData.payrollPolicy ? `
        <h2 style="color: #1e40af; margin-top: 30px;">Payroll Policy Acknowledgment</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.payrollPolicy.agreedName || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Signature:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.payrollPolicy.signature || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Date:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.payrollPolicy.date || ''}</td></tr>
        </table>
        ` : ''}

        <h2 style="color: #1e40af; margin-top: 30px;">License Information</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>License Number:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.licenseInfo?.licenseNumber || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>State:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.licenseInfo?.licenseState || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Class:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.licenseInfo?.licenseClass || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Years of Experience:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.licenseInfo?.yearsExperience || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Endorsements:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.licenseInfo?.endorsements?.join(', ') || 'None'}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>License Denied:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.licenseInfo?.deniedLicense || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>License Suspended/Revoked:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.licenseInfo?.suspendedRevoked || ''}</td></tr>
          ${applicationData.licenseInfo?.deniedDetails ? `<tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Details:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.licenseInfo.deniedDetails}</td></tr>` : ''}
        </table>

        <h2 style="color: #1e40af; margin-top: 30px;">Employment History</h2>
        <p style="color: #6b7280; margin-bottom: 15px;">${applicationData.employmentHistory?.length || 0} employer(s) listed</p>
        ${applicationData.employmentHistory?.map((emp: any, index: number) => `
          <div style="background-color: #f9fafb; padding: 15px; margin-bottom: 15px; border-radius: 5px;">
            <h3 style="margin-top: 0; color: #1e40af;">Employer ${index + 1}</h3>
            <p><strong>Company:</strong> ${emp.companyName || ''}</p>
            <p><strong>Position:</strong> ${emp.position || ''}</p>
            <p><strong>Dates:</strong> ${emp.startDate || ''} to ${emp.endDate || ''}</p>
            <p><strong>Supervisor:</strong> ${emp.supervisor || ''}</p>
            <p><strong>Phone:</strong> ${emp.phone || ''}</p>
            <p><strong>Reason for Leaving:</strong> ${emp.reasonForLeaving || ''}</p>
          </div>
        `).join('') || '<p>No employment history provided</p>'}

        <h2 style="color: #1e40af; margin-top: 30px;">Driving History</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Accidents Reported:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.drivingHistory?.accidents?.length || 0}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Violations Reported:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.drivingHistory?.violations?.length || 0}</td></tr>
        </table>

        <h2 style="color: #1e40af; margin-top: 30px;">Direct Deposit Information</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.directDeposit?.firstName || ''} ${applicationData.directDeposit?.lastName || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Business Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.directDeposit?.businessName || 'N/A'}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Email:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.directDeposit?.email || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Bank Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.directDeposit?.bankName || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Routing Number:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.directDeposit?.routingNumber || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Account Number:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.directDeposit?.checkingNumber || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Account Type:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.directDeposit?.accountType?.replace('-', ' ') || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>CashApp Cashtag:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.directDeposit?.cashAppCashtag || 'N/A'}</td></tr>
        </table>

        <h2 style="color: #1e40af; margin-top: 30px;">Policies & Agreements</h2>
        
        <h3 style="color: #374151; margin-top: 20px;">Drug & Alcohol Policy</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Policy Acknowledged:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.policyAcknowledgment?.agreedToPolicy ? 'Yes' : 'No'}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Signature:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.policyAcknowledgment?.signature || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Date Signed:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.policyAcknowledgment?.dateSigned || ''}</td></tr>
        </table>

        <h3 style="color: #374151; margin-top: 20px;">Driver Dispatch Sheet</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Agreed:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.driverDispatchSheet?.agreed ? 'Yes' : 'No'}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Driver Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.driverDispatchSheet?.driverFullName || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Signature:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.driverDispatchSheet?.signature || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Date:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.driverDispatchSheet?.date || ''}</td></tr>
        </table>

        <h3 style="color: #374151; margin-top: 20px;">No Ryder Policy</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Agreed:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.noRyderPolicy?.agreed ? 'Yes' : 'No'}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Employee Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.noRyderPolicy?.employeeName || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Signature:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.noRyderPolicy?.signature || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Date:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.noRyderPolicy?.date || ''}</td></tr>
        </table>

        ${applicationData.safeDrivingPolicy ? `
        <h3 style="color: #374151; margin-top: 20px;">Safe Driving Policy</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Print Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.safeDrivingPolicy.printName || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Signature:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.safeDrivingPolicy.signature || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Date:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.safeDrivingPolicy.date || ''}</td></tr>
        </table>
        ` : ''}

        <h3 style="color: #374151; margin-top: 20px;">Contractor Agreement</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Agreed:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.contractorAgreement?.agreed ? 'Yes' : 'No'}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Contractor Name:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.contractorAgreement?.contractorName || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Initials:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.contractorAgreement?.initials || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Signature:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.contractorAgreement?.signature || ''}</td></tr>
          <tr><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;"><strong>Date:</strong></td><td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${applicationData.contractorAgreement?.date || ''}</td></tr>
        </table>

        <div style="margin-top: 40px; padding: 20px; background-color: #eff6ff; border-left: 4px solid #2563eb;">
          <p style="margin: 0; color: #1e40af;"><strong>Note:</strong> This application was submitted on ${new Date().toLocaleString()}</p>
        </div>
      </div>
    `;

    const emailResponse = await resend.emails.send({
      from: "Driver Application <onboarding@resend.dev>",
      to: ["Sofiane@TalbiLogistics.Com"],
      subject: `New Driver Application - ${applicationData.personalInfo?.firstName} ${applicationData.personalInfo?.lastName}`,
      html: emailHtml,
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
