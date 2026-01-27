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

    // ============================================================================
    // GUARD: Exit immediately if no tenants have load_hunter_enabled
    // This avoids expensive health checks when Load Hunter is not in use
    // ============================================================================
    const { count: loadHunterTenantCount, error: guardError } = await supabase
      .from('tenant_feature_flags')
      .select('id', { count: 'exact', head: true })
      .eq('enabled', true)
      .in('feature_flag_id', 
        supabase.from('feature_flags').select('id').eq('key', 'load_hunter_enabled')
      );

    // Fallback: if complex query fails, try simpler check
    let hasLoadHunterTenants = true; // fail-open
    if (guardError) {
      console.error('[check-email-health] Guard query error, using fallback:', guardError);
      // Simple fallback: check if any gmail_tokens exist (proxy for Load Hunter usage)
      const { count: tokenCount } = await supabase
        .from('gmail_tokens')
        .select('id', { count: 'exact', head: true });
      hasLoadHunterTenants = (tokenCount || 0) > 0;
    } else {
      hasLoadHunterTenants = (loadHunterTenantCount || 0) > 0;
    }

    if (!hasLoadHunterTenants) {
      console.log('[check-email-health] ⚡ GUARD: No tenants with Load Hunter enabled, exiting early');
      return new Response(
        JSON.stringify({ 
          guarded: true, 
          message: 'No Load Hunter tenants configured',
          checked_at: new Date().toISOString()
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[check-email-health] Found ${loadHunterTenantCount || 'some'} Load Hunter tenant(s), proceeding with health check`);

    const now = new Date();
    const isBizHours = isBusinessHours(now);
    const thresholdMinutes = getThresholdMinutes(now);
    const thresholdTime = new Date(now.getTime() - thresholdMinutes * 60 * 1000);
    const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000).toISOString();
    const fifteenMinutesAgo = new Date(now.getTime() - 15 * 60 * 1000).toISOString();

    console.log(`[check-email-health] Running at ${now.toISOString()}`);
    console.log(`[check-email-health] Business hours: ${isBizHours}, Threshold: ${thresholdMinutes} minutes`);

    // Unroutable spike thresholds
    const UNROUTABLE_WARNING_THRESHOLD = 50;
    const UNROUTABLE_CRITICAL_THRESHOLD = 200;

    const alerts: Array<{
      type: string;
      level: string;
      tenantId: string | null;
      tenantName: string | null;
      message: string;
      minutesSinceLastEmail: number | null;
      escalatedFromWarning?: boolean;
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

    // ============================================================
    // CANONICAL QUEUE METRICS - ALL FROM SAME POPULATION
    // Queue scope: status IN ('pending', 'processing')
    // Stale logic:
    //   - pending: stale if now - queued_at >= 120s
    //   - processing: stale if now - processing_started_at >= 120s
    // ============================================================
    const staleThresholdTime = new Date(now.getTime() - QUEUE_STALE_THRESHOLD_SECONDS * 1000).toISOString();
    const processingStuckTime = new Date(now.getTime() - QUEUE_PROCESSING_STALE_SECONDS * 1000).toISOString();

    // Query 4a: Pending-only count
    const { count: pendingOnlyCount } = await supabase
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending");

    // Query 4b: Processing-only count
    const { count: processingOnlyCount } = await supabase
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "processing");

    // Query 5a: Stale pending count (queued_at < staleThreshold)
    const { count: stalePendingCount } = await supabase
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "pending")
      .lt("queued_at", staleThresholdTime);

    // Query 5b: Stale processing count (processing_started_at < staleThreshold)
    const { count: staleProcessingCount } = await supabase
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "processing")
      .lt("processing_started_at", staleThresholdTime);

    // Query 6a: Oldest pending item by queued_at
    const { data: oldestPendingRow } = await supabase
      .from("email_queue")
      .select("queued_at")
      .eq("status", "pending")
      .order("queued_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    // Query 6b: Oldest processing item by processing_started_at
    const { data: oldestProcessingRow } = await supabase
      .from("email_queue")
      .select("processing_started_at")
      .eq("status", "processing")
      .order("processing_started_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    // Query 7: Processing stuck count >10min (processing_started_at < processingStuckTime)
    const { count: processingStuckCount } = await supabase
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .eq("status", "processing")
      .lt("processing_started_at", processingStuckTime);

    // Compute canonical metrics from the same population
    const queueTotalCount = (pendingOnlyCount || 0) + (processingOnlyCount || 0);
    const queueStalePendingCount = stalePendingCount || 0;
    const queueStaleProcessingCount = staleProcessingCount || 0;
    const queueStaleTotal = queueStalePendingCount + queueStaleProcessingCount;

    // Oldest age must come from the oldest of the two oldest rows
    let queueOldestQueuedAt: string | null = null;
    let queueOldestAgeSeconds: number | null = null;

    const pendingAge = oldestPendingRow?.queued_at
      ? Math.floor((now.getTime() - new Date(oldestPendingRow.queued_at).getTime()) / 1000)
      : null;
    const processingAge = oldestProcessingRow?.processing_started_at
      ? Math.floor((now.getTime() - new Date(oldestProcessingRow.processing_started_at).getTime()) / 1000)
      : null;

    // Choose the older of the two
    if (pendingAge !== null && processingAge !== null && oldestPendingRow && oldestProcessingRow) {
      if (pendingAge >= processingAge) {
        queueOldestAgeSeconds = pendingAge;
        queueOldestQueuedAt = oldestPendingRow.queued_at;
      } else {
        queueOldestAgeSeconds = processingAge;
        queueOldestQueuedAt = oldestProcessingRow.processing_started_at;
      }
    } else if (pendingAge !== null && oldestPendingRow) {
      queueOldestAgeSeconds = pendingAge;
      queueOldestQueuedAt = oldestPendingRow.queued_at;
    } else if (processingAge !== null && oldestProcessingRow) {
      queueOldestAgeSeconds = processingAge;
      queueOldestQueuedAt = oldestProcessingRow.processing_started_at;
    }
    // If both null, oldest is null (queue empty)

    // Query 8: Unroutable count last 15min
    const { count: unroutableCount15m } = await supabase
      .from("unroutable_emails")
      .select("*", { count: "exact", head: true })
      .gte("received_at", fifteenMinutesAgo);

    // Query 9: Email queue count last 15min for context
    const { count: emailQueueCount15m } = await supabase
      .from("email_queue")
      .select("*", { count: "exact", head: true })
      .gte("queued_at", fifteenMinutesAgo);

    // Compute unroutable percentage
    const totalEmails15m = (emailQueueCount15m || 0) + (unroutableCount15m || 0);
    const unroutablePct15m = totalEmails15m > 0 
      ? Math.round(((unroutableCount15m || 0) / totalEmails15m) * 10000) / 100 
      : 0;

    // Explainable backlog message for logging (always consistent)
    const backlogExplain = `Queue backlog: total=${queueTotalCount}, pending=${pendingOnlyCount || 0}, processing=${processingOnlyCount || 0}, stale_pending=${queueStalePendingCount}, stale_processing=${queueStaleProcessingCount}, oldest_age=${queueOldestAgeSeconds ?? 'N/A'}s, stuck_processing_10m=${processingStuckCount || 0}`;

    console.log(`[check-email-health] ${backlogExplain}`);
    console.log(`[check-email-health] Unroutable: count_15m=${unroutableCount15m || 0}, queue_15m=${emailQueueCount15m || 0}, pct=${unroutablePct15m}%`);

    // ============================================================
    // QUEUE BACKLOG ALERT (MORE SENSITIVE THRESHOLDS + ESCALATION BYPASS)
    // ============================================================
    // WARNING: oldest_age >= 60s OR total pending > 100
    // CRITICAL: oldest_age >= 120s OR total stale count >= 10
    const hasWarningBacklog = 
      (queueOldestAgeSeconds !== null && queueOldestAgeSeconds >= QUEUE_WARNING_AGE_SECONDS) ||
      queueTotalCount > QUEUE_PENDING_COUNT_THRESHOLD;
    
    const hasCriticalBacklog = 
      (queueOldestAgeSeconds !== null && queueOldestAgeSeconds >= QUEUE_CRITICAL_AGE_SECONDS) ||
      queueStaleTotal >= QUEUE_STALE_COUNT_CRITICAL;

    const hasBacklog = hasWarningBacklog || hasCriticalBacklog;
    
    if (hasBacklog) {
      // Check for existing unresolved alert
      const { data: existingBacklogAlert } = await supabase
        .from("email_health_alerts")
        .select("id, alert_level, sent_at")
        .eq("alert_type", "queue_backlog")
        .is("resolved_at", null)
        .order("sent_at", { ascending: false })
        .limit(1);

      const existingAlert = existingBacklogAlert?.[0];
      const isRateLimited = existingAlert && new Date(existingAlert.sent_at) >= new Date(oneHourAgo);
      const isEscalation = isRateLimited && existingAlert.alert_level === "warning" && hasCriticalBacklog;

      // Build alert message with context metrics - using explainable backlog message
      const stuckInfo = processingStuckCount && processingStuckCount > 0 ? `, stuck_workers_10m: ${processingStuckCount}` : "";
      const unroutableInfo = unroutableCount15m && unroutableCount15m > 0 ? `, unroutable_15m: ${unroutableCount15m} (${unroutablePct15m}%)` : "";
      const contextInfo = `, queue_15m: ${emailQueueCount15m || 0}`;
      
      const backlogMessage = `Queue backlog: total=${queueTotalCount}, pending=${pendingOnlyCount || 0}, processing=${processingOnlyCount || 0}, stale_pending=${queueStalePendingCount}, stale_processing=${queueStaleProcessingCount}, oldest_age=${queueOldestAgeSeconds ?? 'N/A'}s${stuckInfo}${unroutableInfo}${contextInfo}`;

      // Allow alert if: not rate-limited OR escalating from warning->critical
      if (!isRateLimited || isEscalation) {
        if (isEscalation) {
          // Update existing alert to critical level
          await supabase
            .from("email_health_alerts")
            .update({ 
              alert_level: "critical", 
              message: `[ESCALATED] ${backlogMessage}`,
              sent_at: now.toISOString() 
            })
            .eq("id", existingAlert.id);
          
          console.log(`[check-email-health] Escalated queue_backlog from warning to critical`);
        }
        
        alerts.push({
          type: "queue_backlog",
          level: hasCriticalBacklog ? "critical" : "warning",
          tenantId: null,
          tenantName: null,
          message: isEscalation ? `[ESCALATED] ${backlogMessage}` : backlogMessage,
          minutesSinceLastEmail: null,
          escalatedFromWarning: isEscalation,
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
    // UNROUTABLE SPIKE ALERT (SEPARATE FROM QUEUE BACKLOG)
    // ============================================================
    // WARNING: >= 50 unroutable in 15min
    // CRITICAL: >= 200 unroutable in 15min
    const unroutableVal = unroutableCount15m || 0;
    const hasUnroutableWarning = unroutableVal >= UNROUTABLE_WARNING_THRESHOLD;
    const hasUnroutableCritical = unroutableVal >= UNROUTABLE_CRITICAL_THRESHOLD;
    const hasUnroutableSpike = hasUnroutableWarning || hasUnroutableCritical;

    if (hasUnroutableSpike) {
      // Check for existing unresolved alert with escalation logic
      const { data: existingUnroutableAlert } = await supabase
        .from("email_health_alerts")
        .select("id, alert_level, sent_at")
        .eq("alert_type", "unroutable_spike")
        .is("resolved_at", null)
        .order("sent_at", { ascending: false })
        .limit(1);

      const existingAlert = existingUnroutableAlert?.[0];
      const isRateLimited = existingAlert && new Date(existingAlert.sent_at) >= new Date(oneHourAgo);
      const isEscalation = isRateLimited && existingAlert.alert_level === "warning" && hasUnroutableCritical;

      const unroutableMessage = `Unroutable spike: ${unroutableVal} emails in last 15min (${unroutablePct15m}% of ${totalEmails15m} total)`;

      if (!isRateLimited || isEscalation) {
        if (isEscalation) {
          await supabase
            .from("email_health_alerts")
            .update({ 
              alert_level: "critical", 
              message: `[ESCALATED] ${unroutableMessage}`,
              sent_at: now.toISOString() 
            })
            .eq("id", existingAlert.id);
          
          console.log(`[check-email-health] Escalated unroutable_spike from warning to critical`);
        }
        
        alerts.push({
          type: "unroutable_spike",
          level: hasUnroutableCritical ? "critical" : "warning",
          tenantId: null,
          tenantName: null,
          message: isEscalation ? `[ESCALATED] ${unroutableMessage}` : unroutableMessage,
          minutesSinceLastEmail: null,
          escalatedFromWarning: isEscalation,
        });
      }
    } else {
      // Resolve any existing unroutable_spike alerts
      await supabase
        .from("email_health_alerts")
        .update({ resolved_at: now.toISOString() })
        .eq("alert_type", "unroutable_spike")
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

    // Build health summary with all metrics including context
    // All queue metrics derived from same canonical population
    const healthSummary = {
      checked_at: now.toISOString(),
      is_business_hours: isBizHours,
      threshold_minutes: thresholdMinutes,
      system_status: systemInactive ? "inactive" : "healthy",
      system_last_email: systemLastEmail?.toISOString() || null,
      // New canonical queue metrics
      queue_total_count: queueTotalCount,
      queue_pending_only_count: pendingOnlyCount || 0,
      queue_processing_only_count: processingOnlyCount || 0,
      queue_stale_pending_count: queueStalePendingCount,
      queue_stale_processing_count: queueStaleProcessingCount,
      queue_oldest_age_seconds: queueOldestAgeSeconds,
      queue_oldest_queued_at: queueOldestQueuedAt,
      queue_processing_stuck_count: processingStuckCount || 0,
      // Context metrics
      email_queue_count_last_15m: emailQueueCount15m || 0,
      unroutable_count_last_15m: unroutableCount15m || 0,
      unroutable_pct_last_15m: unroutablePct15m,
      tenants_checked: tenants?.length || 0,
      alerts_generated: alerts.length,
      escalations_triggered: alerts.filter(a => a.escalatedFromWarning).length,
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
