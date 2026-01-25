import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LoadApplicationRequest {
  public_token: string;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { public_token }: LoadApplicationRequest = await req.json();

    // FAIL CLOSED: Token is required
    if (!public_token || typeof public_token !== 'string' || public_token.length < 32) {
      console.error("Invalid or missing public_token (fail-closed)");
      return new Response(
        JSON.stringify({ error: "Invalid invitation token. Access denied." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create service role client
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Validate invite exists by public_token (server-side token validation - fail closed)
    const { data: invite, error: inviteError } = await supabaseService
      .from('driver_invites')
      .select('id, tenant_id, email, name, application_started_at, public_token')
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

    // Load existing application for this invite
    const { data: application, error: appError } = await supabaseService
      .from('applications')
      .select(`
        id,
        tenant_id,
        current_step,
        status,
        personal_info,
        license_info,
        employment_history,
        driving_history,
        emergency_contacts,
        document_upload,
        direct_deposit,
        why_hire_you,
        submitted_at,
        updated_at
      `)
      .eq('invite_id', invite.id)
      .maybeSingle();

    if (appError) {
      console.error("Error loading application:", appError);
      return new Response(
        JSON.stringify({ error: "Failed to load application" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // If no application exists yet, return empty state with invite info
    if (!application) {
      // Fetch tenant branding even when no application exists
      const { data: companyProfileForNew } = await supabaseService
        .from('company_profile')
        .select('company_name, logo_url')
        .eq('tenant_id', invite.tenant_id)
        .maybeSingle();

      return new Response(
        JSON.stringify({
          success: true,
          invite: {
            id: invite.id,
            tenant_id: invite.tenant_id,
            email: invite.email,
            name: invite.name,
          },
          application: null,
          company: companyProfileForNew ? {
            name: companyProfileForNew.company_name,
            logo_url: companyProfileForNew.logo_url,
          } : null,
          can_edit: true,
        }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if already submitted
    const isSubmitted = application.status === 'submitted' || 
                        application.status === 'approved' || 
                        application.status === 'rejected' ||
                        application.submitted_at !== null;

    // Fetch tenant branding for display
    const { data: companyProfile } = await supabaseService
      .from('company_profile')
      .select('company_name, logo_url')
      .eq('tenant_id', application.tenant_id)
      .maybeSingle();

    console.log(`Loaded application ${application.id} for invite (token validated), step ${application.current_step}`);

    return new Response(
      JSON.stringify({
        success: true,
        invite: {
          id: invite.id,
          tenant_id: invite.tenant_id,
          email: invite.email,
          name: invite.name,
        },
        application: {
          id: application.id,
          current_step: application.current_step || 1,
          status: application.status,
          personal_info: application.personal_info,
          license_info: application.license_info,
          employment_history: application.employment_history,
          driving_history: application.driving_history,
          emergency_contacts: application.emergency_contacts,
          document_upload: application.document_upload,
          direct_deposit: application.direct_deposit,
          why_hire_you: application.why_hire_you,
          updated_at: application.updated_at,
        },
        company: companyProfile ? {
          name: companyProfile.company_name,
          logo_url: companyProfile.logo_url,
        } : null,
        can_edit: !isSubmitted,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error in load-application:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
};

serve(handler);
