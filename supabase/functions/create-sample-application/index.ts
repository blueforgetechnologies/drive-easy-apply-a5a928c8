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
  const today = now.split('T')[0];
  
  return {
    // INVITE DATA
    invite: {
      email: "john.smith@example.com",
      name: "John Smith",
      tenant_id: tenantId,
    },
    
    // FULL APPLICATION DATA - Every field filled comprehensively
    application: {
      tenant_id: tenantId,
      status: "submitted",
      driver_status: null, // Stays null until admin approves
      current_step: 9, // All steps complete
      submitted_at: now,
      updated_at: now,
      application_date: today,
      
      // === PERSONAL INFO (Step 1) - Complete with address history ===
      personal_info: {
        firstName: "John",
        middleName: "Andrew",
        lastName: "Smith",
        suffix: "",
        dob: "1989-06-14",
        ssn: "123-45-6789",
        phone: "(614) 555-0199",
        alternatePhone: "(614) 555-0188",
        email: "john.smith@example.com",
        // Current Address
        address: "1234 West Broad Street",
        apartment: "Apt 2B",
        city: "Columbus",
        state: "OH",
        zip: "43228",
        county: "Franklin",
        country: "United States",
        // How long at current address
        yearsAtAddress: 3,
        monthsAtAddress: 6,
        // Previous addresses (to meet 2+ year requirement)
        previousAddresses: [
          {
            address: "567 Maple Avenue",
            apartment: "",
            city: "Dublin",
            state: "OH",
            zip: "43017",
            county: "Franklin",
            country: "United States",
            fromDate: "2020-01-01",
            toDate: "2022-06-01",
            yearsAtAddress: 2,
            monthsAtAddress: 6,
          },
          {
            address: "890 Oak Street",
            apartment: "Unit 101",
            city: "Westerville",
            state: "OH",
            zip: "43081",
            county: "Franklin",
            country: "United States",
            fromDate: "2018-03-01",
            toDate: "2020-01-01",
            yearsAtAddress: 1,
            monthsAtAddress: 10,
          },
        ],
        // Legal questions
        legallyAuthorized: "Yes",
        citizenship: "United States Citizen",
        requiresSponsorship: "No",
        felonyConviction: "No",
        felonyExplanation: "",
        misdemeanorConviction: "No",
        misdemeanorExplanation: "",
        // Additional IDs
        hasTwicCard: true,
        twicCardNumber: "TWC-12345678",
        twicExpiration: "2028-10-01",
        hasPassport: true,
        passportNumber: "P12345678",
        passportExpiration: "2030-05-20",
        passportCountry: "United States",
        hasHazmatEndorsement: true,
        veteranStatus: "No",
        // Physical info for medical
        height: "5'11\"",
        weight: "185 lbs",
        eyeColor: "Brown",
        hairColor: "Black",
        gender: "Male",
        maritalStatus: "Married",
        dateAvailable: "2025-02-01",
      },
      // Mirror flattened columns
      cell_phone: "(614) 555-0199",
      home_phone: "(614) 555-0188",
      driver_address: "1234 West Broad Street, Apt 2B, Columbus, OH 43228",
      
      // === LICENSE INFO (Step 2) - Complete with all fields ===
      license_info: {
        licenseNumber: "OH1234567",
        nameOnLicense: "JOHN ANDREW SMITH",
        licenseState: "OH",
        licenseClass: "A",
        endorsements: ["T", "X", "H", "N"],
        restrictions: "None",
        issuedDate: "2018-03-15",
        expirationDate: "2027-03-15",
        yearsExperience: 7,
        // DOT Medical Certification
        hasDotMedicalCert: "yes",
        nationalRegistryNumber: "NR-9876543210",
        medicalCardExpiration: "2026-11-30",
        // Equipment experience
        equipmentExperience: ["Dry Van", "Reefer", "Flatbed", "Tanker", "Car Hauler"],
        straightTruck: true,
        tractorTrailer: true,
        doubleTripples: false,
        tankerExperience: true,
        hazmatExperience: true,
        // Additional license questions
        suspendedRevoked: "No",
        suspendedRevokedExplanation: "",
        deniedLicense: "No",
        deniedLicenseExplanation: "",
        otherStatesLicensed: "IN, KY",
        teamDriving: "Yes",
        willingToTeamDrive: true,
        willingToRelocate: "Yes",
        homeTime: "Every 2 weeks",
      },
      // Mirror flattened
      driver_record_expiry: "2027-03-15",
      medical_card_expiry: "2026-11-30",
      green_card_expiry: null,
      work_permit_expiry: null,
      national_registry: "NR-9876543210",
      restrictions: "None",
      
      // === EMPLOYMENT HISTORY (Step 3) - 3 employers covering 6+ years ===
      employment_history: [
        {
          companyName: "Midwest Freight Company LLC",
          position: "Senior Company Driver",
          address: "8000 Industrial Parkway, Columbus, OH 43228",
          phone: "(614) 555-0144",
          supervisor: "Mike Reynolds",
          startDate: "2023-01-15",
          endDate: "2025-01-10",
          payType: "salary",
          payRate: "72000",
          reasonForLeaving: "Seeking better home time and benefits package",
        },
        {
          companyName: "Buckeye Logistics Inc",
          position: "Over-the-Road Driver",
          address: "500 Logistics Lane, Grove City, OH 43123",
          phone: "(614) 555-0177",
          supervisor: "Sarah Collins",
          startDate: "2021-02-01",
          endDate: "2023-01-10",
          payType: "per-mile",
          payRate: "0.58",
          reasonForLeaving: "Company restructured dispatch schedules",
        },
        {
          companyName: "Central Ohio Transport Services",
          position: "Regional Driver",
          address: "2000 Transit Drive, Columbus, OH 43207",
          phone: "(614) 555-0133",
          supervisor: "James Ortega",
          startDate: "2019-03-01",
          endDate: "2021-01-28",
          payType: "hourly",
          payRate: "25.50",
          reasonForLeaving: "Company downsizing due to economic conditions",
        },
      ],
      
      // === DRIVING HISTORY (Step 4) - Clean record with safety award ===
      driving_history: {
        accidents: [],
        accidentsLast3Years: 0,
        accidentsLast5Years: 0,
        violations: [],
        violationsLast3Years: 0,
        violationsLast5Years: 0,
        movingViolationsLast3Years: 0,
        dui: "No",
        duiExplanation: "",
        failedDrugTest: "No",
        failedDrugTestExplanation: "",
        refusedDrugTest: "No",
        refusedDrugTestExplanation: "",
        licenseSuspension: "No",
        licenseSuspensionExplanation: "",
        licenseRevocation: "No",
        licenseRevocationExplanation: "",
        preventableAccidents: 0,
        nonPreventableAccidents: 0,
        safetyAwards: "1,000,000 Mile Safe Driving Award - National Safety Council (2024)",
        safetyTraining: ["Smith System Defensive Driving", "HazMat Transport Safety Certification"],
        lastMVRDate: "2024-11-01",
        pspRecordCheck: "Clear",
      },
      
      // === EMERGENCY CONTACTS (Step 5) - Two contacts ===
      emergency_contacts: [
        {
          firstName: "Emily",
          lastName: "Smith",
          relationship: "Spouse",
          phone: "(614) 555-0120",
          alternatePhone: "(614) 555-0121",
          email: "emily.smith@example.com",
          address: "1234 West Broad Street",
          apartment: "Apt 2B",
          city: "Columbus",
          state: "OH",
          zip: "43228",
          isPrimary: true,
        },
        {
          firstName: "Robert",
          lastName: "Smith",
          relationship: "Father",
          phone: "(614) 555-0150",
          alternatePhone: "",
          email: "robert.smith@example.com",
          address: "456 Elm Street",
          apartment: "",
          city: "Westerville",
          state: "OH",
          zip: "43081",
          isPrimary: false,
        },
      ],
      
      // === DOCUMENT UPLOAD (Step 6) - All required + extras ===
      document_upload: {
        driversLicense: "sample/drivers_license_front.jpg",
        driversLicenseBack: "sample/drivers_license_back.jpg",
        socialSecurity: "sample/social_security_card.jpg",
        medicalCard: "sample/medical_card.jpg",
        mvr: "sample/mvr_report.pdf",
        twicCard: "sample/twic_card.jpg",
        passport: "sample/passport.jpg",
        other: ["sample/hazmat_certification.pdf", "sample/safety_award_certificate.pdf"],
      },
      
      // === DIRECT DEPOSIT (Step 7) - Complete banking info ===
      direct_deposit: {
        firstName: "John",
        lastName: "Smith",
        businessName: "",
        email: "john.smith@example.com",
        bankName: "Chase Bank",
        routingNumber: "021000021",
        checkingNumber: "123456789012",
        accountType: "personal-checking",
        cashAppCashtag: "$JohnSmithTrucking",
      },
      // Mirror flattened columns
      bank_name: "Chase Bank",
      routing_number: "021000021",
      checking_number: "123456789012",
      account_name: "John Andrew Smith",
      account_type: "personal-checking",
      
      // === POLICIES (Steps 8a-8e) - All acknowledged and signed ===
      payroll_policy: {
        acknowledged: true,
        acknowledgedAt: now,
        read: true,
        understood: true,
        signature: "John A. Smith",
        signedAt: now,
        agreed: true,
      },
      drug_alcohol_policy: {
        acknowledged: true,
        acknowledgedAt: now,
        read: true,
        understood: true,
        signature: "John A. Smith",
        signedAt: now,
        understandsTesting: true,
        agreesToComply: true,
        agreesToRandomTesting: true,
        agreed: true,
      },
      no_rider_policy: {
        acknowledged: true,
        acknowledgedAt: now,
        read: true,
        understood: true,
        signature: "John A. Smith",
        signedAt: now,
        agreed: true,
      },
      safe_driving_policy: {
        acknowledged: true,
        acknowledgedAt: now,
        read: true,
        understood: true,
        signature: "John A. Smith",
        signedAt: now,
        understandsExpectations: true,
        agreesToSafetyProtocols: true,
        agreed: true,
      },
      driver_dispatch_sheet: {
        acknowledged: true,
        acknowledgedAt: now,
        read: true,
        understood: true,
        signature: "John A. Smith",
        signedAt: now,
        agreed: true,
      },
      contractor_agreement: {
        acknowledged: true,
        acknowledgedAt: now,
        read: true,
        understood: true,
        signature: "John A. Smith",
        signedAt: now,
        understandsTerms: true,
        agreesToArbitration: true,
        independentContractor: true,
        agreed: true,
      },
      
      // === WHY HIRE YOU (Step 9) - Detailed statement ===
      why_hire_you: {
        whyHireYou: "I am a dedicated, safety-focused professional driver with over 7 years of Class A CDL experience. I take pride in my 1,000,000 mile safe driving record with zero preventable accidents and zero moving violations. I am experienced with dry van, reefer, flatbed, and tanker equipment. I am comfortable with ELD systems, night driving, and team driving situations. I am looking for a company where I can build a long-term career while maintaining a healthy work-life balance.",
        experience: "7+ years OTR and regional experience across multiple equipment types including dry van, refrigerated, flatbed, and tanker. Held positions of increasing responsibility from regional driver to senior company driver.",
        skills: "ELD proficiency (Samsara, KeepTruckin), defensive driving certified, HazMat endorsed, TWIC card holder, bilingual (English/Spanish), excellent navigation and trip planning skills.",
        goals: "To join a reputable company where safety and professionalism are valued, with opportunities for advancement and consistent home time.",
        availability: "Available to start within 2 weeks of hire date",
        desiredPay: "Competitive per-mile rate or percentage pay",
        preferredRoutes: "OTR - 48 states, comfortable with dedicated lanes",
      },
      
      // === ADDITIONAL FLATTENED FIELDS ===
      hired_date: null,
      termination_date: null,
      vehicle_note: "",
      score_card: "",
      driver_salary: "",
      
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
    const SAMPLE_EMAIL = 'john.smith@example.com';
    
    // Check if sample invite already exists for this tenant (stable key: tenant_id + email)
    const { data: existingInvite } = await supabase
      .from('driver_invites')
      .select('id, public_token')
      .eq('tenant_id', tenantId)
      .eq('email', SAMPLE_EMAIL)
      .maybeSingle();
    
    let existingApp = null;
    if (existingInvite) {
      // Check for application linked to this invite
      const { data: app } = await supabase
        .from('applications')
        .select('id')
        .eq('invite_id', existingInvite.id)
        .maybeSingle();
      existingApp = app;
    }
    
    if (existingApp && existingInvite) {
      // Update existing sample application
      console.log(`[create-sample-application] Updating existing sample: ${existingApp.id}`);
      
      const { error: updateError } = await supabase
        .from('applications')
        .update({
          ...sampleData.application,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingApp.id);
      
      if (updateError) {
        console.error('Error updating sample application:', updateError);
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: 'Failed to update sample application',
            details: updateError,
          }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: 'Sample application updated',
          application_id: existingApp.id,
          invite_id: existingInvite.id,
          updated: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // If there's an existing invite without app, delete it to start fresh
    if (existingInvite && !existingApp) {
      console.log(`[create-sample-application] Cleaning up orphan invite: ${existingInvite.id}`);
      await supabase.from('driver_invites').delete().eq('id', existingInvite.id);
    }
    
    // Create new invite
    const { data: inviteData, error: inviteError } = await supabase
      .from('driver_invites')
      .insert({
        email: SAMPLE_EMAIL,
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
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to create sample invite',
          details: inviteError,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to create sample application',
          details: appError,
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
        applicant_email: SAMPLE_EMAIL,
        updated: false,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
    
  } catch (error: any) {
    console.error('[create-sample-application] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error.message || 'Internal server error',
        details: String(error),
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
