import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface DispatcherLoginRequest {
  dispatcherId: string;
  dispatcherEmail: string;
  dispatcherName: string;
}

// Generate a simple memorable password
function generateMemorablePassword(): string {
  const adjectives = ['Happy', 'Lucky', 'Swift', 'Bright', 'Bold', 'Quick', 'Smart', 'Fresh'];
  const nouns = ['Driver', 'Truck', 'Road', 'Fleet', 'Cargo', 'Route', 'Load', 'Haul'];
  const numbers = Math.floor(Math.random() * 900) + 100; // 100-999
  const special = ['!', '@', '#', '$'];
  
  const adj = adjectives[Math.floor(Math.random() * adjectives.length)];
  const noun = nouns[Math.floor(Math.random() * nouns.length)];
  const spec = special[Math.floor(Math.random() * special.length)];
  
  return `${adj}${noun}${numbers}${spec}`;
}

const handler = async (req: Request): Promise<Response> => {
  console.log("send-dispatcher-login: Request received");
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    
    // Create admin client with service role key
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    const { dispatcherId, dispatcherEmail, dispatcherName }: DispatcherLoginRequest = await req.json();
    
    console.log(`Processing login link for dispatcher: ${dispatcherEmail}`);
    
    if (!dispatcherId || !dispatcherEmail) {
      throw new Error("Missing required fields: dispatcherId and dispatcherEmail");
    }

    // Check if dispatcher already has a user account
    const { data: dispatcher } = await supabaseAdmin
      .from('dispatchers')
      .select('user_id')
      .eq('id', dispatcherId)
      .single();

    let userId: string;
    let tempPassword: string;
    let isNewUser = false;

    if (dispatcher?.user_id) {
      // User already exists - generate new password
      userId = dispatcher.user_id;
      tempPassword = generateMemorablePassword();
      
      console.log(`Updating password for existing user: ${userId}`);
      
      const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
        password: tempPassword,
      });

      if (updateError) {
        console.error("Error updating password:", updateError);
        throw new Error(`Failed to update password: ${updateError.message}`);
      }
    } else {
      // Create new user account
      isNewUser = true;
      tempPassword = generateMemorablePassword();
      
      console.log(`Creating new user account for: ${dispatcherEmail}`);
      
      const { data: newUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
        email: dispatcherEmail,
        password: tempPassword,
        email_confirm: true, // Auto-confirm email
        user_metadata: {
          full_name: dispatcherName,
          role: 'dispatcher',
        },
      });

      if (createError) {
        console.error("Error creating user:", createError);
        throw new Error(`Failed to create user: ${createError.message}`);
      }

      userId = newUser.user.id;

      // Assign dispatcher role
      const { error: roleError } = await supabaseAdmin
        .from('user_roles')
        .insert({ user_id: userId, role: 'dispatcher' });

      if (roleError) {
        console.error("Error assigning role:", roleError);
        // Don't throw, continue with the process
      }

      // Link dispatcher record to user
      const { error: linkError } = await supabaseAdmin
        .from('dispatchers')
        .update({ 
          user_id: userId,
          must_change_password: true 
        })
        .eq('id', dispatcherId);

      if (linkError) {
        console.error("Error linking dispatcher to user:", linkError);
      }
    }

    // Update must_change_password flag
    await supabaseAdmin
      .from('dispatchers')
      .update({ must_change_password: true })
      .eq('id', dispatcherId);

    // Get the portal URL from environment or use production domain
    const portalUrl = "https://drive-easy-apply.lovable.app";
    const loginUrl = `${portalUrl}/auth`;

    // Send email with login credentials
    const emailHtml = `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; background-color: #f4f4f5;">
          <div style="max-width: 600px; margin: 0 auto; padding: 40px 20px;">
            <div style="background: white; border-radius: 12px; padding: 40px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.05);">
              <div style="text-align: center; margin-bottom: 30px;">
                <h1 style="margin: 0; font-size: 24px; color: #18181b;">Welcome to the TMS Portal</h1>
                <p style="margin: 10px 0 0; color: #71717a;">Your dispatcher account is ready</p>
              </div>
              
              <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
                Hello ${dispatcherName || 'Dispatcher'},
              </p>
              
              <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
                ${isNewUser ? 'Your dispatcher account has been created.' : 'Your login credentials have been reset.'} 
                Use the credentials below to access your portal:
              </p>
              
              <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 25px 0;">
                <div style="margin-bottom: 15px;">
                  <div style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Email</div>
                  <div style="color: #18181b; font-size: 16px; font-weight: 600; margin-top: 4px;">${dispatcherEmail}</div>
                </div>
                <div>
                  <div style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Temporary Password</div>
                  <div style="color: #18181b; font-size: 18px; font-weight: 700; font-family: monospace; margin-top: 4px; background: white; padding: 10px; border-radius: 6px; letter-spacing: 1px;">${tempPassword}</div>
                </div>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${loginUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Login to Portal
                </a>
              </div>
              
              <p style="color: #ef4444; font-size: 14px; text-align: center; margin-top: 25px;">
                ⚠️ You will be required to change your password on first login.
              </p>
              
              <hr style="border: none; border-top: 1px solid #e4e4e7; margin: 30px 0;">
              
              <p style="color: #a1a1aa; font-size: 12px; text-align: center;">
                If you didn't request this, please contact your administrator.
              </p>
            </div>
          </div>
        </body>
      </html>
    `;

    const { error: emailError } = await resend.emails.send({
      from: "TMS Portal <noreply@blueforgetechnologies.org>",
      to: [dispatcherEmail],
      subject: "Your TMS Portal Login Credentials",
      html: emailHtml,
    });

    if (emailError) {
      console.error("Error sending email:", emailError);
      throw new Error(`Failed to send email: ${emailError.message}`);
    }

    // Track email send
    await supabaseAdmin
      .from('email_send_tracking')
      .insert({
        email_type: 'dispatcher_login',
        recipient_email: dispatcherEmail,
        success: true,
      });

    console.log(`Login link sent successfully to ${dispatcherEmail}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Login credentials sent to ${dispatcherEmail}`,
        isNewUser 
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-dispatcher-login:", error);
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
