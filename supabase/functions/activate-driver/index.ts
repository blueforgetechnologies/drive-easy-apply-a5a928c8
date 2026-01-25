import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface OnboardingCheck {
  category: string;
  field: string;
  label: string;
  present: boolean;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get user from auth header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user and get their tenant
    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !userData.user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid or expired token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const userId = userData.user.id;

    // Get request body
    const { application_id } = await req.json();

    if (!application_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing application_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load the application with all relevant fields
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select(`
        id, tenant_id, status, driver_status, 
        personal_info, license_info, document_upload, direct_deposit,
        current_step, submitted_at
      `)
      .eq("id", application_id)
      .single();

    if (appError || !application) {
      return new Response(
        JSON.stringify({ success: false, error: "Application not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify user has access to this tenant
    const { data: tenantUser, error: tenantError } = await supabase
      .from("tenant_users")
      .select("role")
      .eq("user_id", userId)
      .eq("tenant_id", application.tenant_id)
      .single();

    if (tenantError || !tenantUser) {
      return new Response(
        JSON.stringify({ success: false, error: "Access denied - not authorized for this tenant" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Validate current state: must be approved with driver_status = pending
    if (application.status !== "approved") {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Cannot activate - application status is "${application.status}", must be "approved"` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (application.driver_status !== "pending") {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Cannot activate - driver status is "${application.driver_status}", must be "pending"` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Compute onboarding completeness (using existing fields only, no migrations)
    const pi = application.personal_info || {};
    const li = application.license_info || {};
    const docs = application.document_upload || {};
    const dd = application.direct_deposit || {};

    const checks: OnboardingCheck[] = [];
    
    // Personal Info - Required fields
    checks.push({ category: "Personal", field: "firstName", label: "First Name", present: !!pi.firstName });
    checks.push({ category: "Personal", field: "lastName", label: "Last Name", present: !!pi.lastName });
    checks.push({ category: "Personal", field: "email", label: "Email", present: !!pi.email });
    checks.push({ category: "Personal", field: "phone", label: "Phone", present: !!pi.phone });
    checks.push({ category: "Personal", field: "dob", label: "Date of Birth", present: !!pi.dob });
    checks.push({ category: "Personal", field: "address", label: "Address", present: !!(pi.address || pi.streetAddress) });

    // License Info - Required fields
    checks.push({ category: "License", field: "licenseNumber", label: "License Number", present: !!li.licenseNumber });
    checks.push({ category: "License", field: "licenseState", label: "License State", present: !!li.licenseState });
    checks.push({ category: "License", field: "expirationDate", label: "License Expiration", present: !!li.expirationDate });

    // Documents - Required uploads
    checks.push({ category: "Documents", field: "driversLicense", label: "Driver's License Copy", present: !!docs.driversLicense });
    checks.push({ category: "Documents", field: "socialSecurity", label: "Social Security Card", present: !!docs.socialSecurity });
    checks.push({ category: "Documents", field: "medicalCard", label: "Medical Card", present: !!docs.medicalCard });
    checks.push({ category: "Documents", field: "mvr", label: "Motor Vehicle Record (MVR)", present: !!docs.mvr });

    // Financial - Required fields (masked for security)
    checks.push({ category: "Financial", field: "bankName", label: "Bank Name", present: !!dd.bankName });
    checks.push({ category: "Financial", field: "accountNumber", label: "Account Number", present: !!dd.accountNumber });
    checks.push({ category: "Financial", field: "routingNumber", label: "Routing Number", present: !!dd.routingNumber });

    // Identify missing items
    const missingItems = checks.filter(c => !c.present);

    if (missingItems.length > 0) {
      // Group by category for better readability
      const missingByCategory: Record<string, string[]> = {};
      missingItems.forEach(item => {
        if (!missingByCategory[item.category]) {
          missingByCategory[item.category] = [];
        }
        missingByCategory[item.category].push(item.label);
      });

      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Onboarding incomplete - missing required items",
          missing_items: missingItems.map(m => ({ category: m.category, label: m.label })),
          missing_by_category: missingByCategory,
          onboarding_complete: false
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // All checks passed - activate the driver
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        driver_status: "active",
        updated_at: new Date().toISOString(),
      })
      .eq("id", application_id);

    if (updateError) {
      console.error("Failed to activate driver:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to activate driver", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the activation
    const driverName = `${pi.firstName || ""} ${pi.lastName || ""}`.trim();

    await supabase.from("audit_logs").insert({
      tenant_id: application.tenant_id,
      entity_type: "driver",
      entity_id: application_id,
      action: "activate",
      user_id: userId,
      notes: `Driver ${driverName} activated - onboarding complete. All required fields verified.`,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${driverName} is now an Active driver.`,
        driver_name: driverName,
        driver_status: "active",
        onboarding_complete: true
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in activate-driver:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
