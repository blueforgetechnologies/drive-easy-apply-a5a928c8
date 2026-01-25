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
  inviterName?: string;
  tenantName?: string;
  tenantId?: string;
  isExistingUser?: boolean;
}

// Fixed temp password - easy to type and remember
const TEMP_PASSWORD = "Welcome123";

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

    // Service client for admin operations
    const supabaseService = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    // Verify the user is authenticated
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

    const { email, firstName, lastName, phone, inviterName, tenantName, tenantId }: InviteRequest = await req.json();

    if (!email) {
      return new Response(
        JSON.stringify({ error: "Email is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch inviter's profile name if not provided
    let resolvedInviterName = inviterName;
    if (!resolvedInviterName || resolvedInviterName === 'undefined') {
      const { data: inviterProfile } = await supabaseService
        .from("profiles")
        .select("full_name, email")
        .eq("id", user.id)
        .single();
      
      resolvedInviterName = inviterProfile?.full_name || inviterProfile?.email || "Your administrator";
    }

    // Fetch tenant name from DB if tenantId provided but tenantName missing
    let resolvedTenantName = tenantName;
    let resolvedTenantId = tenantId;
    
    if ((!resolvedTenantName || resolvedTenantName === 'undefined') && resolvedTenantId) {
      const { data: tenant } = await supabaseService
        .from("tenants")
        .select("name")
        .eq("id", resolvedTenantId)
        .single();
      
      resolvedTenantName = tenant?.name || null;
    }

    // If we still don't have a tenant, try to get it from the inviter's membership
    if (!resolvedTenantId) {
      const { data: inviterMembership } = await supabaseService
        .from("tenant_users")
        .select("tenant_id, tenants(name)")
        .eq("user_id", user.id)
        .eq("is_active", true)
        .limit(1)
        .single();
      
      if (inviterMembership) {
        resolvedTenantId = inviterMembership.tenant_id;
        resolvedTenantName = (inviterMembership as any).tenants?.name || null;
      }
    }

    const safeInviterName = resolvedInviterName || "Your administrator";
    const safeTenantName = resolvedTenantName || "the organization";

    const recipientName = firstName && lastName ? `${firstName} ${lastName}` : email;
    console.log(`Sending invite to ${recipientName} (${email}) from ${safeInviterName} (tenant: ${safeTenantName}, tenantId: ${resolvedTenantId})`);

    const appUrl = "https://drive-easy-apply.lovable.app";
    const loginUrl = `${appUrl}/auth`;

    // Check if user actually exists in auth
    const { data: existingUsers } = await supabaseService.auth.admin.listUsers();
    const existingAuthUser = existingUsers?.users?.find(u => u.email?.toLowerCase() === email.toLowerCase());
    
    let userId: string | null = null;

    if (existingAuthUser) {
      // User exists - reset their password to Welcome123
      userId = existingAuthUser.id;
      console.log(`User ${email} already exists (${userId}), resetting password to Welcome123`);
      
      const { error: updateError } = await supabaseService.auth.admin.updateUserById(
        existingAuthUser.id,
        { password: TEMP_PASSWORD }
      );
      
      if (updateError) {
        console.error("Error resetting password:", updateError);
        // Continue anyway - they can use forgot password if needed
      }
    } else {
      // Truly new user - create account with Welcome123
      const { data: newUser, error: createError } = await supabaseService.auth.admin.createUser({
        email,
        password: TEMP_PASSWORD,
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

      userId = newUser.user?.id || null;
      console.log("Created new user:", userId);
    }

    // CRITICAL: Add user to tenant_users immediately so they have org access on first login
    if (userId && resolvedTenantId) {
      console.log(`Adding user ${userId} to tenant ${resolvedTenantId}`);
      
      // Upsert into tenant_users
      const { error: tenantUserError } = await supabaseService
        .from("tenant_users")
        .upsert({
          user_id: userId,
          tenant_id: resolvedTenantId,
          role: "admin",
          is_active: true,
        }, { onConflict: "user_id,tenant_id" });
      
      if (tenantUserError) {
        console.error("Error adding user to tenant_users:", tenantUserError);
        // Don't fail the invite - user can still log in, admin can fix membership
      } else {
        console.log(`Successfully added user ${userId} to tenant_users`);
      }

      // Also ensure profile exists with name and email
      const { error: profileError } = await supabaseService
        .from("profiles")
        .upsert({
          id: userId,
          email: email.toLowerCase(),
          full_name: firstName && lastName ? `${firstName} ${lastName}`.trim() : null,
          phone: phone || null,
        }, { onConflict: "id" });
      
      if (profileError) {
        console.error("Error upserting profile:", profileError);
      }

      // Assign admin role
      await supabaseService
        .from("user_roles")
        .upsert({
          user_id: userId,
          role: "admin",
        }, { onConflict: "user_id,role" });
    }

    // Build email content
    const emailContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <h1 style="color: #333;">Hi${firstName ? ` ${firstName}` : ''}, you've been invited to join ${safeTenantName}!</h1>
        <p style="font-size: 16px; color: #555;">
          <strong>${safeInviterName}</strong> has invited you to join <strong>${safeTenantName}</strong> to help manage operations.
        </p>
        <div style="background: #e8f4fd; border-left: 4px solid #007bff; padding: 16px; margin: 20px 0;">
          <p style="margin: 0; font-size: 14px; color: #333;"><strong>📧 Your username:</strong> <a href="mailto:${email}" style="color: #007bff;">${email}</a></p>
          <p style="margin: 12px 0 0 0; font-size: 14px; color: #333;"><strong>🔐 Your Password:</strong> <code style="background: #fff; padding: 4px 8px; border-radius: 4px; font-size: 16px; font-weight: bold;">${TEMP_PASSWORD}</code></p>
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

    const emailResponse = await resend.emails.send({
      from: `${safeTenantName} <noreply@blueforgetechnologies.org>`,
      to: [email],
      subject: `You've been invited to join ${safeTenantName}`,
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
