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
    
    // FULL APPLICATION DATA - Every field filled
    application: {
      tenant_id: tenantId,
      status: "submitted",
      driver_status: "pending",
      current_step: 9, // All steps complete
      submitted_at: now,
      updated_at: now,
      application_date: today,
      
      // === PERSONAL INFO (Step 1) ===
      personal_info: {
        firstName: "John",
        middleName: "A",
        lastName: "Smith",
        dob: "1988-04-12",
        ssn: "000-00-1234", // Clearly fake SSN (000 prefix is invalid)
        phone: "(555) 212-4455",
        email: "john.smith@example.com",
        address: "742 Evergreen Terrace",
        city: "Columbus",
        state: "OH",
        zip: "43215",
        legallyAuthorized: "yes",
        felonyConviction: "no",
        felonyDetails: "",
        hasTwicCard: "yes",
        twicExpiration: "2028-08-31",
        hasPassport: "yes",
        passportExpiration: "2030-05-20",
        canCrossBorder: "yes",
        preferredContact: "phone",
        emergencyMedicalInfo: "No known allergies",
      },
      // Mirror flattened columns
      cell_phone: "(555) 212-4455",
      home_phone: "",
      driver_address: "742 Evergreen Terrace, Columbus, OH, 43215",
      
      // === LICENSE INFO (Step 2) ===
      license_info: {
        licenseNumber: "SMI1234567",
        licenseState: "OH",
        licenseClass: "A",
        endorsements: ["T", "N"],
        expirationDate: "2027-11-30",
        yearsExperience: 7,
        deniedLicense: "no",
        deniedDetails: "",
        suspendedRevoked: "no",
        suspendedDetails: "",
        medicalCardExpiration: "2026-09-15",
        equipmentExperience: ["Dry Van", "Reefer", "Flatbed"],
        shifts: ["day", "night"],
        teamDriving: "yes",
        hazmatTraining: "no",
      },
      // Mirror flattened
      driver_record_expiry: "2027-11-30",
      medical_card_expiry: "2026-09-15",
      green_card_expiry: null,
      work_permit_expiry: null,
      national_registry: null,
      restrictions: null,
      
      // === EMPLOYMENT HISTORY (Step 3) - 3 employers covering 3+ years ===
      employment_history: [
        {
          companyName: "Buckeye Freight Lines",
          position: "OTR Driver",
          address: "1250 Industrial Pkwy, Dayton, OH 45402",
          phone: "(555) 410-2201",
          supervisor: "Mark Reynolds",
          startDate: "2023-02-01",
          endDate: "2026-01-10",
          reasonForLeaving: "Seeking a more consistent lane and home time",
          equipmentDriven: "Dry Van",
          milesPerWeek: 2800,
          payType: "cpm",
        },
        {
          companyName: "Midwest Logistics Group",
          position: "Regional Driver",
          address: "9800 Logistics Dr, Indianapolis, IN 46241",
          phone: "(555) 338-9022",
          supervisor: "Tanya Brooks",
          startDate: "2021-03-15",
          endDate: "2023-01-20",
          reasonForLeaving: "Company restructuring / route changes",
          equipmentDriven: "Reefer",
          milesPerWeek: 2400,
          payType: "hourly",
        },
        {
          companyName: "River City Transport",
          position: "Local Driver",
          address: "450 Riverfront Ave, Louisville, KY 40202",
          phone: "(555) 772-1188",
          supervisor: "Chris Alvarez",
          startDate: "2020-01-05",
          endDate: "2021-03-01",
          reasonForLeaving: "Moved to pursue regional/OTR opportunities",
          equipmentDriven: "Flatbed",
          milesPerWeek: 1800,
          payType: "hourly",
        },
      ],
      
      // === DRIVING HISTORY (Step 4) - 1 accident, 1 violation ===
      driving_history: {
        accidents: [
          {
            date: "2024-06-18",
            location: "I-70 near Richmond, IN",
            description: "Minor rear-end incident in stop-and-go traffic; no injuries; property damage only",
            fatalities: 0,
            injuries: 0,
            preventable: "no",
            vehicleTowed: "no",
          },
        ],
        violations: [
          {
            date: "2023-09-03",
            location: "Springfield, OH",
            violation: "Speeding 9 mph over limit (non-CMV)",
            penalty: "Fine paid; no suspension",
          },
        ],
        dui: "no",
        failedDrugTest: "no",
        licenseSuspension: "no",
        safetyAwards: "2022 Safe Driver Recognition (Midwest Logistics Group)",
      },
      
      // === EMERGENCY CONTACTS (Step 5) - 2 contacts with full addresses ===
      emergency_contacts: [
        {
          firstName: "Emily",
          lastName: "Smith",
          relationship: "Spouse",
          phone: "(555) 333-9012",
          address: "742 Evergreen Terrace",
          city: "Columbus",
          state: "OH",
          zip: "43215",
        },
        {
          firstName: "Robert",
          lastName: "Smith",
          relationship: "Father",
          phone: "(555) 441-7788",
          address: "18 Maple Ridge Rd",
          city: "Dublin",
          state: "OH",
          zip: "43017",
        },
      ],
      
      // === DOCUMENT UPLOAD (Step 6) - All required + 2 extras ===
      document_upload: {
        driversLicense: "storage://driver-documents/john-smith/drivers-license.jpg",
        socialSecurity: "storage://driver-documents/john-smith/ss-card.jpg",
        medicalCard: "storage://driver-documents/john-smith/medical-card.jpg",
        other: [
          "storage://driver-documents/john-smith/twic-card.jpg",
          "storage://driver-documents/john-smith/resume.pdf",
        ],
      },
      
      // === DIRECT DEPOSIT (Step 7) - Full banking + CashApp ===
      direct_deposit: {
        firstName: "John",
        lastName: "Smith",
        businessName: "",
        email: "john.smith@example.com",
        bankName: "First National Test Bank",
        routingNumber: "021000021", // Fake but valid format
        accountNumber: "000123456789", // Clearly fake (starts with 000)
        checkingNumber: "000123456789",
        accountType: "checking",
        cashAppCashtag: "$JohnSmithDriver",
      },
      // Mirror flattened columns
      bank_name: "First National Test Bank",
      routing_number: "021000021",
      checking_number: "000123456789",
      account_name: "John Smith",
      account_type: "checking",
      
      // === POLICIES (Steps 8a-8e) ===
      payroll_policy: {
        acknowledged: true,
        acknowledgedAt: now,
        signature: "John A. Smith",
        signedAt: now,
      },
      drug_alcohol_policy: {
        acknowledged: true,
        acknowledgedAt: now,
        signature: "John A. Smith",
        signedAt: now,
        understandsTesting: true,
        agreesToComply: true,
      },
      no_rider_policy: {
        acknowledged: true,
        acknowledgedAt: now,
        signature: "John A. Smith",
        signedAt: now,
      },
      safe_driving_policy: {
        acknowledged: true,
        acknowledgedAt: now,
        signature: "John A. Smith",
        signedAt: now,
        understandsExpectations: true,
      },
      driver_dispatch_sheet: {
        acknowledged: true,
        acknowledgedAt: now,
        signature: "John A. Smith",
        signedAt: now,
      },
      contractor_agreement: {
        acknowledged: true,
        acknowledgedAt: now,
        signature: "John A. Smith",
        signedAt: now,
        understandsTerms: true,
        agreesToArbitration: true,
      },
      
      // === WHY HIRE YOU (Step 9) ===
      why_hire_you: {
        statement: "I'm a safety-first CDL-A driver with 7 years of experience across OTR and regional lanes. I communicate clearly, keep clean logs, and take pride in being reliable and on-time. I'm looking for a long-term home where I can run consistent freight and contribute to a strong safety culture.",
      },
      
      // === ADDITIONAL FLATTENED FIELDS ===
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
