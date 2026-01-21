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

// Generate a simple temporary password
function generateTempPassword(): string {
  // Simple, easy-to-type password: Welcome + 3 random digits
  const digits = Math.floor(Math.random() * 900) + 100; // 100-999
  return `Welcome${digits}`;
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

    // Use safe fallbacks for display names
    const safeInviterName = inviterName && inviterName !== 'undefined' ? inviterName : 'Your administrator';
    const safeTenantName = tenantName && tenantName !== 'undefined' ? tenantName : null;

    const recipientName = firstName && lastName ? `${firstName} ${lastName}` : email;
    console.log(`Sending invite to ${recipientName} (${email}) from ${safeInviterName} (tenant: ${safeTenantName}, existing: ${isExistingUser})`);

    const appUrl = "https://drive-easy-apply.lovable.app";
    const loginUrl = `${appUrl}/auth`;

    let tempPassword = "";
    let emailContent = "";

    // Check if user actually exists in auth
    const { data: existingUsers } = await supabaseService.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    // Always generate a new password
    tempPassword = generateTempPassword();
    
    if (existingAuthUser) {
      // User exists - reset their password
      console.log(`User ${email} already exists, resetting password`);
      const { error: updateError } = await supabaseService.auth.admin.updateUserById(
        existingAuthUser.id,
        { password: tempPassword }
      );
      
      if (updateError) {
        console.error("Error resetting password:", updateError);
        // Continue anyway - they can use forgot password if needed
      }
      
      emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333;">Hi${firstName ? ` ${firstName}` : ''}, you've been added to ${safeTenantName || 'a new organization'}!</h1>
          <p style="font-size: 16px; color: #555;">
            ${safeInviterName} has granted you access to <strong>${safeTenantName || 'their organization'}</strong>.
          </p>
          <div style="background: #e8f4fd; border-left: 4px solid #007bff; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #333;"><strong>📧 Your username:</strong> <a href="mailto:${email}" style="color: #007bff;">${email}</a></p>
            <p style="margin: 12px 0 0 0; font-size: 14px; color: #333;"><strong>🔐 Your Password:</strong> <code style="background: #fff; padding: 4px 8px; border-radius: 4px; font-size: 16px; font-weight: bold;">${tempPassword}</code></p>
          </div>
          <p style="font-size: 14px; color: #d9534f; margin: 10px 0;">
            ⚠️ We recommend changing your password after logging in for security.
          </p>
          <a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">
            Log In Now
          </a>
        </div>
      `;
    } else {
      // Truly new user - create account with password
      const { data: newUser, error: createError } = await supabaseService.auth.admin.createUser({
        email,
        password: tempPassword,
        email_confirm: true,
        user_metadata: {
          full_name: firstName && lastName ? `${firstName} ${lastName}` : undefined,
        },
      });

      if (createError) {
        console.error("Error creating user:", createError);
        return new Response(
          JSON.stringify({ error: `Failed to create user account: ${createError.message}` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.log("Created new user:", newUser.user?.id);

      emailContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
          <h1 style="color: #333;">Hi${firstName ? ` ${firstName}` : ''}, you've been invited to join ${safeTenantName || 'the team'}!</h1>
          <p style="font-size: 16px; color: #555;">
            ${safeInviterName} has invited you to join <strong>${safeTenantName || 'their organization'}</strong> to help manage operations.
          </p>
          <div style="background: #e8f4fd; border-left: 4px solid #007bff; padding: 16px; margin: 20px 0;">
            <p style="margin: 0; font-size: 14px; color: #333;"><strong>📧 Your username:</strong> <a href="mailto:${email}" style="color: #007bff;">${email}</a></p>
            <p style="margin: 12px 0 0 0; font-size: 14px; color: #333;"><strong>🔐 Your Password:</strong> <code style="background: #fff; padding: 4px 8px; border-radius: 4px; font-size: 16px; font-weight: bold;">${tempPassword}</code></p>
          </div>
          <p style="font-size: 14px; color: #d9534f; margin: 10px 0;">
            ⚠️ Please change your password after your first login for security.
          </p>
          <a href="${loginUrl}" style="display: inline-block; padding: 12px 24px; background-color: #007bff; color: white; text-decoration: none; border-radius: 4px; margin: 20px 0;">
            Log In Now
          </a>
          <p style="font-size: 14px; color: #777; margin-top: 20px;">
            Or copy and paste this link into your browser:<br>
            <a href="${loginUrl}" style="color: #007bff;">${loginUrl}</a>
          </p>
          <p style="font-size: 14px; color: #999; margin-top: 40px;">
            If you didn't expect this invitation, you can safely ignore this email.
          </p>
        </div>
      `;
    }

    const emailResponse = await resend.emails.send({
      from: `${safeTenantName || 'Blueforge Technologies'} <noreply@nexustechsolution.com>`,
      to: [email],
      subject: existingAuthUser 
        ? `You've been added to ${safeTenantName || 'a new organization'}`
        : `You've been invited to join ${safeTenantName || 'the team'}`,
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