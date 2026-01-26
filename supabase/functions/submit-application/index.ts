import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SubmitApplicationRequest {
  public_token: string;
  application_data: Record<string, unknown>;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { public_token, application_data }: SubmitApplicationRequest = await req.json();

    // FAIL CLOSED: Token is required
    if (!public_token || typeof public_token !== 'string' || public_token.length < 32) {
      console.error("Invalid or missing public_token (fail-closed)");
      return new Response(
        JSON.stringify({ error: "Invalid invitation token. Access denied." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service role client for database operations (bypasses RLS)
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Validate invite exists by public_token
    const { data: invite, error: inviteError } = await supabaseService
      .from('driver_invites')
      .select('id, tenant_id, email')
      .eq('public_token', public_token)
      .maybeSingle();

    if (inviteError) {
      console.error("Error validating invite:", inviteError);
      return new Response(
        JSON.stringify({ error: "Failed to validate invitation" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // FAIL CLOSED: Unknown/invalid token = deny
    if (!invite) {
      console.error("Invalid public_token (fail-closed):", public_token.substring(0, 8) + "...");
      return new Response(
        JSON.stringify({ error: "Invalid invitation token. Access denied." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Processing submission for invite ${invite.id} (tenant: ${invite.tenant_id})`);

    // Check if application exists for this invite
    const { data: existingApp, error: appError } = await supabaseService
      .from('applications')
      .select('id, status')
      .eq('invite_id', invite.id)
      .maybeSingle();

    if (appError) {
      console.error("Error checking application:", appError);
      return new Response(
        JSON.stringify({ error: "Failed to check application status" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent re-submission
    if (existingApp?.status === 'submitted' || existingApp?.status === 'approved') {
      return new Response(
        JSON.stringify({ error: "This application has already been submitted" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the final submission payload
    const submissionPayload = {
      ...application_data,
      status: 'submitted',
      submitted_at: new Date().toISOString(),
      current_step: 9,
      // Ensure required JSONB fields exist
      payroll_policy: {},
      drug_alcohol_policy: {},
      driver_dispatch_sheet: {},
      no_rider_policy: {},
      safe_driving_policy: {},
      contractor_agreement: {},
    };

    let applicationId: string;

    if (existingApp) {
      // Update existing application
      const { data: updatedApp, error: updateError } = await supabaseService
        .from('applications')
        .update(submissionPayload)
        .eq('id', existingApp.id)
        .select('id')
        .single();

      if (updateError) {
        console.error("Error updating application:", updateError);
        return new Response(
          JSON.stringify({ error: "Failed to submit application: " + updateError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      applicationId = updatedApp.id;
      console.log(`Updated and submitted application ${applicationId}`);
    } else {
      // Create new application with submission
      const { data: newApp, error: createError } = await supabaseService
        .from('applications')
        .insert({
          ...submissionPayload,
          invite_id: invite.id,
          tenant_id: invite.tenant_id,
        })
        .select('id')
        .single();

      if (createError) {
        console.error("Error creating application:", createError);
        return new Response(
          JSON.stringify({ error: "Failed to create application: " + createError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      applicationId = newApp.id;
      console.log(`Created and submitted application ${applicationId}`);
    }

    // Mark invite as used
    await supabaseService
      .from('driver_invites')
      .update({ application_started_at: new Date().toISOString() })
      .eq('id', invite.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        application_id: applicationId,
        message: "Application submitted successfully"
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in submit-application:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
