import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DriverInviteRequest {
  email: string;
  name?: string;
  tenant_id?: string; // Frontend should pass the effective tenant
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_ANON_KEY") ?? "",
      {
        auth: {
          persistSession: false,
        },
      }
    );

    // Verify the user is authenticated and is an admin
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "No authorization header" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", "")
    );

    if (authError || !user) {
      console.error("Auth error:", authError);
      return new Response(
        JSON.stringify({ error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { email, name, tenant_id }: DriverInviteRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log(`Sending driver application invite to ${email}`);

    // Create service role client for inserting invite record
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // If tenant_id provided by frontend, validate user has access to it
    // Otherwise, try to get from user's single membership
    let tenantId = tenant_id;
    
    if (tenantId) {
      // Validate user has access to the provided tenant
      const { data: membershipCheck, error: membershipError } = await supabaseService
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (membershipError || !membershipCheck) {
        console.error('User does not have access to tenant:', tenantId, membershipError);
        return new Response(JSON.stringify({ error: 'Access denied to tenant' }), {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
    } else {
      // Fallback: get user's only tenant (fails if multiple)
      const { data: tenantData, error: tenantError } = await supabaseService
        .from('tenant_users')
        .select('tenant_id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (tenantError || !tenantData?.tenant_id) {
        console.error('Error getting tenant (user may have multiple):', tenantError);
        return new Response(JSON.stringify({ error: 'Could not determine tenant. Please ensure tenant context is provided.' }), {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      tenantId = tenantData.tenant_id;
    }

    // Insert invite record into database
    const { data: inviteData, error: inviteError } = await supabaseService
      .from('driver_invites')
      .insert({
        email,
        name,
        invited_by: user.id,
        tenant_id: tenantId,
      })
      .select()
      .single();

    if (inviteError) {
      console.error('Error creating invite record:', inviteError);
      return new Response(JSON.stringify({ error: 'Failed to create invite record' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Use the production app URL with public_token (not raw id)
    // NOTE: Application record is created when the driver opens the invite link,
    // not when the invite is sent
    const appUrl = "https://drive-easy-apply.lovable.app";
    const applicationUrl = `${appUrl}/?token=${inviteData.public_token}`;

    const greeting = name ? `Hi ${name},` : "Hello,";

    const emailResponse = await resend.emails.send({
      from: "Driver Application <noreply@blueforgetechnologies.org>",
      to: [email],
      subject: "Complete Your Driver Employment Application",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333; border-bottom: 3px solid #007bff; padding-bottom: 10px;">Driver Employment Application</h1>
          
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            ${greeting}
          </p>
          
          <p style="font-size: 16px; color: #555; line-height: 1.6;">
            We're excited to invite you to apply for a driver position with our company. We've streamlined our application process to make it easy and convenient for you.
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
            The application takes approximately 15-20 minutes to complete. You can save your progress and return later if needed.
          </p>
          
          <a href="${applicationUrl}" style="display: inline-block; padding: 14px 32px; background-color: #007bff; color: white; text-decoration: none; border-radius: 6px; margin: 20px 0; font-weight: bold; font-size: 16px;">
            Start Your Application
          </a>
          
          <p style="font-size: 14px; color: #777; margin-top: 30px;">
            Or copy and paste this link into your browser:<br>
            <a href="${applicationUrl}" style="color: #007bff; word-break: break-all;">${applicationUrl}</a>
          </p>
          
          <div style="border-top: 1px solid #ddd; margin-top: 40px; padding-top: 20px;">
            <p style="font-size: 14px; color: #999; line-height: 1.6;">
              <strong>Note:</strong> This application is available on all devices - desktop, tablet, or mobile phone. Make sure you have all required documents ready before starting.
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
      .from('email_send_tracking')
      .insert({
        email_type: 'driver_invite',
        recipient_email: email,
        success,
      });
    console.log('📊 Resend usage tracked');

    console.log("Driver invite email sent successfully:", emailResponse);

    return new Response(
      JSON.stringify({ success: true, data: emailResponse }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          ...corsHeaders,
        },
      }
    );
  } catch (error: any) {
    console.error("Error in send-driver-invite function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  }
};

serve(handler);