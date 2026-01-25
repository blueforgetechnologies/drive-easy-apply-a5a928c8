import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface UserLoginRequest {
  userId: string;
  userEmail: string;
  userName: string;
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
  console.log("send-user-login: Request received");
  
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

    const { userId, userEmail, userName }: UserLoginRequest = await req.json();
    
    console.log(`Processing login link for user: ${userEmail}`);
    
    if (!userId || !userEmail) {
      throw new Error("Missing required fields: userId and userEmail");
    }

    // Generate new memorable password
    const tempPassword = generateMemorablePassword();
    
    console.log(`Updating password for user: ${userId}`);
    
    const { error: updateError } = await supabaseAdmin.auth.admin.updateUserById(userId, {
      password: tempPassword,
    });

    if (updateError) {
      console.error("Error updating password:", updateError);
      throw new Error(`Failed to update password: ${updateError.message}`);
    }

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
                <h1 style="margin: 0; font-size: 24px; color: #18181b;">TMS Portal Login Credentials</h1>
                <p style="margin: 10px 0 0; color: #71717a;">Your login details are ready</p>
              </div>
              
              <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
                Hello ${userName || 'User'},
              </p>
              
              <p style="color: #3f3f46; font-size: 16px; line-height: 1.6;">
                Your login credentials have been set. Use the details below to access your portal:
              </p>
              
              <div style="background: #f4f4f5; border-radius: 8px; padding: 20px; margin: 25px 0;">
                <div style="margin-bottom: 15px;">
                  <div style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Email</div>
                  <div style="color: #18181b; font-size: 16px; font-weight: 600; margin-top: 4px;">${userEmail}</div>
                </div>
                <div>
                  <div style="color: #71717a; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Password</div>
                  <div style="color: #18181b; font-size: 18px; font-weight: 700; font-family: monospace; margin-top: 4px; background: white; padding: 10px; border-radius: 6px; letter-spacing: 1px;">${tempPassword}</div>
                </div>
              </div>
              
              <div style="text-align: center; margin: 30px 0;">
                <a href="${loginUrl}" style="display: inline-block; background: #2563eb; color: white; text-decoration: none; padding: 14px 32px; border-radius: 8px; font-weight: 600; font-size: 16px;">
                  Login to Portal
                </a>
              </div>
              
              <p style="color: #71717a; font-size: 14px; text-align: center; margin-top: 25px;">
                💡 We recommend changing your password after logging in.
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
      to: [userEmail],
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
        email_type: 'user_login',
        recipient_email: userEmail,
        success: true,
      });

    console.log(`Login credentials sent successfully to ${userEmail}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Login credentials sent to ${userEmail}`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      }
    );
  } catch (error: any) {
    console.error("Error in send-user-login:", error);
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
