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
  noRiderPolicy: any;
  safeDrivingPolicy?: any;
  contractorAgreement: any;
  whyHireYou?: any;
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

  const addBulletList = (items: string[]) => {
    items.forEach(item => {
      const bulletText = `• ${item}`;
      const splitText = doc.splitTextToSize(bulletText, 165);
      splitText.forEach((line: string, index: number) => {
        checkPageBreak(lineHeight);
        doc.text(line, margin + (index > 0 ? 5 : 0), yPos);
        yPos += lineHeight;
      });
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

  // Emergency Contact
  addSection("EMERGENCY CONTACT");
  addField("Name:", applicationData.personalInfo?.emergencyContactName || '');
  addField("Relationship:", applicationData.personalInfo?.emergencyContactRelationship || '');
  addField("Phone:", applicationData.personalInfo?.emergencyContactPhone || '');
  yPos += 5;

  // Payroll Policy - FULL TEXT
  if (applicationData.payrollPolicy) {
    doc.addPage();
    yPos = 20;
    addTitle("PAYROLL POLICY");
    
    addSection("Pay Cycle");
    addParagraph("The pay cycle starts on Wednesdays and ends on Tuesdays.");
    yPos += 3;

    addSection("Weekly Pay");
    addParagraph("The weekly pay is a minimum of $850 for a full 7 days of work.");
    yPos += 3;

    addSection("Pay Schedule");
    addParagraph("Pay is sent on Wednesday; drivers will receive the pay on Thursdays unless it's a holiday.");
    yPos += 3;

    addSection("Pay Hold");
    addParagraph("There will be a 1-week pay hold for all drivers; it will be released 2 weeks after you quit in good terms.");
    yPos += 3;

    addSection("Conditions to Qualify for Minimum Weekly Pay of $850");
    addBulletList([
      "Driver must follow dispatch instructions (See dispatch sheet for reference)",
      "Driver must be on the road for the full 7 days (Wednesday to Tuesday), with no restrictions",
      "Driver's actions or mistakes must not cause loss of a load or waste a day",
      "Late deliveries or drop-offs caused by the driver may result in losing the minimum pay",
      "Damage to property (cargo, equipment, etc.) may result in losing the minimum pay and deductions may apply",
      "Quitting without giving a 14-day notice in writing (text message only) or being terminated may result in losing the pay hold and final pay"
    ]);
    yPos += 5;

    addSection("ACKNOWLEDGMENT");
    addField("I agree to all the terms:", applicationData.payrollPolicy.agreedName || '');
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

  // Drug & Alcohol Policy - FULL TEXT
  doc.addPage();
  yPos = 20;
  addTitle("DRUG AND ALCOHOL POLICY");

  addSection("1. PURPOSE AND SCOPE");
  addParagraph("This Drug and Alcohol Testing Policy complies with the Federal Motor Carrier Safety Administration (FMCSA) regulations under 49 CFR Part 382. This policy applies to all drivers who operate commercial motor vehicles (CMVs) requiring a Commercial Driver's License (CDL).");
  yPos += 3;

  addSection("2. PROHIBITED CONDUCT");
  addParagraph("Drivers are strictly prohibited from:");
  yPos += 2;
  addBulletList([
    "Reporting for duty or remaining on duty while having an alcohol concentration of 0.04 or greater",
    "Using alcohol while on duty or operating a CMV",
    "Using alcohol within 4 hours of reporting for duty",
    "Refusing to submit to required alcohol or drug tests",
    "Reporting for duty or remaining on duty when using any controlled substance, except when prescribed by a physician who has advised the driver that the substance will not adversely affect safe operation",
    "Using, possessing, or being under the influence of illegal drugs while on duty"
  ]);
  yPos += 3;

  addSection("3. TESTING REQUIREMENTS");
  addParagraph("Drivers will be subject to the following types of testing:");
  yPos += 2;
  
  doc.setFontSize(10);
  doc.setFont(undefined, 'bold');
  addParagraph("Pre-Employment Testing", 10);
  doc.setFont(undefined, 'normal');
  addParagraph("All applicants must submit to and pass a drug test before performing safety-sensitive functions.");
  yPos += 2;

  doc.setFont(undefined, 'bold');
  addParagraph("Random Testing", 10);
  doc.setFont(undefined, 'normal');
  addParagraph("Drivers will be subject to unannounced random drug and alcohol testing. The selection is made using a scientifically valid method.");
  yPos += 2;

  doc.setFont(undefined, 'bold');
  addParagraph("Post-Accident Testing", 10);
  doc.setFont(undefined, 'normal');
  addParagraph("Testing is required after accidents involving fatalities, injuries requiring immediate medical treatment away from the scene, or disabling damage to any vehicle requiring tow-away.");
  yPos += 2;

  doc.setFont(undefined, 'bold');
  addParagraph("Reasonable Suspicion Testing", 10);
  doc.setFont(undefined, 'normal');
  addParagraph("Testing may be required when a trained supervisor has reasonable suspicion that a driver has violated drug and alcohol prohibitions.");
  yPos += 2;

  doc.setFont(undefined, 'bold');
  addParagraph("Return-to-Duty Testing", 10);
  doc.setFont(undefined, 'normal');
  addParagraph("Following a violation of drug and alcohol prohibitions, a driver must undergo evaluation by a Substance Abuse Professional (SAP) and pass a return-to-duty test before resuming safety-sensitive functions.");
  yPos += 2;

  doc.setFont(undefined, 'bold');
  addParagraph("Follow-Up Testing", 10);
  doc.setFont(undefined, 'normal');
  addParagraph("After returning to duty following a violation, drivers are subject to unannounced follow-up testing as directed by the SAP.");
  yPos += 3;

  addSection("4. TESTING PROCEDURES");
  addParagraph("Drug Testing: Conducted through urinalysis at a SAMHSA-certified laboratory. Tests screen for marijuana, cocaine, amphetamines, opioids, and phencyclidine (PCP).");
  yPos += 2;
  addParagraph("Alcohol Testing: Conducted using an Evidential Breath Testing (EBT) device or approved saliva testing device operated by a trained Breath Alcohol Technician (BAT).");
  yPos += 3;

  checkPageBreak(40);
  addSection("5. CONSEQUENCES OF VIOLATIONS");
  addParagraph("A driver who violates any prohibition in this policy will be immediately removed from safety-sensitive functions. Consequences include:");
  yPos += 2;
  addBulletList([
    "Immediate removal from driving duties",
    "Referral to a Substance Abuse Professional (SAP) for evaluation and treatment recommendations",
    "Successful completion of SAP-recommended treatment or education programs",
    "Return-to-duty test with negative result required before resuming duties",
    "Possible termination of employment based on company policy",
    "Follow-up testing for up to 5 years"
  ]);
  yPos += 3;

  addSection("6. REFUSAL TO TEST");
  addParagraph("Refusal to submit to a required drug or alcohol test is considered a violation equivalent to testing positive. This includes failing to provide adequate specimens, adulterating or substituting specimens, failing to arrive at the testing site in a timely manner, or leaving the testing site before the process is complete.");
  yPos += 3;

  checkPageBreak(30);
  addSection("7. DRIVER RIGHTS AND RESPONSIBILITIES");
  addParagraph("Drivers have the right to:");
  yPos += 2;
  addBulletList([
    "Request and receive information about the testing process",
    "Have test results reported to them",
    "Request and have split specimens tested at their expense if the initial test is positive",
    "Information about resources available for evaluating and resolving problems associated with alcohol misuse and drug use"
  ]);
  yPos += 3;

  addSection("8. CONFIDENTIALITY");
  addParagraph("All information received through the drug and alcohol testing program is confidential. Access to this information is limited to those with a legitimate need to know and is maintained in secure files separate from other personnel records.");
  yPos += 3;

  addSection("9. EDUCATIONAL MATERIALS");
  addParagraph("The company will provide educational materials explaining the requirements of 49 CFR Part 382, the company's policies and procedures, and information about the effects of drug and alcohol use on health, work, and personal life.");
  yPos += 3;

  addSection("10. CONTACT INFORMATION");
  addParagraph("Questions about this policy should be directed to the company's Designated Employer Representative (DER) or Human Resources Department. For substance abuse assistance, drivers may contact the company's Employee Assistance Program (EAP).");
  yPos += 5;

  addSection("POLICY ACKNOWLEDGMENT");
  addField("Agreed to Policy:", applicationData.policyAcknowledgment?.agreedToPolicy ? 'Yes' : 'No');
  addField("Signature:", applicationData.policyAcknowledgment?.signature || '');
  addField("Date Signed:", new Date(applicationData.policyAcknowledgment?.dateSigned || '').toLocaleDateString() || '');
  yPos += 5;

  // Driver Dispatch Sheet - FULL TEXT
  doc.addPage();
  yPos = 20;
  addTitle("DRIVER DISPATCH SHEET");
  addSection("Operational Rules & Procedures");
  
  const dispatchRules = [
    "Must have your phone handy while in the truck, never on silent (communication is very important)",
    "When in the truck, you must be ready to drive within 15 to 20 minutes notice from the time of dispatch",
    "Once dispatched, you must text your dispatcher your ETA to shipper/receiver",
    "Truck must be clean and organized before arrival to shippers (Box swept)",
    "You must be fully clothed at Shippers/Receivers (Shirt, Pants, Shoes - No Flip Flops)",
    "Must be respectful to all our customers, if any issues arise, call dispatch",
    "Must text dispatch upon arrival to Shipper/Receiver/when fueling/when taking a break",
    "Once loaded, the driver must strap and secure the freight and the pallet jack using straps, blankets and load bars",
    "Look for damage to the freight, if damage is found, you must report it to shipper and dispatch (Send pictures)",
    "Once loaded, you must scan the BOL, all pages, then take a picture of the freight and email both to dispatch",
    "Truck box must be locked at all times, we provide locks and they must be used",
    "Do not leave shipper or receiver before you get cleared by dispatch",
    "Any delays while in transit must be reported to dispatch ASAP",
    "Never pull on the side of the interstate unless it's an emergency",
    "Never drive on a non-paved road (Gravel is ok)",
    "Must double check the freight prior to delivering it",
    "Once delivery is completed, receiver must sign BOL and print their First and Last name",
    "Once BOL has been signed by the receiver, you must scan the BOL and email it to dispatch",
    "Never drive more than 10 miles after drop off without informing and getting approval from dispatch",
    "Only fuel at major truck stops (Loves, Flying J, Pilots, TA, AM, AB, Petro...) - Absolutely no gas stations unless authorized by dispatch"
  ];

  addBulletList(dispatchRules);
  yPos += 5;

  addSection("ACKNOWLEDGMENT");
  addField("Agreed:", applicationData.driverDispatchSheet?.agreed ? 'Yes' : 'No');
  addField("Driver Name:", applicationData.driverDispatchSheet?.driverFullName || '');
  addField("Signature:", applicationData.driverDispatchSheet?.signature || '');
  addField("Date:", applicationData.driverDispatchSheet?.date || '');
  yPos += 5;

  // No Rider Policy - FULL TEXT
  doc.addPage();
  yPos = 20;
  addTitle("NO RIDER POLICY");

  addSection("1. Purpose");
  addParagraph("This policy ensures the safety, security, and compliance of the Company with respect to the use of equipment, trucks, or trailers. The use of equipment by unauthorized individuals poses potential risks to our operations, safety, and reputation.");
  yPos += 3;

  addSection("2. Scope");
  addParagraph("This policy applies to all employees, contractors, and individuals associated with the Company, including drivers, dispatchers, maintenance personnel, and management.");
  yPos += 3;

  addSection("3. Policy");
  yPos += 2;
  
  doc.setFont(undefined, 'bold');
  addParagraph("3.1 Rider Prohibition", 10);
  doc.setFont(undefined, 'normal');
  addBulletList([
    "No person, other than an employee or authorized contractor, is permitted to operate or ride in Company Assets",
    "Employees and contractors are strictly prohibited from allowing any unauthorized person to operate or ride in Company Assets"
  ]);
  yPos += 2;

  doc.setFont(undefined, 'bold');
  addParagraph("3.2 Authorization Process", 10);
  doc.setFont(undefined, 'normal');
  addBulletList([
    "Only employees and contractors authorized by the Company may operate or use Company Assets",
    "Authorization requires proper licensing, training, and compliance with company policies"
  ]);
  yPos += 2;

  doc.setFont(undefined, 'bold');
  addParagraph("3.3 Enforcement", 10);
  doc.setFont(undefined, 'normal');
  addBulletList([
    "Violation may result in disciplinary action, up to and including termination",
    "The Company may report unauthorized use to relevant authorities and take legal action"
  ]);
  yPos += 3;

  addSection("4. Reporting Unauthorized Use");
  addParagraph("Employees must promptly report any instances of unauthorized individuals attempting to operate or ride in Company Assets to their immediate supervisor or management.");
  yPos += 3;

  addSection("5. Compliance with Applicable Laws");
  addParagraph("The Company will comply with all applicable federal, state, and local laws and regulations related to the operation of commercial vehicles, including the Federal Motor Carrier Safety Regulations (FMCSRs).");
  yPos += 5;

  addSection("ACKNOWLEDGMENT");
  addField("Agreed:", applicationData.noRiderPolicy?.agreed ? 'Yes' : 'No');
  addField("Employee Name:", applicationData.noRiderPolicy?.employeeName || '');
  addField("Signature:", applicationData.noRiderPolicy?.signature || '');
  addField("Date:", applicationData.noRiderPolicy?.date || '');
  yPos += 5;

  // Safe Driving Policy - FULL TEXT
  if (applicationData.safeDrivingPolicy) {
    doc.addPage();
    yPos = 20;
    addTitle("SAFE DRIVING POLICY");

    addSection("Tailgating");
    addParagraph("Do not follow other vehicles too close. A safe driver must keep a minimum of 6 seconds between his truck and the vehicle in front. Following too close will lead into an accident, guaranteed! All trucks are equipped with sensors and trackers to detect bad driving habits such as tailgating. If such driving habits are detected, we will give you a strike. The third strike will be followed with an immediate termination.");
    yPos += 3;

    addSection("New York Driving");
    yPos += 2;
    doc.setFontSize(10);
    doc.text("1. Be extremely cautious and alert at all times when driving in New York. You must be expecting other vehicles to come to an immediate stop. If you are not keeping your distance, this will lead into a collision. KEEP your distance!", margin + 5, yPos);
    yPos += 10;
    doc.text("2. Under no circumstance drive the truck on a Parkway! No exceptions. It is illegal and could result in a major accident and huge fines to the driver. Keep off Parkways! Only drive on Express way, Road, Interstate, Blvd, ST... everything is good EXCEPT PARKWAYS. Stay off parkways.", margin + 5, yPos);
    const splitText1 = doc.splitTextToSize("2. Under no circumstance drive the truck on a Parkway! No exceptions. It is illegal and could result in a major accident and huge fines to the driver. Keep off Parkways! Only drive on Express way, Road, Interstate, Blvd, ST... everything is good EXCEPT PARKWAYS. Stay off parkways.", 165);
    yPos += (splitText1.length * lineHeight);
    yPos += 3;

    addSection("Low Clearance Bridges");
    addParagraph("Be cautious and on the lookout for low clearance bridges. All our trucks are equipped with Trucker's GPS, but from time to time there will be a low clearance bridge. You must always know the clearance of the bridge before you rush to drive under.");
    yPos += 3;

    addSection("Road Rage");
    addParagraph("Remember why you are here. You have a job to do and a family to provide for. You are a professional truck driver. You drive in one day more than most people drive in a month. You are the expert. There will be times when drivers will cut you off or come to a sudden stop directly in front of you, not considering that a big truck requires more distance to come to a full stop. They will make you upset at times.");
    yPos += 2;
    addParagraph("Here is advice from a professional driver to another: ignore them and keep moving forward with your day. You will not need to fight them, teach them, nor ever meet them again. This will help you keep your sanity intact. Think positive!");
    yPos += 5;

    addSection("ACKNOWLEDGMENT");
    addField("Print Name:", applicationData.safeDrivingPolicy.printName || '');
    addField("Signature:", applicationData.safeDrivingPolicy.signature || '');
    addField("Date:", applicationData.safeDrivingPolicy.date || '');
    yPos += 5;
  }

  // Contractor Agreement - FULL TEXT
  doc.addPage();
  yPos = 20;
  addTitle("CONTRACTOR AGREEMENT");

  addSection("Agreement Overview");
  addParagraph("From time to time, the Carrier may hire the Contractor to haul freight using either their own vehicle or a Company-Provided Vehicle.");
  yPos += 3;

  addSection("Company Vehicle Usage");
  addParagraph("If a Company Vehicle is provided, the Contractor has the right to use the vehicle for personal purposes with 2 conditions:");
  yPos += 2;
  doc.setFontSize(10);
  const splitCondition1 = doc.splitTextToSize("1. Submitting a written request and obtaining written approval (text message will suffice)", 165);
  doc.text(splitCondition1, margin + 5, yPos);
  yPos += (splitCondition1.length * lineHeight);
  const splitCondition2 = doc.splitTextToSize("2. Covering all related expenses such as but not limited to (Fuel, Truck Payment, Tolls, Miles, Insurance, etc.)", 165);
  doc.text(splitCondition2, margin + 5, yPos);
  yPos += (splitCondition2.length * lineHeight) + 3;

  addSection("Actions That May Result in Termination");
  addParagraph("Any of the following could result in termination, and any losses incurred will be deducted from the Settlement pay:");
  yPos += 2;

  const terminationReasons = [
    "Being rude, threatening or making unreasonable demands that will lead to conflict with dispatch or customers",
    "Damaging the vehicle due to negligence such as a collision with a low clearance bridge or a building",
    "Use or possession of any type of illegal drugs/alcohol in the vehicle",
    "Accepting payment from customers",
    "Damaging freight or equipment",
    "Reckless driving",
    "Using the wrong type of fuel on the vehicle",
    "Locking the keys in the vehicle",
    "Leaving lights or AC on which results in a dead battery",
    "Driving the truck with low oil/coolant without informing dispatch in writing (through text)",
    "Driving the truck with check engine light on without informing dispatch in writing (through text)",
    "Damaging the tires by driving on a sidewalk or an unpaved road",
    "Driving the vehicle on a non-paved road then getting stuck",
    "Driving with a suspended driver license",
    "Driving without filling out a logbook or while logbook is showing violation",
    "Having an unauthorized passenger in the vehicle",
    "Bailing out on us while in the middle of the load or after commitment has been made",
    "Making late deliveries/pickups without a valid cause",
    "Loading or unloading the truck without first obtaining permission from dispatch (through text)",
    "Leaving shippers or receivers prior to getting cleared to leave by dispatch",
    "Parking on the side of the highway without having an emergency such as a breakdown or health issues"
  ];

  addBulletList(terminationReasons);
  yPos += 5;

  addSection("AGREEMENT ACKNOWLEDGMENT");
  addField("Agreed:", applicationData.contractorAgreement?.agreed ? 'Yes' : 'No');
  addField("Contractor Name:", applicationData.contractorAgreement?.contractorName || '');
  addField("Initials:", applicationData.contractorAgreement?.initials || '');
  addField("Signature:", applicationData.contractorAgreement?.signature || '');
  addField("Date:", applicationData.contractorAgreement?.date || '');
  yPos += 5;

  // Why Should We Hire You - STATEMENT
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
