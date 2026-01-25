import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

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

    // Load the application
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("id, tenant_id, status, driver_status, personal_info, license_info, submitted_at, current_step")
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

    // Check if application is in a valid state to approve
    const validStatuses = ["submitted", "pending", "in_progress"];
    if (!validStatuses.includes(application.status || "")) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Cannot approve application with status: ${application.status}. Must be submitted/pending.` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Already approved?
    if (application.status === "approved") {
      return new Response(
        JSON.stringify({ success: true, message: "Application already approved", already_approved: true }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update application: status = approved, driver_status = pending (pending onboarding)
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        status: "approved",
        driver_status: "pending",  // Pending = approved but awaiting onboarding completion
        updated_at: new Date().toISOString(),
      })
      .eq("id", application_id);

    if (updateError) {
      console.error("Failed to update application:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to approve application", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the approval action
    const personalInfo = application.personal_info || {};
    const driverName = `${personalInfo.firstName || ""} ${personalInfo.lastName || ""}`.trim();

    await supabase.from("audit_logs").insert({
      tenant_id: application.tenant_id,
      entity_type: "application",
      entity_id: application_id,
      action: "approve",
      user_id: userId,
      notes: `Application approved for ${driverName}. Driver status set to pending (awaiting onboarding).`,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Application approved. ${driverName} is now pending onboarding.`,
        driver_name: driverName,
        driver_status: "pending"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in approve-application:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
