import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";
import { assertTenantAccess, getServiceClient, deriveTenantFromJWT } from "../_shared/assertTenantAccess.ts";

const resend = new Resend(Deno.env.get("RESEND_API_KEY"));

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SpendCheckRequest {
  estimated_spend: number;
}

/**
 * Send spend alerts for the effective tenant.
 * 
 * TENANT ISOLATION:
 * - Derives tenant_id from JWT (server-side, never from client)
 * - Only reads/updates spend_alerts for the effective tenant
 * - Writes audit log on send attempts
 * 
 * Tables touched:
 * - spend_alerts (READ/WRITE) - scoped by tenant_id
 * - audit_logs (WRITE) - scoped by tenant_id
 */
const handler = async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    
    // Step 1: Derive tenant from JWT (server-side truth)
    const { tenant_id, user_id, error: derivationError } = await deriveTenantFromJWT(authHeader);
    
    if (derivationError) {
      return derivationError;
    }
    
    if (!tenant_id) {
      console.error("[send-spend-alert] No tenant context available");
      return new Response(
        JSON.stringify({ error: "No tenant context. User must belong to a tenant." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Step 2: Verify user has access to this tenant
    const access = await assertTenantAccess(authHeader, tenant_id);
    if (!access.allowed) {
      return access.response!;
    }
    
    console.log(`[send-spend-alert] Processing for tenant: ${tenant_id}, user: ${user_id}`);
    
    // Step 3: Use service client for privileged operations
    const supabase = getServiceClient();

    const { estimated_spend }: SpendCheckRequest = await req.json();
    
    console.log(`Checking spend alert for tenant ${tenant_id}, estimated spend: $${estimated_spend}`);

    // CRITICAL: Only get alerts for this tenant
    const { data: alerts, error: alertError } = await supabase
      .from("spend_alerts")
      .select("*")
      .eq("tenant_id", tenant_id) // TENANT SCOPING
      .eq("is_active", true);

    if (alertError) {
      console.error("Error fetching alerts:", alertError);
      throw alertError;
    }

    if (!alerts || alerts.length === 0) {
      console.log(`No active spend alerts configured for tenant ${tenant_id}`);
      return new Response(
        JSON.stringify({ message: "No active alerts", tenant_id }),
        { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const emailsSent = [];
    let successCount = 0;
    let failureCount = 0;

    for (const alert of alerts) {
      const lastAlertedAmount = alert.last_alerted_amount || 0;
      const threshold = alert.alert_threshold || 2;
      
      // Calculate if we've crossed a new threshold
      const previousThresholdsCrossed = Math.floor(lastAlertedAmount / threshold);
      const currentThresholdsCrossed = Math.floor(estimated_spend / threshold);
      
      console.log(`Alert ${alert.id}: last=$${lastAlertedAmount}, current=$${estimated_spend}, threshold=$${threshold}`);
      console.log(`Previous thresholds: ${previousThresholdsCrossed}, Current thresholds: ${currentThresholdsCrossed}`);

      if (currentThresholdsCrossed > previousThresholdsCrossed) {
        try {
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

          // Update the alert record - MUST include tenant_id check
          await supabase
            .from("spend_alerts")
            .update({
              last_alerted_at: new Date().toISOString(),
              last_alerted_amount: estimated_spend,
              total_spent: estimated_spend,
            })
            .eq("id", alert.id)
            .eq("tenant_id", tenant_id); // DOUBLE-CHECK tenant ownership

          emailsSent.push({ email: alert.user_email, amount: estimated_spend });
          successCount++;
        } catch (emailError) {
          console.error(`Failed to send email to ${alert.user_email}:`, emailError);
          failureCount++;
        }
      }
    }

    // Step 4: Write audit log
    await supabase.from("audit_logs").insert({
      tenant_id: tenant_id,
      user_id: user_id,
      entity_type: "spend_alert",
      entity_id: tenant_id,
      action: "send_alerts",
      notes: `Spend alerts: ${successCount} sent, ${failureCount} failed, estimated spend: $${estimated_spend.toFixed(2)}`,
    });

    return new Response(
      JSON.stringify({ 
        message: emailsSent.length > 0 ? "Alerts sent" : "No thresholds crossed",
        tenant_id,
        alerts_sent: emailsSent,
        success_count: successCount,
        failure_count: failureCount,
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
