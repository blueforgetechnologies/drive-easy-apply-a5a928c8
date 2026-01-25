import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { assertTenantAccess, getServiceClient } from "../_shared/assertTenantAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * Sample Application Data Templates
 * 
 * Creates realistic but FAKE driver applications for testing.
 * All PII values are clearly fake (SSN starts with test patterns, etc.)
 */

type SampleProfile = 'john_smith' | 'john_wick' | 'donald_trump';

const SAMPLE_PROFILES: Record<SampleProfile, { name: string; email: string }> = {
  john_smith: { name: 'John Smith', email: 'john.smith@example.com' },
  john_wick: { name: 'John Wick', email: 'john.wick@example.com' },
  donald_trump: { name: 'Donald Trump', email: 'donald.trump@example.com' },
};

function buildSampleApplicationData(tenantId: string, profile: SampleProfile = 'john_smith') {
  const now = new Date().toISOString();
  const today = now.split('T')[0];
  const profileInfo = SAMPLE_PROFILES[profile];
  
  // Common base for all profiles
  const baseApplication = {
    tenant_id: tenantId,
    status: "submitted",
    driver_status: null,
    current_step: 9,
    submitted_at: now,
    updated_at: now,
    application_date: today,
    hired_date: null,
    termination_date: null,
    vehicle_note: "",
    score_card: "",
    driver_salary: "",
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
  };

  // Profile-specific data
  if (profile === 'john_smith') {
    return {
      invite: { email: profileInfo.email, name: profileInfo.name, tenant_id: tenantId },
      application: {
        ...baseApplication,
        personal_info: {
          firstName: "John", middleName: "Andrew", lastName: "Smith", suffix: "",
          dob: "1989-06-14", ssn: "123-45-6789",
          phone: "(614) 555-0199", alternatePhone: "(614) 555-0188",
          email: profileInfo.email,
          address: "1234 West Broad Street", apartment: "Apt 2B",
          city: "Columbus", state: "OH", zip: "43228", county: "Franklin", country: "United States",
          yearsAtAddress: 3, monthsAtAddress: 6,
          previousAddresses: [
            { address: "567 Maple Avenue", apartment: "", city: "Dublin", state: "OH", zip: "43017", county: "Franklin", country: "United States", fromDate: "2020-01-01", toDate: "2022-06-01", yearsAtAddress: 2, monthsAtAddress: 6 },
          ],
          legallyAuthorized: "Yes", citizenship: "United States Citizen", requiresSponsorship: "No",
          felonyConviction: "No", felonyExplanation: "", misdemeanorConviction: "No", misdemeanorExplanation: "",
          hasTwicCard: true, twicCardNumber: "TWC-12345678", twicExpiration: "2028-10-01",
          hasPassport: true, passportNumber: "P12345678", passportExpiration: "2030-05-20", passportCountry: "United States",
          hasHazmatEndorsement: true, veteranStatus: "No",
          height: "5'11\"", weight: "185 lbs", eyeColor: "Brown", hairColor: "Black",
          gender: "Male", maritalStatus: "Married", dateAvailable: "2025-02-01",
        },
        cell_phone: "(614) 555-0199", home_phone: "(614) 555-0188",
        driver_address: "1234 West Broad Street, Apt 2B, Columbus, OH 43228",
        license_info: {
          licenseNumber: "OH1234567", nameOnLicense: "JOHN ANDREW SMITH", licenseState: "OH", licenseClass: "A",
          endorsements: ["T", "X", "H", "N"], restrictions: "None",
          issuedDate: "2018-03-15", expirationDate: "2027-03-15", yearsExperience: 7,
          hasDotMedicalCert: "yes", nationalRegistryNumber: "NR-9876543210", medicalCardExpiration: "2026-11-30",
          equipmentExperience: ["Dry Van", "Reefer", "Flatbed", "Tanker"],
          straightTruck: true, tractorTrailer: true, doubleTripples: false, tankerExperience: true, hazmatExperience: true,
          suspendedRevoked: "No", deniedLicense: "No", teamDriving: "Yes", willingToTeamDrive: true, willingToRelocate: "Yes",
        },
        driver_record_expiry: "2027-03-15", medical_card_expiry: "2026-11-30", national_registry: "NR-9876543210", restrictions: "None",
        employment_history: [
          { companyName: "Midwest Freight Company LLC", position: "Senior Company Driver", address: "8000 Industrial Parkway, Columbus, OH 43228", phone: "(614) 555-0144", supervisor: "Mike Reynolds", startDate: "2023-01-15", endDate: "2025-01-10", payType: "salary", payRate: "72000", reasonForLeaving: "Seeking better home time" },
          { companyName: "Buckeye Logistics Inc", position: "Over-the-Road Driver", address: "500 Logistics Lane, Grove City, OH 43123", phone: "(614) 555-0177", supervisor: "Sarah Collins", startDate: "2021-02-01", endDate: "2023-01-10", payType: "per-mile", payRate: "0.58", reasonForLeaving: "Company restructured" },
        ],
        driving_history: { accidents: [], accidentsLast3Years: 0, violations: [], violationsLast3Years: 0, dui: "No", failedDrugTest: "No", refusedDrugTest: "No", licenseSuspension: "No", safetyAwards: "1,000,000 Mile Safe Driving Award (2024)" },
        emergency_contacts: [
          { firstName: "Emily", lastName: "Smith", relationship: "Spouse", phone: "(614) 555-0120", email: "emily.smith@example.com", address: "1234 West Broad Street", city: "Columbus", state: "OH", zip: "43228", isPrimary: true },
        ],
        document_upload: { driversLicense: "sample/drivers_license_front.jpg", socialSecurity: "sample/social_security_card.jpg", medicalCard: "sample/medical_card.jpg", mvr: "sample/mvr_report.pdf" },
        direct_deposit: { firstName: "John", lastName: "Smith", email: profileInfo.email, bankName: "Chase Bank", routingNumber: "021000021", checkingNumber: "123456789012", accountType: "personal-checking" },
        bank_name: "Chase Bank", routing_number: "021000021", checking_number: "123456789012", account_name: "John Andrew Smith", account_type: "personal-checking",
        payroll_policy: { acknowledged: true, signature: "John A. Smith", signedAt: now, agreed: true },
        drug_alcohol_policy: { acknowledged: true, signature: "John A. Smith", signedAt: now, agreed: true },
        no_rider_policy: { acknowledged: true, signature: "John A. Smith", signedAt: now, agreed: true },
        safe_driving_policy: { acknowledged: true, signature: "John A. Smith", signedAt: now, agreed: true },
        driver_dispatch_sheet: { acknowledged: true, signature: "John A. Smith", signedAt: now, agreed: true },
        contractor_agreement: { acknowledged: true, signature: "John A. Smith", signedAt: now, agreed: true },
        why_hire_you: { whyHireYou: "I am a dedicated, safety-focused professional driver with over 7 years of Class A CDL experience. I take pride in my 1,000,000 mile safe driving record.", experience: "7+ years OTR experience", skills: "ELD proficiency, defensive driving certified, HazMat endorsed", goals: "Looking for a company where safety is valued" },
      },
    };
  }
  
  if (profile === 'john_wick') {
    return {
      invite: { email: profileInfo.email, name: profileInfo.name, tenant_id: tenantId },
      application: {
        ...baseApplication,
        personal_info: {
          firstName: "John", middleName: "", lastName: "Wick", suffix: "",
          dob: "1975-09-02", ssn: "987-65-4321",
          phone: "(212) 555-0147", alternatePhone: "",
          email: profileInfo.email,
          address: "123 Continental Lane", apartment: "Penthouse",
          city: "New York", state: "NY", zip: "10001", county: "Manhattan", country: "United States",
          yearsAtAddress: 5, monthsAtAddress: 0,
          previousAddresses: [],
          legallyAuthorized: "Yes", citizenship: "United States Citizen", requiresSponsorship: "No",
          felonyConviction: "No", felonyExplanation: "", misdemeanorConviction: "No", misdemeanorExplanation: "",
          hasTwicCard: true, hasPassport: true, hasHazmatEndorsement: true, veteranStatus: "Yes - Marine Corps",
          height: "6'1\"", weight: "180 lbs", eyeColor: "Brown", hairColor: "Black",
          gender: "Male", maritalStatus: "Widowed", dateAvailable: "Immediately",
        },
        cell_phone: "(212) 555-0147", home_phone: "",
        driver_address: "123 Continental Lane, Penthouse, New York, NY 10001",
        license_info: {
          licenseNumber: "NY9876543", nameOnLicense: "JOHN WICK", licenseState: "NY", licenseClass: "A",
          endorsements: ["T", "X", "H", "N", "P"], restrictions: "None",
          issuedDate: "2010-01-01", expirationDate: "2028-01-01", yearsExperience: 15,
          hasDotMedicalCert: "yes", nationalRegistryNumber: "NR-1234567890", medicalCardExpiration: "2027-06-30",
          equipmentExperience: ["Dry Van", "Reefer", "Flatbed", "Tanker", "Car Hauler", "Oversized"],
          straightTruck: true, tractorTrailer: true, doubleTripples: true, tankerExperience: true, hazmatExperience: true,
          suspendedRevoked: "No", deniedLicense: "No", teamDriving: "No", willingToTeamDrive: false, willingToRelocate: "Yes",
        },
        driver_record_expiry: "2028-01-01", medical_card_expiry: "2027-06-30", national_registry: "NR-1234567890", restrictions: "None",
        employment_history: [
          { companyName: "Continental Logistics", position: "Executive Driver", address: "1 Continental Plaza, NYC", phone: "(212) 555-0100", supervisor: "Winston", startDate: "2015-01-01", endDate: "2025-01-01", payType: "salary", payRate: "150000", reasonForLeaving: "Seeking new opportunities" },
          { companyName: "Viggo Transport International", position: "Special Operations Driver", address: "500 Red Circle Drive, NYC", phone: "(212) 555-0200", supervisor: "Viggo Tarasov", startDate: "2010-01-01", endDate: "2014-12-31", payType: "per-load", payRate: "Premium rates", reasonForLeaving: "Contract completed" },
        ],
        driving_history: { accidents: [], accidentsLast3Years: 0, violations: [], violationsLast3Years: 0, dui: "No", failedDrugTest: "No", refusedDrugTest: "No", licenseSuspension: "No", safetyAwards: "Perfect Record - 15 Years Accident Free" },
        emergency_contacts: [
          { firstName: "Winston", lastName: "Manager", relationship: "Friend", phone: "(212) 555-0100", email: "winston@continental.com", address: "1 Continental Plaza", city: "New York", state: "NY", zip: "10001", isPrimary: true },
        ],
        document_upload: { driversLicense: "sample/drivers_license_front.jpg", socialSecurity: "sample/social_security_card.jpg", medicalCard: "sample/medical_card.jpg", mvr: "sample/mvr_report.pdf" },
        direct_deposit: { firstName: "John", lastName: "Wick", email: profileInfo.email, bankName: "Continental Bank", routingNumber: "021000089", checkingNumber: "999888777666", accountType: "personal-checking" },
        bank_name: "Continental Bank", routing_number: "021000089", checking_number: "999888777666", account_name: "John Wick", account_type: "personal-checking",
        payroll_policy: { acknowledged: true, signature: "John Wick", signedAt: now, agreed: true },
        drug_alcohol_policy: { acknowledged: true, signature: "John Wick", signedAt: now, agreed: true },
        no_rider_policy: { acknowledged: true, signature: "John Wick", signedAt: now, agreed: true },
        safe_driving_policy: { acknowledged: true, signature: "John Wick", signedAt: now, agreed: true },
        driver_dispatch_sheet: { acknowledged: true, signature: "John Wick", signedAt: now, agreed: true },
        contractor_agreement: { acknowledged: true, signature: "John Wick", signedAt: now, agreed: true },
        why_hire_you: { whyHireYou: "I am a man of focus, commitment, and sheer will. With 15 years of flawless driving experience, I deliver every load on time, every time. I never break a promise.", experience: "15+ years executive and specialized transport", skills: "Precision driving, tactical awareness, extreme weather operations, VIP transport", goals: "Looking for challenging assignments that require absolute reliability" },
      },
    };
  }
  
  if (profile === 'donald_trump') {
    return {
      invite: { email: profileInfo.email, name: profileInfo.name, tenant_id: tenantId },
      application: {
        ...baseApplication,
        personal_info: {
          firstName: "Donald", middleName: "John", lastName: "Trump", suffix: "",
          dob: "1946-06-14", ssn: "000-00-0001",
          phone: "(212) 555-4545", alternatePhone: "(561) 555-2024",
          email: profileInfo.email,
          address: "725 Fifth Avenue", apartment: "Trump Tower",
          city: "New York", state: "NY", zip: "10022", county: "Manhattan", country: "United States",
          yearsAtAddress: 40, monthsAtAddress: 0,
          previousAddresses: [
            { address: "1100 S Ocean Blvd", apartment: "Mar-a-Lago", city: "Palm Beach", state: "FL", zip: "33480", county: "Palm Beach", country: "United States", fromDate: "1985-01-01", toDate: "Present", yearsAtAddress: 39, monthsAtAddress: 0 },
          ],
          legallyAuthorized: "Yes", citizenship: "United States Citizen", requiresSponsorship: "No",
          felonyConviction: "No", felonyExplanation: "", misdemeanorConviction: "No", misdemeanorExplanation: "",
          hasTwicCard: false, hasPassport: true, hasHazmatEndorsement: false, veteranStatus: "No",
          height: "6'3\"", weight: "215 lbs", eyeColor: "Blue", hairColor: "Blonde",
          gender: "Male", maritalStatus: "Married", dateAvailable: "After current commitments",
        },
        cell_phone: "(212) 555-4545", home_phone: "(561) 555-2024",
        driver_address: "725 Fifth Avenue, Trump Tower, New York, NY 10022",
        license_info: {
          licenseNumber: "NY0000001", nameOnLicense: "DONALD JOHN TRUMP", licenseState: "NY", licenseClass: "A",
          endorsements: ["T", "P"], restrictions: "Gold plated trucks only",
          issuedDate: "2000-01-01", expirationDate: "2030-01-01", yearsExperience: 2,
          hasDotMedicalCert: "yes", nationalRegistryNumber: "NR-0000000001", medicalCardExpiration: "2027-12-31",
          equipmentExperience: ["Dry Van", "Reefer", "Gold-plated Flatbed"],
          straightTruck: true, tractorTrailer: true, doubleTripples: false, tankerExperience: false, hazmatExperience: false,
          suspendedRevoked: "No", deniedLicense: "No", teamDriving: "No", willingToTeamDrive: false, willingToRelocate: "Only to better locations",
        },
        driver_record_expiry: "2030-01-01", medical_card_expiry: "2027-12-31", national_registry: "NR-0000000001", restrictions: "Gold plated trucks only",
        employment_history: [
          { companyName: "Trump Organization", position: "Chairman & CEO", address: "725 Fifth Avenue, NYC", phone: "(212) 555-1234", supervisor: "Self", startDate: "1971-01-01", endDate: "Present", payType: "salary", payRate: "Tremendous", reasonForLeaving: "Still employed" },
          { companyName: "United States Government", position: "45th President", address: "1600 Pennsylvania Avenue, Washington DC", phone: "(202) 555-1600", supervisor: "The American People", startDate: "2017-01-20", endDate: "2021-01-20", payType: "salary", payRate: "400000", reasonForLeaving: "Term ended" },
        ],
        driving_history: { accidents: [], accidentsLast3Years: 0, violations: [], violationsLast3Years: 0, dui: "No", failedDrugTest: "No", refusedDrugTest: "No", licenseSuspension: "No", safetyAwards: "Tremendous Safety Record - The Best" },
        emergency_contacts: [
          { firstName: "Melania", lastName: "Trump", relationship: "Spouse", phone: "(212) 555-4546", email: "melania@example.com", address: "725 Fifth Avenue", city: "New York", state: "NY", zip: "10022", isPrimary: true },
        ],
        document_upload: { driversLicense: "sample/drivers_license_front.jpg", socialSecurity: "sample/social_security_card.jpg", medicalCard: "sample/medical_card.jpg", mvr: "sample/mvr_report.pdf" },
        direct_deposit: { firstName: "Donald", lastName: "Trump", email: profileInfo.email, bankName: "Deutsche Bank", routingNumber: "021000018", checkingNumber: "000000000001", accountType: "business-checking" },
        bank_name: "Deutsche Bank", routing_number: "021000018", checking_number: "000000000001", account_name: "Donald John Trump", account_type: "business-checking",
        payroll_policy: { acknowledged: true, signature: "Donald J. Trump", signedAt: now, agreed: true },
        drug_alcohol_policy: { acknowledged: true, signature: "Donald J. Trump", signedAt: now, agreed: true },
        no_rider_policy: { acknowledged: true, signature: "Donald J. Trump", signedAt: now, agreed: true },
        safe_driving_policy: { acknowledged: true, signature: "Donald J. Trump", signedAt: now, agreed: true },
        driver_dispatch_sheet: { acknowledged: true, signature: "Donald J. Trump", signedAt: now, agreed: true },
        contractor_agreement: { acknowledged: true, signature: "Donald J. Trump", signedAt: now, agreed: true },
        why_hire_you: { whyHireYou: "I am the best driver. Nobody drives better than me. I have the best trucks, the best routes, and I always deliver BIGLY. Many people are saying I'm the greatest driver in the history of trucking. Believe me.", experience: "Tremendous experience in moving things", skills: "The Art of the Drive, negotiating the best fuel prices, making trucking great again", goals: "To make your company great again" },
      },
    };
  }

  // Fallback to John Smith
  return buildSampleApplicationData(tenantId, 'john_smith');
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const { tenant_id, profile = 'john_smith' } = await req.json().catch(() => ({}));
    
    // Validate profile
    const validProfiles: SampleProfile[] = ['john_smith', 'john_wick', 'donald_trump'];
    const selectedProfile: SampleProfile = validProfiles.includes(profile) ? profile : 'john_smith';
    const profileInfo = SAMPLE_PROFILES[selectedProfile];
    
    // SECURITY: Validate tenant access via JWT
    const accessResult = await assertTenantAccess(authHeader, tenant_id);
    if (!accessResult.allowed) {
      return accessResult.response!;
    }
    
    const tenantId = accessResult.tenant_id!;
    const userId = accessResult.user_id!;
    
    console.log(`[create-sample-application] Creating sample "${selectedProfile}" for tenant ${tenantId} by user ${userId}`);
    
    // Get service client for DB operations
    const supabase = getServiceClient();
    
    // Verify user is platform admin OR has internal release channel
    const { data: userProfile } = await supabase
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', userId)
      .maybeSingle();
      
    const { data: tenant } = await supabase
      .from('tenants')
      .select('release_channel')
      .eq('id', tenantId)
      .maybeSingle();
    
    const isPlatformAdmin = userProfile?.is_platform_admin === true;
    const isInternalChannel = tenant?.release_channel === 'internal';
    
    if (!isPlatformAdmin && !isInternalChannel) {
      console.log('[create-sample-application] Access denied - not internal');
      return new Response(
        JSON.stringify({ error: 'This feature is only available to internal users' }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Build the complete sample data for selected profile
    const sampleData = buildSampleApplicationData(tenantId, selectedProfile);
    const SAMPLE_EMAIL = profileInfo.email;
    
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
        applicant_name: profileInfo.name,
        applicant_email: SAMPLE_EMAIL,
        profile: selectedProfile,
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
