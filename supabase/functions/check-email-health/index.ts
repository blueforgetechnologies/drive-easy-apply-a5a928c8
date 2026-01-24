import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { Resend } from "https://esm.sh/resend@2.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Thresholds
const BUSINESS_HOURS_THRESHOLD = 30;
const OFF_HOURS_THRESHOLD = 300; // 5 hours

// Queue backlog thresholds (in seconds)
const QUEUE_STALE_THRESHOLD_SECONDS = 120; // 2 minutes
const QUEUE_WARNING_AGE_SECONDS = 60; // 1 minute - trigger warning
const QUEUE_CRITICAL_AGE_SECONDS = 120; // 2 minutes - trigger critical
const QUEUE_PENDING_COUNT_THRESHOLD = 100;
const QUEUE_STALE_COUNT_CRITICAL = 10;
const QUEUE_PROCESSING_STALE_SECONDS = 600; // 10 minutes - stuck worker detection

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
  const easternTime = new Date(date.toLocaleString("en-US", { timeZone: "America/New_York" }));
  const dayOfWeek = easternTime.getDay();
  const hour = easternTime.getHours();
  if (dayOfWeek === 0 || dayOfWeek === 6) return false;
  return hour >= BUSINESS_START_HOUR && hour < BUSINESS_END_HOUR;
}

function getThresholdMinutes(now: Date): number {
  return isBusinessHours(now) ? BUSINESS_HOURS_THRESHOLD : OFF_HOURS_THRESHOLD;
}

function formatDuration(minutes: number): string {
  if (minutes < 60) return `${minutes} minutes`;
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
    const adminEmail = "admin@talbilogistics.com";

    const supabase = createClient(supabaseUrl, supabaseServiceKey);
    const resend = resendApiKey ? new Resend(resendApiKey) : null;

    const now = new Date();
    const isBizHours = isBusinessHours(now);
    const thresholdMinutes = getThresholdMinutes(now);
    const thresholdTime = new Date(now.getTime() - thresholdMinutes * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

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
    // LIGHTWEIGHT QUERIES ONLY - COUNT/MIN/MAX, NO FULL ROW FETCHES
    // ============================================================

    // Query 1: Get tenants (small table)
    const { data: tenants, error: tenantsError } = await supabase
      .from("tenants")
      .select("id, name, gmail_alias, last_email_received_at, is_paused")
      .eq("status", "active");

    if (tenantsError) {
      throw new Error(`Failed to fetch tenants: ${tenantsError.message}`);
    }

    // Query 2: Gmail tokens (small table)
    const { data: gmailTokens } = await supabase
      .from("gmail_tokens")
      .select("id, user_email, tenant_id, token_expiry, needs_reauth, reauth_reason, updated_at");

    // Query 3: MAX(received_at) from load_emails (uses idx_load_emails_received_at)
    const { data: latestEmail } = await supabase
      .from("load_emails")
      .select("received_at")
      .order("received_at", { ascending: false })
      .limit(1)
      .single();

    // Query 4: Queue pending count (uses idx_email_queue_status partial index)
    const { count: pendingCount } = await supabase
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "processing"]);

    // Query 5: Queue stale count >120s (uses idx_email_queue_queued_at)
    const staleThresholdTime = new Date(now.getTime() - QUEUE_STALE_THRESHOLD_SECONDS * 1000).toISOString();
    const { count: staleCount } = await supabase
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending", "processing"])
      .lt("queued_at", staleThresholdTime);

    // Query 6: Oldest pending item - single row (uses idx_email_queue_queued_at)
    const { data: oldestPending } = await supabase
      .from("email_queue")
      .select("queued_at")
      .in("status", ["pending", "processing"])
      .order("queued_at", { ascending: true })
      .limit(1)
      .single();

    const oldestPendingAgeSeconds = oldestPending?.queued_at
      ? Math.floor((now.getTime() - new Date(oldestPending.queued_at).getTime()) / 1000)
      : null;

    // Query 7: Processing stale count >10min (uses idx_email_queue_stale partial index)
    const processingStaleTime = new Date(now.getTime() - QUEUE_PROCESSING_STALE_SECONDS * 1000).toISOString();
    const { count: processingStaleCount } = await supabase
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "processing")
      .lt("processing_started_at", processingStaleTime);

    // Query 8: Unroutable count last 15min (uses idx_unroutable_emails_received)
    const { count: unroutableCount15m } = await supabase
      .from("unroutable_emails")
      .select("*", { count: "exact", head: true })
      .gte("received_at", fifteenMinutesAgo);

    console.log(`[check-email-health] Queue: pending=${pendingCount}, stale=${staleCount}, oldest_age=${oldestPendingAgeSeconds}s, processing_stale=${processingStaleCount}, unroutable_15m=${unroutableCount15m}`);

    // ============================================================
    // QUEUE BACKLOG ALERT (MORE SENSITIVE THRESHOLDS)
    // ============================================================
    // WARNING: oldest_age >= 60s OR pending > 100
    // CRITICAL: oldest_age >= 120s OR stale_count >= 10
    const hasWarningBacklog = 
      (oldestPendingAgeSeconds !== null && oldestPendingAgeSeconds >= QUEUE_WARNING_AGE_SECONDS) ||
      (pendingCount !== null && pendingCount > QUEUE_PENDING_COUNT_THRESHOLD);
    
    const hasCriticalBacklog = 
      (oldestPendingAgeSeconds !== null && oldestPendingAgeSeconds >= QUEUE_CRITICAL_AGE_SECONDS) ||
      (staleCount !== null && staleCount >= QUEUE_STALE_COUNT_CRITICAL);

    const hasBacklog = hasWarningBacklog || hasCriticalBacklog;
    
    if (hasBacklog) {
      // Rate limit: 1/hour
      const { data: existingBacklogAlert } = await supabase
        .from("email_health_alerts")
        .select("id")
        .eq("alert_type", "queue_backlog")
        .is("resolved_at", null)
        .gte("sent_at", oneHourAgo)
        .limit(1);

      if (!existingBacklogAlert?.length) {
        const ageInfo = oldestPendingAgeSeconds !== null ? `oldest: ${oldestPendingAgeSeconds}s` : "oldest: unknown";
        const stuckInfo = processingStaleCount && processingStaleCount > 0 ? `, stuck_workers: ${processingStaleCount}` : "";
        const unroutableInfo = unroutableCount15m && unroutableCount15m > 0 ? `, unroutable_15m: ${unroutableCount15m}` : "";
        
        const backlogMessage = `Queue backlog: pending=${pendingCount}, stale(>2min)=${staleCount}, ${ageInfo}${stuckInfo}${unroutableInfo}`;
        
        alerts.push({
          type: "queue_backlog",
          level: hasCriticalBacklog ? "critical" : "warning",
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
      
      const tenant = tenants?.find(t => t.id === token.tenant_id);
      const tenantName = tenant?.name || 'Unknown';
      
      if (needsReauth || isExpired) {
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
        await supabase
          .from("email_health_alerts")
          .update({ resolved_at: now.toISOString() })
          .eq("alert_type", "gmail_token_expired")
          .eq("tenant_id", token.tenant_id)
          .is("resolved_at", null);
      }
    }

    // ============================================================
    // SYSTEM-WIDE INACTIVITY CHECK
    // ============================================================
    const systemLastEmail = latestEmail?.received_at ? new Date(latestEmail.received_at) : null;
    const systemInactive = !systemLastEmail || systemLastEmail < thresholdTime;

    if (systemInactive) {
      const minutesSince = systemLastEmail 
        ? Math.floor((now.getTime() - systemLastEmail.getTime()) / 60000)
        : null;

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
      await supabase
        .from("email_health_alerts")
        .update({ resolved_at: now.toISOString() })
        .eq("alert_type", "system_wide")
        .is("resolved_at", null);
    }

    // ============================================================
    // PER-TENANT INACTIVITY CHECK (ALERT-ONLY)
    // ============================================================
    for (const tenant of tenants || []) {
      if (tenant.is_paused || !tenant.gmail_alias) continue;

      const tenantLastEmail = tenant.last_email_received_at 
        ? new Date(tenant.last_email_received_at) 
        : null;
      const tenantInactive = !tenantLastEmail || tenantLastEmail < thresholdTime;

      if (tenantInactive) {
        const minutesSince = tenantLastEmail 
          ? Math.floor((now.getTime() - tenantLastEmail.getTime()) / 60000)
          : null;

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
        }
      } else {
        await supabase
          .from("email_health_alerts")
          .update({ resolved_at: now.toISOString() })
          .eq("alert_type", "tenant_inactive")
          .eq("tenant_id", tenant.id)
          .is("resolved_at", null);
      }
    }

    // Merge token alerts
    alerts.push(...tokenAlerts);

    // ============================================================
    // INSERT ALERTS (ALERT-ONLY, NO MUTATIONS TO OPERATIONAL TABLES)
    // ============================================================
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

    // Build health summary with all metrics
    const healthSummary = {
      checked_at: now.toISOString(),
      is_business_hours: isBizHours,
      threshold_minutes: thresholdMinutes,
      system_status: systemInactive ? "inactive" : "healthy",
      system_last_email: systemLastEmail?.toISOString() || null,
      queue_pending_count: pendingCount || 0,
      queue_stale_count: staleCount || 0,
      queue_oldest_age_seconds: oldestPendingAgeSeconds,
      queue_processing_stale_count: processingStaleCount || 0,
      unroutable_count_last_15m: unroutableCount15m || 0,
      tenants_checked: tenants?.length || 0,
      alerts_generated: alerts.length,
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
