import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { assertTenantAccess } from "../_shared/assertTenantAccess.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface ResendInviteRequest {
  invite_id?: string;
  application_id?: string;
}

/**
 * Resend an existing driver invite email.
 * 
 * SECURITY: 
 * - Does NOT create new invite or application records
 * - Loads existing invite from DB and validates tenant access
 * - Resends the same public_token link
 */
const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { invite_id, application_id }: ResendInviteRequest = await req.json();

    if (!invite_id && !application_id) {
      return new Response(
        JSON.stringify({ error: "Either invite_id or application_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    let targetInviteId = invite_id;

    // If application_id provided, lookup the invite_id from the application
    if (!targetInviteId && application_id) {
      const { data: app, error: appError } = await supabaseService
        .from("applications")
        .select("invite_id, tenant_id")
        .eq("id", application_id)
        .maybeSingle();

      if (appError || !app) {
        console.error("Application not found:", appError);
        return new Response(
          JSON.stringify({ error: "Application not found" }),
          { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      if (!app.invite_id) {
        return new Response(
          JSON.stringify({ error: "Application has no associated invite" }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      targetInviteId = app.invite_id;
    }

    // Load the existing invite
    const { data: invite, error: inviteError } = await supabaseService
      .from("driver_invites")
      .select("id, email, name, public_token, tenant_id")
      .eq("id", targetInviteId)
      .maybeSingle();

    if (inviteError || !invite) {
      console.error("Invite not found:", inviteError);
      return new Response(
        JSON.stringify({ error: "Invite not found" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Verify tenant access - user must have access to this invite's tenant
    const accessResult = await assertTenantAccess(authHeader, invite.tenant_id);
    if (!accessResult.allowed) {
      console.error("Tenant access denied:", accessResult.reason);
      return accessResult.response || new Response(
        JSON.stringify({ error: "Access denied" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Resending driver invite to ${invite.email} (invite ${invite.id})`);

    // Build the application URL using the EXISTING public_token
    const appUrl = "https://drive-easy-apply.lovable.app";
    const applicationUrl = `${appUrl}/apply?token=${invite.public_token}`;

    const greeting = invite.name ? `Hi ${invite.name},` : "Hello,";

    const emailResponse = await resend.emails.send({
      from: "Driver Application <noreply@blueforgetechnologies.org>",
      to: [invite.email],
      subject: "Reminder: Complete Your Driver Employment Application",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; border-bottom: 3px solid #007bff; padding-bottom: 10px;">Driver Employment Application</h1>
          
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            ${greeting}
          </p>
          
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            This is a friendly reminder to complete your driver employment application. We noticed you haven't finished the application yet, and we'd love to have you on our team!
          </p>
          
          <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <h2 style="color: #007bff; margin-top: 0; font-size: 18px;">What you'll need:</h2>
            <ul style="color: #555; line-height: 1.8;">
              <li>Valid CDL license information</li>
              <li>Employment history (last 3 years)</li>
              <li>Driving history and accident records</li>
              <li>Required documents (license, medical card, social security card)</li>
              <li>Direct deposit or CashApp information</li>
            </ul>
          </div>
          
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            The application takes approximately 15-20 minutes to complete. Your progress has been saved, so you can pick up where you left off.
          </p>
          
          <a href="${applicationUrl}" style="display: inline-block; padding: 14px 32px; background-color: #007bff; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; font-size: 16px;">
            Continue Your Application
          </a>
          
          <p style="font-size: 14px; color: #777; margin-top: 30px;">
            Or copy and paste this link into your browser:<br>
            <a href="${applicationUrl}" style="color: #007bff; word-break: break-all;">${applicationUrl}</a>
          </p>
          
          <div style="border-top: 1px solid #ddd; margin-top: 40px; padding-top: 20px;">
            <p style="font-size: 14px; color: #999; line-height: 1.6;">
              <strong>Note:</strong> This application is available on all devices - desktop, tablet, or mobile phone.
            </p>
            <p style="font-size: 14px; color: #999;">
              If you have any questions, please don't hesitate to reach out to us.
            </p>
          </div>
        </div>
      `,
    });

    // Track email send
    const success = !emailResponse.error;
    await supabaseService
      .from("email_send_tracking")
      .insert({
        email_type: "driver_invite_resend",
        recipient_email: invite.email,
        success,
      });
    console.log("📊 Resend usage tracked");

    console.log("Driver invite resent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, data: emailResponse }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in resend-driver-invite function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
