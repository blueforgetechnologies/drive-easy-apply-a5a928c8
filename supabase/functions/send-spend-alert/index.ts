import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SpendCheckRequest {
  estimated_spend: number;
}

const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { estimated_spend }: SpendCheckRequest = await req.json();
    
    console.log(`Checking spend alert for estimated spend: $${estimated_spend}`);

    // Get active spend alerts
    const { data: alerts, error: alertError } = await supabase
      .from("spend_alerts")
      .select("*")
      .eq("is_active", true);

    if (alertError) {
      console.error("Error fetching alerts:", alertError);
      throw alertError;
    }

    if (!alerts || alerts.length === 0) {
      console.log("No active spend alerts configured");
      return new Response(
        JSON.stringify({ message: "No active alerts" }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const emailsSent = [];

    for (const alert of alerts) {
      const lastAlertedAmount = alert.last_alerted_amount || 0;
      const threshold = alert.alert_threshold || 2;
      
      // Calculate if we've crossed a new threshold
      const previousThresholdsCrossed = Math.floor(lastAlertedAmount / threshold);
      const currentThresholdsCrossed = Math.floor(estimated_spend / threshold);
      
      console.log(`Alert ${alert.id}: last=$${lastAlertedAmount}, current=$${estimated_spend}, threshold=$${threshold}`);
      console.log(`Previous thresholds: ${previousThresholdsCrossed}, Current thresholds: ${currentThresholdsCrossed}`);

      if (currentThresholdsCrossed > previousThresholdsCrossed) {
        // Send email alert
        const emailResponse = await resend.emails.send({
          from: "Lovable Cloud Alerts <onboarding@resend.dev>",
          to: [alert.user_email],
          subject: `💰 Spend Alert: $${estimated_spend.toFixed(2)} spent`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h1 style="color: #333;">Lovable Cloud Spend Alert</h1>
              <p style="font-size: 18px;">Your estimated spend has reached <strong>$${estimated_spend.toFixed(2)}</strong></p>
              <p style="color: #666;">You've crossed the $${(currentThresholdsCrossed * threshold).toFixed(2)} threshold.</p>
              <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
              <p style="color: #888; font-size: 14px;">
                You're receiving this because you set up spend alerts at $${threshold} increments.
              </p>
            </div>
          `,
        });

        console.log(`Email sent to ${alert.user_email}:`, emailResponse);

        // Update the alert record
        await supabase
          .from("spend_alerts")
          .update({
            last_alerted_at: new Date().toISOString(),
            last_alerted_amount: estimated_spend,
            total_spent: estimated_spend,
          })
          .eq("id", alert.id);

        emailsSent.push({ email: alert.user_email, amount: estimated_spend });
      }
    }

    return new Response(
      JSON.stringify({ 
        message: emailsSent.length > 0 ? "Alerts sent" : "No thresholds crossed",
        alerts_sent: emailsSent 
      }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );

  } catch (error: any) {
    console.error("Error in send-spend-alert function:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
};

serve(handler);
