import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { assertTenantAccess, getServiceClient } from "../_shared/assertTenantAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Complete Sample Application Data for JOHN SMITH
 * 
 * This creates a realistic but FAKE driver application for testing.
 * All PII values are clearly fake (SSN starts with 000, etc.)
 */
function buildSampleApplicationData(tenantId: string) {
  const now = new Date().toISOString();
  
  return {
    // INVITE DATA
    invite: {
      email: "john.smith@example.com",
      name: "John Smith",
      tenant_id: tenantId,
    },
    
    // FULL APPLICATION DATA - Every field filled
    application: {
      tenant_id: tenantId,
      status: "submitted",
      driver_status: "pending",
      current_step: 9, // All steps complete
      submitted_at: now,
      updated_at: now,
      
      // === PERSONAL INFO (Step 1) ===
      personal_info: {
        firstName: "John",
        middleName: "William",
        lastName: "Smith",
        ssn: "000-00-1234", // Clearly fake SSN (000 prefix is invalid)
        dob: "1988-06-15",
        phone: "(555) 212-4455",
        email: "john.smith@example.com",
        address: "1234 Trucker Lane",
        city: "Dallas",
        state: "TX",
        zip: "75201",
        legallyAuthorized: "yes",
        felonyConviction: "no",
        felonyDetails: "",
      },
      // Mirror flattened columns
      cell_phone: "(555) 212-4455",
      home_phone: "(555) 212-4400",
      driver_address: "1234 Trucker Lane, Dallas, TX 75201",
      
      // === LICENSE INFO (Step 2) ===
      license_info: {
        licenseNumber: "TX-12345678",
        licenseState: "TX",
        licenseClass: "A",
        endorsements: ["H", "N", "T", "X"],
        expirationDate: "2027-06-15",
        issuedDate: "2015-06-15",
        yearsExperience: 9,
        deniedLicense: "no",
        deniedLicenseDetails: "",
        suspendedRevoked: "no",
        suspendedRevokedDetails: "",
        restrictions: "None",
      },
      // Mirror flattened
      medical_card_expiry: "2025-12-15",
      driver_record_expiry: "2026-06-15",
      green_card_expiry: null, // US Citizen
      work_permit_expiry: null,
      national_registry: "Y",
      restrictions: "None",
      
      // === EMPLOYMENT HISTORY (Step 3) - 3 employers, 3 years ===
      employment_history: [
        {
          companyName: "Swift Transportation LLC",
          position: "OTR Driver - Team Lead",
          address: "2200 S 75th Ave, Phoenix, AZ 85043",
          phone: "(800) 800-2200",
          supervisor: "Michael Rodriguez",
          supervisorTitle: "Fleet Manager",
          startDate: "2022-03-01",
          endDate: "2024-12-15",
          reasonForLeaving: "Seeking local opportunities to be closer to family",
          wasTerminated: false,
          terminationReason: "",
          salaryStart: "$0.52/mile",
          salaryEnd: "$0.58/mile",
          verified: false,
        },
        {
          companyName: "Werner Enterprises",
          position: "Regional Driver",
          address: "14507 Frontier Rd, Omaha, NE 68138",
          phone: "(800) 346-2818",
          supervisor: "Sarah Johnson",
          supervisorTitle: "Dispatch Supervisor",
          startDate: "2020-06-15",
          endDate: "2022-02-28",
          reasonForLeaving: "Offered better pay at Swift Transportation",
          wasTerminated: false,
          terminationReason: "",
          salaryStart: "$0.45/mile",
          salaryEnd: "$0.52/mile",
          verified: false,
        },
        {
          companyName: "Schneider National",
          position: "Dedicated Driver",
          address: "3101 Packerland Dr, Green Bay, WI 54313",
          phone: "(800) 558-6767",
          supervisor: "David Chen",
          supervisorTitle: "Operations Manager",
          startDate: "2018-01-10",
          endDate: "2020-06-01",
          reasonForLeaving: "Relocating to Texas region",
          wasTerminated: false,
          terminationReason: "",
          salaryStart: "$0.42/mile",
          salaryEnd: "$0.46/mile",
          verified: false,
        },
      ],
      
      // === DRIVING HISTORY (Step 4) - 1 accident, 1 violation ===
      driving_history: {
        hasAccidents: true,
        accidents: [
          {
            date: "2021-03-22",
            location: "I-40 near Amarillo, TX",
            description: "Minor rear-end collision in stop-and-go traffic. No injuries. Other driver cited for following too close.",
            fatalities: 0,
            injuries: 0,
            hazmat: false,
            preventable: false,
            policeReport: true,
            policeReportNumber: "APD-2021-0322-4455",
          },
        ],
        hasViolations: true,
        violations: [
          {
            date: "2019-08-15",
            state: "OK",
            violation: "Speeding - 72 in 65 zone",
            description: "7 mph over limit on I-44",
            penalty: "Fine $150, no points (traffic school completed)",
            resolved: true,
          },
        ],
        hasDUI: false,
        duiDetails: "",
        hasRecklessConviction: false,
        recklessDetails: "",
        cdlEveryInvalid: false,
        cdlEveryInvalidDetails: "",
      },
      
      // === EMERGENCY CONTACTS (Step 5) - 2 contacts ===
      emergency_contacts: [
        {
          firstName: "Mary",
          lastName: "Smith",
          relationship: "Spouse",
          phone: "(555) 212-4456",
          phoneSecondary: "(555) 212-4457",
          email: "mary.smith@example.com",
          address: "1234 Trucker Lane",
          city: "Dallas",
          state: "TX",
          zip: "75201",
          isPrimary: true,
        },
        {
          firstName: "Robert",
          lastName: "Smith",
          relationship: "Brother",
          phone: "(555) 333-7788",
          phoneSecondary: "",
          email: "robert.smith@example.com",
          address: "5678 Oak Street",
          city: "Houston",
          state: "TX",
          zip: "77001",
          isPrimary: false,
        },
      ],
      
      // === DOCUMENT UPLOAD (Step 6) - All required + 2 extras ===
      document_upload: {
        driversLicense: true,
        driversLicenseUrl: "sample-docs/john-smith-cdl-front.jpg",
        driversLicenseBack: true,
        driversLicenseBackUrl: "sample-docs/john-smith-cdl-back.jpg",
        socialSecurity: true,
        socialSecurityUrl: "sample-docs/john-smith-ssn-card.jpg",
        medicalCard: true,
        medicalCardUrl: "sample-docs/john-smith-medical-card.jpg",
        mvr: true,
        mvrUrl: "sample-docs/john-smith-mvr-report.pdf",
        otherDocuments: [
          {
            name: "Hazmat Endorsement Certificate",
            url: "sample-docs/john-smith-hazmat-cert.pdf",
            uploadedAt: now,
          },
          {
            name: "TSA Background Check Approval",
            url: "sample-docs/john-smith-tsa-approval.pdf",
            uploadedAt: now,
          },
        ],
        allRequiredUploaded: true,
      },
      
      // === DIRECT DEPOSIT (Step 7) - Full banking + CashApp ===
      direct_deposit: {
        paymentMethod: "direct_deposit",
        firstName: "John",
        middleName: "William",
        lastName: "Smith",
        email: "john.smith@example.com",
        bankName: "Chase Bank",
        routingNumber: "021000021", // Fake but valid format (JPMorgan Chase)
        accountNumber: "000123456789", // Clearly fake (starts with 000)
        checkingNumber: "000123456789",
        accountType: "checking",
        accountHolderName: "John William Smith",
        confirmAccountNumber: "000123456789",
        // CashApp as backup
        hasCashApp: true,
        cashAppTag: "$JohnSmithDriver",
        cashAppEmail: "john.smith@example.com",
        // W-9 acknowledgment
        w9Acknowledged: true,
        taxId: "000-00-1234", // Same fake SSN
      },
      // Mirror flattened columns
      bank_name: "Chase Bank",
      routing_number: "021000021",
      checking_number: "000123456789",
      account_name: "John William Smith",
      account_type: "checking",
      
      // === POLICIES (Steps 8a-8e) ===
      payroll_policy: {
        acknowledged: true,
        acknowledgedAt: now,
        signature: "John W. Smith",
        signedAt: now,
      },
      drug_alcohol_policy: {
        acknowledged: true,
        acknowledgedAt: now,
        signature: "John W. Smith",
        signedAt: now,
        understandsTesting: true,
        agreesToComply: true,
      },
      no_rider_policy: {
        acknowledged: true,
        acknowledgedAt: now,
        signature: "John W. Smith",
        signedAt: now,
      },
      safe_driving_policy: {
        acknowledged: true,
        acknowledgedAt: now,
        signature: "John W. Smith",
        signedAt: now,
        understandsExpectations: true,
      },
      driver_dispatch_sheet: {
        acknowledged: true,
        acknowledgedAt: now,
        signature: "John W. Smith",
        signedAt: now,
      },
      contractor_agreement: {
        acknowledged: true,
        acknowledgedAt: now,
        signature: "John W. Smith",
        signedAt: now,
        understandsTerms: true,
        agreesToArbitration: true,
      },
      
      // === WHY HIRE YOU (Step 9) ===
      why_hire_you: {
        statement: `I am a dedicated professional CDL driver with over 9 years of experience in OTR, regional, and dedicated freight operations. Throughout my career, I have maintained an excellent safety record with only one minor, non-preventable incident. 

I take pride in my work and understand that timely, safe deliveries are the backbone of this industry. My experience includes hazmat, tanker, and doubles/triples endorsements, making me versatile for any load type.

I am looking for a company that values driver wellbeing and offers stable, consistent work. I am committed to being a reliable team member and representing your company professionally on the road.

Key strengths: 
- 9+ years CDL-A experience
- Clean MVR with excellent safety rating
- H/N/T/X endorsements
- Team lead experience at Swift
- Excellent customer service skills
- Flexible availability for OTR or regional routes`,
        additionalSkills: ["Forklift certified", "Basic truck maintenance", "ELD proficient", "Bilingual English/Spanish"],
        preferredRoutes: "Regional preferred, but open to OTR",
        availableStartDate: "2025-02-01",
        referralSource: "Company website",
      },
      
      // === ADDITIONAL FLATTENED FIELDS ===
      application_date: now.split('T')[0],
      hired_date: null,
      termination_date: null,
      vehicle_note: "",
      score_card: "",
      
      // Pay fields (to be filled by admin after hire)
      pay_method: null,
      pay_method_active: false,
      load_percentage: null,
      pay_per_mile: null,
      hourly_rate: null,
      weekly_salary: null,
      base_salary: null,
      hours_per_week: null,
      overtime_eligible: false,
      overtime_multiplier: null,
      holiday_pay_rate: null,
      
      // Deductions/bonuses (admin fills after hire)
      fuel_bonus: null,
      safety_bonus: null,
      referral_bonus: null,
      sign_on_bonus: null,
      per_diem: null,
      detention_pay: null,
      layover_pay: null,
      stop_pay: null,
      weekend_premium: null,
      equipment_lease: null,
      insurance_deduction: null,
      escrow_deduction: null,
      other_deductions: null,
    },
  };
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const { tenant_id } = await req.json().catch(() => ({}));
    
    // SECURITY: Validate tenant access via JWT
    const accessResult = await assertTenantAccess(authHeader, tenant_id);
    if (!accessResult.allowed) {
      return accessResult.response!;
    }
    
    const tenantId = accessResult.tenant_id!;
    const userId = accessResult.user_id!;
    
    console.log(`[create-sample-application] Creating sample for tenant ${tenantId} by user ${userId}`);
    
    // Get service client for DB operations
    const supabase = getServiceClient();
    
    // Verify user is platform admin OR has internal release channel
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', userId)
      .maybeSingle();
      
    const { data: tenant } = await supabase
      .from('tenants')
      .select('release_channel')
      .eq('id', tenantId)
      .maybeSingle();
    
    const isPlatformAdmin = profile?.is_platform_admin === true;
    const isInternalChannel = tenant?.release_channel === 'internal';
    
    if (!isPlatformAdmin && !isInternalChannel) {
      console.log('[create-sample-application] Access denied - not internal');
      return new Response(
        JSON.stringify({ error: 'This feature is only available to internal users' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Build the complete sample data
    const sampleData = buildSampleApplicationData(tenantId);
    
    // Check if sample application already exists for this tenant
    const { data: existingApp } = await supabase
      .from('applications')
      .select('id, invite_id')
      .eq('tenant_id', tenantId)
      .eq('personal_info->>email', 'john.smith@example.com')
      .maybeSingle();
    
    if (existingApp) {
      // Update existing sample application
      console.log(`[create-sample-application] Updating existing sample: ${existingApp.id}`);
      
      const { error: updateError } = await supabase
        .from('applications')
        .update(sampleData.application)
        .eq('id', existingApp.id);
      
      if (updateError) {
        console.error('Error updating sample application:', updateError);
        throw new Error('Failed to update sample application');
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Sample application updated',
          application_id: existingApp.id,
          invite_id: existingApp.invite_id,
          updated: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Create new invite
    const { data: inviteData, error: inviteError } = await supabase
      .from('driver_invites')
      .insert({
        email: sampleData.invite.email,
        name: sampleData.invite.name,
        tenant_id: tenantId,
        invited_by: userId,
        invited_at: new Date().toISOString(),
        opened_at: new Date().toISOString(), // Mark as opened
        application_started_at: new Date().toISOString(),
      })
      .select('id, public_token')
      .single();
    
    if (inviteError) {
      console.error('Error creating sample invite:', inviteError);
      throw new Error('Failed to create sample invite');
    }
    
    console.log(`[create-sample-application] Created invite: ${inviteData.id}`);
    
    // Create the application linked to the invite
    const applicationPayload = {
      ...sampleData.application,
      invite_id: inviteData.id,
    };
    
    const { data: appData, error: appError } = await supabase
      .from('applications')
      .insert(applicationPayload)
      .select('id')
      .single();
    
    if (appError) {
      console.error('Error creating sample application:', appError);
      // Clean up the invite if app creation fails
      await supabase.from('driver_invites').delete().eq('id', inviteData.id);
      throw new Error('Failed to create sample application');
    }
    
    console.log(`[create-sample-application] Created application: ${appData.id}`);
    
    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Sample application created',
        application_id: appData.id,
        invite_id: inviteData.id,
        public_token: inviteData.public_token,
        applicant_name: 'John Smith',
        applicant_email: 'john.smith@example.com',
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error: any) {
    console.error('[create-sample-application] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message || 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
