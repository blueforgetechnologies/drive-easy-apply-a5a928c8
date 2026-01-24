import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SaveStepRequest {
  public_token: string;
  step_key: string;
  current_step: number;
  payload: Record<string, unknown>;
}

const VALID_STEP_KEYS = [
  'personal_info',
  'license_info',
  'employment_history',
  'driving_history',
  'emergency_contacts',
  'document_upload',
  'direct_deposit',
  'why_hire_you',
] as const;

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { public_token, step_key, current_step, payload }: SaveStepRequest = await req.json();

    // FAIL CLOSED: Token is required
    if (!public_token || typeof public_token !== 'string' || public_token.length < 32) {
      console.error("Invalid or missing public_token (fail-closed)");
      return new Response(
        JSON.stringify({ error: "Invalid invitation token. Access denied." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!step_key || !VALID_STEP_KEYS.includes(step_key as any)) {
      return new Response(
        JSON.stringify({ error: `Invalid step_key. Must be one of: ${VALID_STEP_KEYS.join(', ')}` }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof current_step !== 'number' || current_step < 1 || current_step > 9) {
      return new Response(
        JSON.stringify({ error: "current_step must be a number between 1 and 9" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service role client for database operations
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Validate invite exists by public_token (server-side token validation - fail closed)
    const { data: invite, error: inviteError } = await supabaseService
      .from('driver_invites')
      .select('id, tenant_id, email, application_started_at')
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

    // Check if application exists for this invite
    const { data: existingApp, error: appError } = await supabaseService
      .from('applications')
      .select('id, tenant_id, status')
      .eq('invite_id', invite.id)
      .maybeSingle();

    if (appError) {
      console.error("Error checking application:", appError);
      return new Response(
        JSON.stringify({ error: "Failed to check application status" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!existingApp) {
      console.error("No application found for invite (token validated)");
      return new Response(
        JSON.stringify({ error: "Application not found for this invitation" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Prevent updates to submitted applications
    if (existingApp.status === 'submitted' || existingApp.status === 'approved' || existingApp.status === 'rejected') {
      return new Response(
        JSON.stringify({ error: "Cannot modify a submitted application" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build the update object dynamically based on step_key
    const updateData: Record<string, unknown> = {
      current_step,
      status: 'in_progress',
    };

    // Map step_key to the appropriate JSONB column
    updateData[step_key] = payload;

    // Also extract top-level fields for driver management if applicable
    if (step_key === 'personal_info' && payload) {
      const personalInfo = payload as any;
      if (personalInfo.phone) updateData.cell_phone = personalInfo.phone;
      if (personalInfo.address || personalInfo.city || personalInfo.state || personalInfo.zip) {
        updateData.driver_address = [
          personalInfo.address,
          personalInfo.city,
          personalInfo.state,
          personalInfo.zip
        ].filter(Boolean).join(', ');
      }
    }

    if (step_key === 'direct_deposit' && payload) {
      const deposit = payload as any;
      if (deposit.bankName) updateData.bank_name = deposit.bankName;
      if (deposit.routingNumber) updateData.routing_number = deposit.routingNumber;
      if (deposit.accountNumber || deposit.checkingNumber) {
        updateData.checking_number = deposit.accountNumber || deposit.checkingNumber;
      }
      if (deposit.accountType) updateData.account_type = deposit.accountType;
      if (deposit.firstName || deposit.lastName) {
        updateData.account_name = [deposit.firstName, deposit.lastName].filter(Boolean).join(' ');
      }
    }

    if (step_key === 'license_info' && payload) {
      const license = payload as any;
      if (license.licenseExpiration || license.expirationDate) {
        updateData.driver_record_expiry = license.licenseExpiration || license.expirationDate;
      }
      if (license.medicalCardExpiration) {
        updateData.medical_card_expiry = license.medicalCardExpiration;
      }
    }

    // Mark invite as started if first save
    if (!invite.application_started_at) {
      await supabaseService
        .from('driver_invites')
        .update({ application_started_at: new Date().toISOString() })
        .eq('id', invite.id);
    }

    // Update the application
    const { data: updatedApp, error: updateError } = await supabaseService
      .from('applications')
      .update(updateData)
      .eq('id', existingApp.id)
      .select('id, current_step, updated_at')
      .single();

    if (updateError) {
      console.error("Error updating application:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to save application progress" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Saved step ${step_key} (step ${current_step}) for application ${existingApp.id} (token validated)`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        application_id: updatedApp.id,
        current_step: updatedApp.current_step,
        updated_at: updatedApp.updated_at
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in save-application-step:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
