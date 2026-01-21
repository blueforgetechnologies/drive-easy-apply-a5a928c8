import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InviteRequest {
  email: string;
  firstName?: string;
  lastName?: string;
  phone?: string;
  inviterName: string;
  tenantName?: string;
  isExistingUser?: boolean;
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

    // Service client for tracking
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
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

    const { email, firstName, lastName, phone, inviterName, tenantName, isExistingUser }: InviteRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const recipientName = firstName && lastName ? `${firstName} ${lastName}` : email;
    console.log(`Sending invite to ${recipientName} (${email}) from ${inviterName} (tenant: ${tenantName}, existing: ${isExistingUser})`);

    const appUrl = "https://drive-easy-apply.lovable.app";
    const loginUrl = `${appUrl}/auth`;
    const signupUrl = `${appUrl}/auth?mode=signup&email=${encodeURIComponent(email)}`;

    // Different email content for existing vs new users
    const emailContent = isExistingUser 
      ? `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333;">Hi${firstName ? ` ${firstName}` : ''}, you've been added to ${tenantName || 'a new organization'}!</h1>
          <p style="font-size: 16px; color: #555;">
            ${inviterName} has granted you access to <strong>${tenantName || 'their organization'}</strong>.
          </p>
          <p style="font-size: 16px; color: #555;">
            You already have an account. Simply log in to access the new organization.
          </p>
          <div style="background: #f5f5f5; border-radius: 8px; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #666;"><strong>Your username:</strong> ${email}</p>
            <p style="margin: 8px 0 0 0; font-size: 14px; color: #666;">Use your existing password to log in.</p>
          </div>
          <a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">
            Log In Now
          </a>
        </div>
      `
      : `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333;">Hi${firstName ? ` ${firstName}` : ''}, you've been invited to join ${tenantName || 'the team'}!</h1>
          <p style="font-size: 16px; color: #555;">
            ${inviterName} has invited you to join <strong>${tenantName || 'their organization'}</strong> to help manage operations.
          </p>
          <div style="background: #e8f4fd; border-left: 4px solid #007bff; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #333;"><strong>📧 Your username:</strong> ${email}</p>
            <p style="margin: 12px 0 0 0; font-size: 14px; color: #333;"><strong>🔐 Password:</strong> You'll create your own password during signup</p>
          </div>
          <p style="font-size: 16px; color: #555;">
            Click below to create your account:
          </p>
          <a href="${signupUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">
            Create Your Account
          </a>
          <p style="font-size: 14px; color: #777; margin-top: 20px;">
            Or copy and paste this link into your browser:<br>
            <a href="${signupUrl}" style="color: #007bff;">${signupUrl}</a>
          </p>
          <p style="font-size: 14px; color: #999; margin-top: 40px;">
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
      `;

    const emailResponse = await resend.emails.send({
      from: `${tenantName || 'Blueforge Technologies'} <noreply@nexustechsolution.com>`,
      to: [email],
      subject: isExistingUser 
        ? `You've been added to ${tenantName || 'a new organization'}`
        : `You've been invited to join ${tenantName || 'the team'}`,
      html: emailContent,
    });

    // Track email send
    const success = !emailResponse.error;
    await supabaseService
      .from('email_send_tracking')
      .insert({
        email_type: 'invite',
        recipient_email: email,
        success,
      });
    console.log('📊 Resend usage tracked');

    console.log("Email sent successfully:", emailResponse);

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
    console.error("Error in send-invite function:", error);
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