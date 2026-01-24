import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Thresholds in minutes
const BUSINESS_HOURS_THRESHOLD = 30;
const OFF_HOURS_THRESHOLD = 300; // 5 hours

// Queue backlog thresholds
const QUEUE_STALE_THRESHOLD_SECONDS = 120; // 2 minutes
const QUEUE_BACKLOG_COUNT_THRESHOLD = 100; // pending count alert threshold

// Business hours: 8 AM - 7 PM Eastern, Monday-Friday
const BUSINESS_START_HOUR = 8;
const BUSINESS_END_HOUR = 19;

interface TenantHealth {
  id: string;
  name: string;
  gmail_alias: string | null;
  last_email_received_at: string | null;
  is_paused: boolean;
}

function isBusinessHours(date: Date): boolean {
  // Convert to Eastern Time
  const easternTime = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const dayOfWeek = easternTime.getDay(); // 0 = Sunday, 6 = Saturday
  const hour = easternTime.getHours();
  
  // Check if weekday (Monday-Friday)
  if (dayOfWeek === 0 || dayOfWeek === 6) {
    return false;
  }
  
  // Check if within business hours
  return hour >= BUSINESS_START_HOUR && hour < BUSINESS_END_HOUR;
}

function getThresholdMinutes(now: Date): number {
  return isBusinessHours(now) ? BUSINESS_HOURS_THRESHOLD : OFF_HOURS_THRESHOLD;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) {
    return `${minutes} minutes`;
  }
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  return mins > 0 ? `${hours}h ${mins}m` : `${hours} hours`;
}

serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    const adminEmail = "admin@talbilogistics.com"; // Configure this

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    const now = new Date();
    const isBizHours = isBusinessHours(now);
    const thresholdMinutes = getThresholdMinutes(now);
    const thresholdTime = new Date(now.getTime() - thresholdMinutes * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();

    console.log(`[check-email-health] Running at ${now.toISOString()}`);
    console.log(`[check-email-health] Business hours: ${isBizHours}, Threshold: ${thresholdMinutes} minutes`);

    const alerts: Array<{
      type: string;
      level: string;
      tenantId: string | null;
      tenantName: string | null;
      message: string;
      minutesSinceLastEmail: number | null;
    }> = [];

    // ============================================================
    // LIGHTWEIGHT QUERIES ONLY - NO FULL ROW FETCHES
    // ============================================================

    // Query 1: Get tenants (small table, needed for iteration)
    const { data: tenants, error: tenantsError } = await supabase
      .from("tenants")
      .select("id, name, gmail_alias, last_email_received_at, is_paused")
      .eq("status", "active");

    if (tenantsError) {
      throw new Error(`Failed to fetch tenants: ${tenantsError.message}`);
    }

    // Query 2: Gmail tokens (small table, needed for auth health)
    const { data: gmailTokens } = await supabase
      .from("gmail_tokens")
      .select("id, user_email, tenant_id, token_expiry, needs_reauth, reauth_reason, updated_at");

    // Query 3: LIGHTWEIGHT - MAX(received_at) from load_emails (uses idx_load_emails_received_at)
    const { data: latestEmail } = await supabase
      .from("load_emails")
      .select("received_at")
      .order("received_at", { ascending: false })
      .limit(1)
      .single();

    // Query 4: LIGHTWEIGHT - Queue backlog check (uses idx_email_queue_status + idx_email_queue_queued_at)
    const staleThresholdTime = new Date(now.getTime() - QUEUE_STALE_THRESHOLD_SECONDS * 1000).toISOString();
    
    const { count: pendingCount } = await supabase
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "processing"]);

    const { count: staleCount } = await supabase
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "processing"])
      .lt("queued_at", staleThresholdTime);

    console.log(`[check-email-health] Queue: pending=${pendingCount}, stale(>2min)=${staleCount}`);

    // ============================================================
    // QUEUE BACKLOG ALERT (NEW)
    // ============================================================
    const hasBacklog = (staleCount && staleCount > 0) || (pendingCount && pendingCount > QUEUE_BACKLOG_COUNT_THRESHOLD);
    
    if (hasBacklog) {
      // Check for existing unresolved queue_backlog alert (rate limit: 1/hour)
      const { data: existingBacklogAlert } = await supabase
        .from("email_health_alerts")
        .select("id")
        .eq("alert_type", "queue_backlog")
        .is("resolved_at", null)
        .gte("sent_at", oneHourAgo)
        .limit(1);

      if (!existingBacklogAlert?.length) {
        const backlogMessage = staleCount && staleCount > 0
          ? `Queue backlog: ${staleCount} emails pending/processing for >2 minutes (total pending: ${pendingCount})`
          : `Queue backlog: ${pendingCount} emails pending (threshold: ${QUEUE_BACKLOG_COUNT_THRESHOLD})`;
        
        alerts.push({
          type: "queue_backlog",
          level: staleCount && staleCount >= 10 ? "critical" : "warning",
          tenantId: null,
          tenantName: null,
          message: backlogMessage,
          minutesSinceLastEmail: null,
        });
      }
    } else {
      // Resolve any existing queue_backlog alerts
      await supabase
        .from("email_health_alerts")
        .update({ resolved_at: now.toISOString() })
        .eq("alert_type", "queue_backlog")
        .is("resolved_at", null);
    }

    // ============================================================
    // GMAIL TOKEN HEALTH CHECK
    // ============================================================
    const tokenAlerts: typeof alerts = [];
    const nowTime = now.getTime();

    for (const token of gmailTokens || []) {
      const tokenExpiry = token.token_expiry ? new Date(token.token_expiry) : null;
      const isExpired = tokenExpiry ? tokenExpiry.getTime() < nowTime : true;
      const needsReauth = token.needs_reauth === true;
      
      // Get tenant name for alert message
      const tenant = tenants?.find(t => t.id === token.tenant_id);
      const tenantName = tenant?.name || 'Unknown';
      
      if (needsReauth || isExpired) {
        // Check for existing unresolved gmail_token_expired alert (spam prevention - 1 per hour per token)
        const { data: existingTokenAlert } = await supabase
          .from("email_health_alerts")
          .select("id")
          .eq("alert_type", "gmail_token_expired")
          .eq("tenant_id", token.tenant_id)
          .is("resolved_at", null)
          .gte("sent_at", oneHourAgo)
          .limit(1);
        
        if (!existingTokenAlert?.length) {
          const reason = needsReauth 
            ? `Gmail token needs re-auth: ${token.reauth_reason || 'unknown reason'}` 
            : `Gmail token expired at ${tokenExpiry?.toISOString() || 'unknown'}`;
          
          tokenAlerts.push({
            type: "gmail_token_expired",
            level: "critical",
            tenantId: token.tenant_id,
            tenantName,
            message: `${tenantName}: ${reason}. User must reconnect Gmail at ${token.user_email}`,
            minutesSinceLastEmail: null,
          });
        }
      } else {
        // Token is healthy - resolve any existing alerts
        await supabase
          .from("email_health_alerts")
          .update({ resolved_at: now.toISOString() })
          .eq("alert_type", "gmail_token_expired")
          .eq("tenant_id", token.tenant_id)
          .is("resolved_at", null);
      }
    }

    // ============================================================
    // SYSTEM-WIDE INACTIVITY CHECK (using lightweight MAX query result)
    // ============================================================
    const systemLastEmail = latestEmail?.received_at ? new Date(latestEmail.received_at) : null;
    const systemInactive = !systemLastEmail || systemLastEmail < thresholdTime;

    if (systemInactive) {
      const minutesSince = systemLastEmail 
        ? Math.floor((now.getTime() - systemLastEmail.getTime()) / 60000)
        : null;

      // Check if we already have an unresolved system alert
      const { data: existingAlert } = await supabase
        .from("email_health_alerts")
        .select("id")
        .eq("alert_type", "system_wide")
        .is("resolved_at", null)
        .gte("sent_at", oneHourAgo)
        .limit(1);

      if (!existingAlert?.length) {
        alerts.push({
          type: "system_wide",
          level: "critical",
          tenantId: null,
          tenantName: null,
          message: systemLastEmail 
            ? `No emails received system-wide for ${formatDuration(minutesSince!)}. Email pipeline may be down.`
            : "No emails have ever been received. Email pipeline not configured.",
          minutesSinceLastEmail: minutesSince,
        });
      }
    } else {
      // Resolve any existing system-wide alerts
      await supabase
        .from("email_health_alerts")
        .update({ resolved_at: now.toISOString() })
        .eq("alert_type", "system_wide")
        .is("resolved_at", null);
    }

    // ============================================================
    // PER-TENANT INACTIVITY CHECK (uses cached last_email_received_at)
    // ============================================================
    const tenantsToDisable: string[] = [];

    for (const tenant of tenants || []) {
      // Skip paused tenants or those without a configured gmail alias
      if (tenant.is_paused || !tenant.gmail_alias) {
        continue;
      }

      const tenantLastEmail = tenant.last_email_received_at 
        ? new Date(tenant.last_email_received_at) 
        : null;
      const tenantInactive = !tenantLastEmail || tenantLastEmail < thresholdTime;

      if (tenantInactive) {
        const minutesSince = tenantLastEmail 
          ? Math.floor((now.getTime() - tenantLastEmail.getTime()) / 60000)
          : null;

        // Check if we already have an unresolved tenant alert
        const { data: existingAlert } = await supabase
          .from("email_health_alerts")
          .select("id")
          .eq("alert_type", "tenant_inactive")
          .eq("tenant_id", tenant.id)
          .is("resolved_at", null)
          .gte("sent_at", oneHourAgo)
          .limit(1);

        if (!existingAlert?.length) {
          alerts.push({
            type: "tenant_inactive",
            level: minutesSince && minutesSince > thresholdMinutes * 2 ? "critical" : "warning",
            tenantId: tenant.id,
            tenantName: tenant.name,
            message: tenantLastEmail
              ? `${tenant.name}: No emails for ${formatDuration(minutesSince!)}. Email source may be inactive.`
              : `${tenant.name}: No emails ever received. Email source not connected.`,
            minutesSinceLastEmail: minutesSince,
          });

          // Auto-disable hunt plans for tenants inactive > 2x threshold
          if (minutesSince && minutesSince > thresholdMinutes * 2) {
            tenantsToDisable.push(tenant.id);
          }
        }
      } else {
        // Resolve any existing tenant alerts
        await supabase
          .from("email_health_alerts")
          .update({ resolved_at: now.toISOString() })
          .eq("alert_type", "tenant_inactive")
          .eq("tenant_id", tenant.id)
          .is("resolved_at", null);
      }
    }

    // Merge token alerts into main alerts array
    alerts.push(...tokenAlerts);

    // ============================================================
    // NOTE: Dedup metrics moved to inspector-dedup-health (manual/daily only)
    // This removes ~52K row scans/day from the 5-minute cron
    // ============================================================

    // Insert new alerts
    if (alerts.length > 0) {
      const alertRecords = alerts.map((a) => ({
        tenant_id: a.tenantId,
        alert_type: a.type,
        alert_level: a.level,
        message: a.message,
        threshold_minutes: thresholdMinutes,
        last_email_at: a.minutesSinceLastEmail !== null 
          ? new Date(now.getTime() - a.minutesSinceLastEmail * 60000).toISOString()
          : null,
        is_business_hours: isBizHours,
      }));

      await supabase.from("email_health_alerts").insert(alertRecords);

      // Send email alert
      if (resend && adminEmail) {
        const criticalAlerts = alerts.filter((a) => a.level === "critical");
        const warningAlerts = alerts.filter((a) => a.level === "warning");

        const emailHtml = `
          <h1>Email Health Alert</h1>
          <p>Time: ${now.toLocaleString("en-US", { timeZone: "America/New_York" })} ET</p>
          <p>Business hours: ${isBizHours ? "Yes" : "No"}</p>
          <p>Threshold: ${formatDuration(thresholdMinutes)}</p>
          
          ${criticalAlerts.length > 0 ? `
            <h2 style="color: red;">🔴 Critical Alerts (${criticalAlerts.length})</h2>
            <ul>
              ${criticalAlerts.map((a) => `<li>${a.message}</li>`).join("")}
            </ul>
          ` : ""}
          
          ${warningAlerts.length > 0 ? `
            <h2 style="color: orange;">🟡 Warnings (${warningAlerts.length})</h2>
            <ul>
              ${warningAlerts.map((a) => `<li>${a.message}</li>`).join("")}
            </ul>
          ` : ""}
          
          ${tenantsToDisable.length > 0 ? `
            <h2 style="color: red;">⚠️ Hunt Plans Auto-Disabled</h2>
            <p>Hunt plans have been automatically disabled for ${tenantsToDisable.length} tenant(s) due to prolonged email inactivity.</p>
          ` : ""}
        `;

        try {
          await resend.emails.send({
            from: "FreightTMS <alerts@talbilogistics.com>",
            to: [adminEmail],
            subject: `[${criticalAlerts.length > 0 ? "CRITICAL" : "WARNING"}] Email Health Alert - ${alerts.length} issue(s)`,
            html: emailHtml,
          });
          console.log(`[check-email-health] Email alert sent to ${adminEmail}`);
        } catch (emailError) {
          console.error(`[check-email-health] Failed to send email:`, emailError);
        }
      }
    }

    // Auto-disable hunt plans for critically inactive tenants
    if (tenantsToDisable.length > 0) {
      const { error: disableError } = await supabase
        .from("hunt_plans")
        .update({ enabled: false })
        .in("tenant_id", tenantsToDisable);

      if (disableError) {
        console.error(`[check-email-health] Failed to disable hunt plans:`, disableError);
      } else {
        console.log(`[check-email-health] Disabled hunt plans for ${tenantsToDisable.length} tenants`);
      }
    }

    // Build health summary for dashboard
    const healthSummary = {
      checked_at: now.toISOString(),
      is_business_hours: isBizHours,
      threshold_minutes: thresholdMinutes,
      system_status: systemInactive ? "inactive" : "healthy",
      system_last_email: systemLastEmail?.toISOString() || null,
      queue_pending: pendingCount || 0,
      queue_stale: staleCount || 0,
      tenants_checked: tenants?.length || 0,
      alerts_generated: alerts.length,
      hunt_plans_disabled: tenantsToDisable.length,
    };

    console.log(`[check-email-health] Complete:`, healthSummary);

    return new Response(JSON.stringify(healthSummary), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error: unknown) {
    console.error("[check-email-health] Error:", error);
    const message = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
