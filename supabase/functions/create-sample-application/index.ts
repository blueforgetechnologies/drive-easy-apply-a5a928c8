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
      driver_status: null, // Stays null until admin approves
      current_step: 9, // All steps complete
      submitted_at: now,
      updated_at: now,
      application_date: today,
      
      // === PERSONAL INFO (Step 1) ===
      personal_info: {
        firstName: "John",
        middleName: "A",
        lastName: "Smith",
        dob: "1989-06-14",
        ssn: "123-45-6789",
        phone: "(614) 555-0199",
        email: "john.smith@example.com",
        address: "1234 West Broad St",
        city: "Columbus",
        state: "OH",
        zip: "43228",
        legallyAuthorized: "Yes",
        felonyConviction: "No",
        hasTwicCard: true,
        twicExpiration: "2028-10-01",
        hasPassport: true,
        passportExpiration: "2030-05-20",
      },
      // Mirror flattened columns
      cell_phone: "(614) 555-0199",
      home_phone: "",
      driver_address: "1234 West Broad St, Columbus, OH 43228",
      
      // === LICENSE INFO (Step 2) ===
      license_info: {
        licenseNumber: "OH1234567",
        licenseState: "OH",
        licenseClass: "A",
        endorsements: ["T", "X"],
        expirationDate: "2027-03-15",
        yearsExperience: 7,
        medicalCardExpiration: "2026-11-30",
        equipmentExperience: ["Dry Van", "Reefer", "Flatbed"],
        suspendedRevoked: "No",
        deniedLicense: "No",
        teamDriving: "Yes",
      },
      // Mirror flattened
      driver_record_expiry: "2027-03-15",
      medical_card_expiry: "2026-11-30",
      green_card_expiry: null,
      work_permit_expiry: null,
      national_registry: null,
      restrictions: null,
      
      // === EMPLOYMENT HISTORY (Step 3) - 3 employers covering 6 years ===
      employment_history: [
        {
          companyName: "Midwest Freight Co",
          position: "Company Driver",
          address: "8000 Industrial Pkwy, Columbus, OH 43228",
          phone: "(614) 555-0144",
          supervisor: "Mike Reynolds",
          startDate: "2023-01-01",
          endDate: "2025-01-01",
          equipmentDriven: "Dry Van",
          reasonForLeaving: "Better opportunity",
        },
        {
          companyName: "Buckeye Logistics",
          position: "OTR Driver",
          address: "500 Logistics Ln, Grove City, OH 43123",
          phone: "(614) 555-0177",
          supervisor: "Sarah Collins",
          startDate: "2021-01-01",
          endDate: "2023-01-01",
          equipmentDriven: "Reefer",
          reasonForLeaving: "Schedule change",
        },
        {
          companyName: "Central Ohio Transport",
          position: "Regional Driver",
          address: "2000 Transit Dr, Columbus, OH 43207",
          phone: "(614) 555-0133",
          supervisor: "James Ortega",
          startDate: "2019-01-01",
          endDate: "2021-01-01",
          equipmentDriven: "Flatbed",
          reasonForLeaving: "Company downsizing",
        },
      ],
      
      // === DRIVING HISTORY (Step 4) - Clean record with safety award ===
      driving_history: {
        accidents: [],
        violations: [],
        dui: "No",
        failedDrugTest: "No",
        licenseSuspension: "No",
        safetyAwards: "1,000,000 Mile Safe Driving Award (2024)",
      },
      
      // === EMERGENCY CONTACTS (Step 5) ===
      emergency_contacts: [
        {
          firstName: "Emily",
          lastName: "Smith",
          relationship: "Spouse",
          phone: "(614) 555-0120",
          address: "1234 West Broad St",
          city: "Columbus",
          state: "OH",
          zip: "43228",
        },
      ],
      
      // === DOCUMENT UPLOAD (Step 6) - All required + extras ===
      document_upload: {
        driversLicense: true,
        socialSecurity: true,
        medicalCard: true,
        mvr: true,
        other: ["twic_card.png", "passport.png"],
      },
      
      // === DIRECT DEPOSIT (Step 7) ===
      direct_deposit: {
        firstName: "John",
        lastName: "Smith",
        email: "john.smith@example.com",
        bankName: "Chase",
        accountType: "Checking",
        routingNumber: "021000021",
        accountNumber: "123456789",
        cashAppCashtag: "$JohnSmithTrucking",
      },
      // Mirror flattened columns
      bank_name: "Chase",
      routing_number: "021000021",
      checking_number: "123456789",
      account_name: "John Smith",
      account_type: "Checking",
      
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
        statement: "Safety-first driver with 7 years CDL-A experience across dry van, reefer, and flatbed. Strong on-time performance, clean record, and comfortable with ELDs and night driving.",
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
