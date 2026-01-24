import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Cutoff for payload_url health: only consider content created after the MIME/bucket fix
// This prevents legacy data from triggering false "critical" status
const PAYLOAD_URL_FIX_CUTOFF_ISO = '2026-01-24T19:00:00Z';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface RpcMetrics {
  window_minutes: number;
  receipts_count: number;
  unique_content_count: number;
  payload_url_present_count: number;
  queue_total: number;
  queue_unique_dedupe: number;
  unroutable_count: number;
}

interface TimeWindowMetrics {
  window_label: string;
  window_minutes: number;
  email_content_unique_count: number;
  email_content_total_receipts: number;
  email_content_dup_savings_pct: number;
  email_content_payload_url_populated_pct: number;
  email_queue_total_count: number;
  email_queue_unique_dedupe_keys: number;
  email_queue_dedup_collision_count: number;
  unroutable_count: number;
  unroutable_pct: number;
}

interface RecentContentExample {
  content_id: string;
  provider: string;
  content_hash_prefix: string;
  lifetime_receipt_count: number;
  window_receipts_count: number;
  window_duplicates_count: number;
  payload_url_present: boolean;
  last_seen_at: string;
}

interface RecentUnroutableExample {
  received_at: string;
  failure_reason: string | null;
  extracted_alias: string | null;
  delivered_to_header: string | null;
}

interface SanityWarning {
  window: string;
  message: string;
  raw_data: RpcMetrics;
}

interface DedupCostResponse {
  generated_at: string;
  metrics: TimeWindowMetrics[];
  health_status: {
    overall: 'healthy' | 'warning' | 'critical';
    unroutable_15m: 'healthy' | 'warning' | 'critical';
    payload_url_pct: 'healthy' | 'warning' | 'critical';
    queue_collisions: 'healthy' | 'warning' | 'critical';
  };
  payload_url_health_pct: number;
  payload_url_health_window: string;
  recent_content_examples: RecentContentExample[];
  recent_unroutable_examples: RecentUnroutableExample[];
  sanity_warnings: SanityWarning[];
}

function computeMetrics(rpc: RpcMetrics, windowLabel: string): TimeWindowMetrics {
  const receiptsCount = rpc.receipts_count || 0;
  const uniqueCount = rpc.unique_content_count || 0;
  const payloadUrlCount = rpc.payload_url_present_count || 0;
  const queueTotal = rpc.queue_total || 0;
  const queueUnique = rpc.queue_unique_dedupe || 0;
  const unroutableCount = rpc.unroutable_count || 0;

  const dupSavingsPct = receiptsCount > 0
    ? Math.round(((receiptsCount - uniqueCount) / receiptsCount) * 10000) / 100
    : 0;

  const payloadUrlPct = uniqueCount > 0
    ? Math.round((payloadUrlCount / uniqueCount) * 10000) / 100
    : 100;

  const totalInWindow = queueTotal + unroutableCount;
  const unroutablePct = totalInWindow > 0
    ? Math.round((unroutableCount / totalInWindow) * 10000) / 100
    : 0;

  return {
    window_label: windowLabel,
    window_minutes: rpc.window_minutes,
    email_content_unique_count: uniqueCount,
    email_content_total_receipts: receiptsCount,
    email_content_dup_savings_pct: dupSavingsPct,
    email_content_payload_url_populated_pct: payloadUrlPct,
    email_queue_total_count: queueTotal,
    email_queue_unique_dedupe_keys: queueUnique,
    email_queue_dedup_collision_count: queueTotal - queueUnique,
    unroutable_count: unroutableCount,
    unroutable_pct: unroutablePct,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Verify admin/platform-admin access
    const authHeader = req.headers.get('authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check platform admin
    const { data: profile } = await supabase
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_platform_admin) {
      return new Response(JSON.stringify({ error: 'Platform admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[inspector-dedup-cost] Fetching metrics for platform admin ${user.id}`);

    // Fetch metrics using efficient RPC (no full-row scans)
    const [rpc15m, rpc60m, rpc24h] = await Promise.all([
      supabase.rpc('get_dedup_cost_metrics', { p_window_minutes: 15 }),
      supabase.rpc('get_dedup_cost_metrics', { p_window_minutes: 60 }),
      supabase.rpc('get_dedup_cost_metrics', { p_window_minutes: 1440 }),
    ]);

    // Strict error handling for ALL RPC calls
    if (rpc15m.error) {
      console.error('[inspector-dedup-cost] RPC 15m error:', rpc15m.error);
      throw new Error(`RPC 15m error: ${rpc15m.error.message}`);
    }
    if (rpc60m.error) {
      console.error('[inspector-dedup-cost] RPC 60m error:', rpc60m.error);
      throw new Error(`RPC 60m error: ${rpc60m.error.message}`);
    }
    if (rpc24h.error) {
      console.error('[inspector-dedup-cost] RPC 24h error:', rpc24h.error);
      throw new Error(`RPC 24h error: ${rpc24h.error.message}`);
    }

    // Collect sanity warnings
    const sanityWarnings: SanityWarning[] = [];

    // Sanity checks with logging
    const runSanityCheck = (label: string, rpc: RpcMetrics) => {
      // Queue total must be >= unique dedupe keys
      if (rpc.queue_total < rpc.queue_unique_dedupe) {
        const warning = {
          window: label,
          message: `queue_total (${rpc.queue_total}) < queue_unique_dedupe (${rpc.queue_unique_dedupe})`,
          raw_data: rpc,
        };
        sanityWarnings.push(warning);
        console.warn(`[inspector-dedup-cost] SANITY CHECK FAILED:`, warning);
      }
      
      // Receipts count must be >= unique content count
      if (rpc.receipts_count < rpc.unique_content_count) {
        const warning = {
          window: label,
          message: `receipts_count (${rpc.receipts_count}) < unique_content_count (${rpc.unique_content_count})`,
          raw_data: rpc,
        };
        sanityWarnings.push(warning);
        console.warn(`[inspector-dedup-cost] SANITY CHECK FAILED:`, warning);
      }
      
      // Payload URL count can't exceed unique content count
      if (rpc.payload_url_present_count > rpc.unique_content_count) {
        const warning = {
          window: label,
          message: `payload_url_present_count (${rpc.payload_url_present_count}) > unique_content_count (${rpc.unique_content_count})`,
          raw_data: rpc,
        };
        sanityWarnings.push(warning);
        console.warn(`[inspector-dedup-cost] SANITY CHECK FAILED:`, warning);
      }
    };

    runSanityCheck('15m', rpc15m.data as RpcMetrics);
    runSanityCheck('60m', rpc60m.data as RpcMetrics);
    runSanityCheck('24h', rpc24h.data as RpcMetrics);

    const metrics15m = computeMetrics(rpc15m.data as RpcMetrics, 'Last 15 min');
    const metrics60m = computeMetrics(rpc60m.data as RpcMetrics, 'Last 60 min');
    const metrics24h = computeMetrics(rpc24h.data as RpcMetrics, 'Last 24 hours');

    // Compute payload_url health using 15m window (most current, avoids legacy data skew)
    // This reflects current pipeline health, not historical issues
    const payloadUrlHealthPct = metrics15m.email_content_payload_url_populated_pct;
    const payloadUrlHealthWindow = '15m';

    // Fetch recent content examples (last 10)
    const { data: recentContent } = await supabase
      .from('email_content')
      .select('id, provider, content_hash, receipt_count, payload_url, last_seen_at')
      .order('last_seen_at', { ascending: false })
      .limit(10);

    // Get window-based receipt counts for these content IDs (last 15 minutes)
    const contentIds = (recentContent || []).map(row => row.id);
    const windowCutoff = new Date(Date.now() - 15 * 60 * 1000).toISOString();
    
    let windowReceiptCounts: Record<string, number> = {};
    if (contentIds.length > 0) {
      const { data: windowReceipts } = await supabase
        .from('email_receipts')
        .select('content_id')
        .in('content_id', contentIds)
        .gte('received_at', windowCutoff);
      
      // Count receipts per content_id
      (windowReceipts || []).forEach(row => {
        windowReceiptCounts[row.content_id] = (windowReceiptCounts[row.content_id] || 0) + 1;
      });
    }

    const recentContentExamples: RecentContentExample[] = (recentContent || []).map(row => {
      const windowCount = windowReceiptCounts[row.id] || 0;
      return {
        content_id: row.id,
        provider: row.provider || 'unknown',
        content_hash_prefix: (row.content_hash || '').substring(0, 12) + '...',
        lifetime_receipt_count: row.receipt_count || 1,
        window_receipts_count: windowCount,
        window_duplicates_count: Math.max(windowCount - 1, 0),
        payload_url_present: row.payload_url != null,
        last_seen_at: row.last_seen_at,
      };
    });

    const { data: recentUnroutable } = await supabase
      .from('unroutable_emails')
      .select('received_at, failure_reason, extracted_alias, delivered_to_header')
      .order('received_at', { ascending: false })
      .limit(10);

    const recentUnroutableExamples: RecentUnroutableExample[] = (recentUnroutable || []).map(row => ({
      received_at: row.received_at,
      failure_reason: row.failure_reason,
      extracted_alias: row.extracted_alias,
      delivered_to_header: row.delivered_to_header?.substring(0, 50) || null,
    }));

    // Compute health status using appropriate windows
    const unroutable15mStatus: 'healthy' | 'warning' | 'critical' =
      metrics15m.unroutable_count >= 200 ? 'critical' :
      metrics15m.unroutable_count >= 50 ? 'warning' : 'healthy';

    // Use 60m payload URL % for health (avoids legacy data issues)
    const payloadUrlStatus: 'healthy' | 'warning' | 'critical' =
      payloadUrlHealthPct < 80 ? 'critical' :
      payloadUrlHealthPct < 95 ? 'warning' : 'healthy';

    const queueCollisionStatus: 'healthy' | 'warning' | 'critical' =
      metrics15m.email_queue_dedup_collision_count > 10 ? 'critical' :
      metrics15m.email_queue_dedup_collision_count > 0 ? 'warning' : 'healthy';

    const overallStatus: 'healthy' | 'warning' | 'critical' =
      unroutable15mStatus === 'critical' || payloadUrlStatus === 'critical' || queueCollisionStatus === 'critical' ? 'critical' :
      unroutable15mStatus === 'warning' || payloadUrlStatus === 'warning' || queueCollisionStatus === 'warning' ? 'warning' : 'healthy';

    const response: DedupCostResponse = {
      generated_at: new Date().toISOString(),
      metrics: [metrics15m, metrics60m, metrics24h],
      health_status: {
        overall: overallStatus,
        unroutable_15m: unroutable15mStatus,
        payload_url_pct: payloadUrlStatus,
        queue_collisions: queueCollisionStatus,
      },
      payload_url_health_pct: payloadUrlHealthPct,
      payload_url_health_window: payloadUrlHealthWindow,
      recent_content_examples: recentContentExamples,
      recent_unroutable_examples: recentUnroutableExamples,
      sanity_warnings: sanityWarnings,
    };

    console.log(`[inspector-dedup-cost] Health: ${overallStatus}, Unroutable15m: ${metrics15m.unroutable_count}, PayloadURL60m: ${payloadUrlHealthPct}%, Warnings: ${sanityWarnings.length}`);

    return new Response(JSON.stringify(response), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[inspector-dedup-cost] Error:`, error);
    return new Response(JSON.stringify({
      error: error instanceof Error ? error.message : 'Unknown error'
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
