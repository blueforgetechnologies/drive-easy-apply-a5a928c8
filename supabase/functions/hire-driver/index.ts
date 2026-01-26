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
    const { application_id, hired_date } = await req.json();

    if (!application_id) {
      return new Response(
        JSON.stringify({ success: false, error: "Missing application_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load the application
    const { data: application, error: appError } = await supabase
      .from("applications")
      .select("id, tenant_id, status, driver_status, personal_info")
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

    // Check if application has completed training (new workflow) or is approved (legacy)
    if (application.status !== "training_completed" && application.status !== "approved") {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Cannot hire: application status is "${application.status}". Must complete training first.` 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already hired
    if (application.driver_status === "pending" || application.driver_status === "active") {
      return new Response(
        JSON.stringify({ 
          success: true, 
          message: "Driver already hired", 
          already_hired: true 
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Update application: set driver_status = pending and hired_date
    const { error: updateError } = await supabase
      .from("applications")
      .update({
        driver_status: "pending",
        hired_date: hired_date || new Date().toISOString().split('T')[0],
        updated_at: new Date().toISOString(),
      })
      .eq("id", application_id);

    if (updateError) {
      console.error("Failed to hire driver:", updateError);
      return new Response(
        JSON.stringify({ success: false, error: "Failed to hire driver", details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Log the hire action
    const personalInfo = application.personal_info || {};
    const driverName = `${personalInfo.firstName || ""} ${personalInfo.lastName || ""}`.trim();

    await supabase.from("audit_logs").insert({
      tenant_id: application.tenant_id,
      entity_type: "application",
      entity_id: application_id,
      action: "hire",
      user_id: userId,
      notes: `${driverName} has been hired. Driver status set to pending (awaiting onboarding/activation).`,
    });

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `${driverName} has been hired and added to Pending Drivers.`,
        driver_name: driverName,
        driver_status: "pending"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in hire-driver:", error);
    return new Response(
      JSON.stringify({ success: false, error: error.message || "Internal server error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
