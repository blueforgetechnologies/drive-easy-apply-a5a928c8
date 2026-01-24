import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface TimeWindowMetrics {
  window_label: string;
  window_minutes: number;
  
  // email_content metrics
  email_content_unique_count: number;
  email_content_total_receipts: number;
  email_content_dup_savings_pct: number;
  email_content_payload_url_populated_pct: number;
  
  // email_queue metrics
  email_queue_total_count: number;
  email_queue_unique_dedupe_keys: number;
  email_queue_dedup_collision_count: number;
  
  // unroutable metrics
  unroutable_count: number;
  unroutable_pct: number;
}

interface RecentContentExample {
  provider: string;
  content_hash_prefix: string;
  receipt_count: number;
  payload_url_present: boolean;
  last_seen_at: string;
}

interface RecentUnroutableExample {
  received_at: string;
  failure_reason: string | null;
  extracted_alias: string | null;
  delivered_to_header: string | null;
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
  recent_content_examples: RecentContentExample[];
  recent_unroutable_examples: RecentUnroutableExample[];
}

async function getMetricsForWindow(windowMinutes: number, windowLabel: string): Promise<TimeWindowMetrics> {
  const cutoff = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  
  // email_content metrics - unique count and receipt_count sum
  const { data: contentData } = await supabase
    .from('email_content')
    .select('id, receipt_count, payload_url')
    .gte('first_seen_at', cutoff);
  
  const uniqueCount = contentData?.length || 0;
  const totalReceipts = contentData?.reduce((sum, row) => sum + (row.receipt_count || 1), 0) || 0;
  const withPayloadUrl = contentData?.filter(row => row.payload_url != null).length || 0;
  
  const dupSavingsPct = totalReceipts > 0 
    ? Math.round(((totalReceipts - uniqueCount) / totalReceipts) * 10000) / 100 
    : 0;
  const payloadUrlPct = uniqueCount > 0 
    ? Math.round((withPayloadUrl / uniqueCount) * 10000) / 100 
    : 100;
  
  // email_queue metrics
  const { count: queueTotalCount } = await supabase
    .from('email_queue')
    .select('id', { count: 'exact', head: true })
    .gte('queued_at', cutoff);
  
  const { data: queueDedupeData } = await supabase
    .from('email_queue')
    .select('dedupe_key')
    .gte('queued_at', cutoff);
  
  const uniqueDedupeKeys = new Set(queueDedupeData?.map(row => row.dedupe_key).filter(Boolean)).size;
  const queueTotal = queueTotalCount || 0;
  const collisionCount = queueTotal - uniqueDedupeKeys;
  
  // unroutable metrics
  const { count: unroutableCount } = await supabase
    .from('unroutable_emails')
    .select('id', { count: 'exact', head: true })
    .gte('received_at', cutoff);
  
  const totalInWindow = queueTotal + (unroutableCount || 0);
  const unroutablePct = totalInWindow > 0 
    ? Math.round(((unroutableCount || 0) / totalInWindow) * 10000) / 100 
    : 0;
  
  return {
    window_label: windowLabel,
    window_minutes: windowMinutes,
    email_content_unique_count: uniqueCount,
    email_content_total_receipts: totalReceipts,
    email_content_dup_savings_pct: dupSavingsPct,
    email_content_payload_url_populated_pct: payloadUrlPct,
    email_queue_total_count: queueTotal,
    email_queue_unique_dedupe_keys: uniqueDedupeKeys,
    email_queue_dedup_collision_count: collisionCount,
    unroutable_count: unroutableCount || 0,
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

    // Fetch metrics for all time windows in parallel
    const [metrics15m, metrics60m, metrics24h] = await Promise.all([
      getMetricsForWindow(15, 'Last 15 min'),
      getMetricsForWindow(60, 'Last 60 min'),
      getMetricsForWindow(1440, 'Last 24 hours'),
    ]);

    // Fetch recent examples
    const { data: recentContent } = await supabase
      .from('email_content')
      .select('provider, content_hash, receipt_count, payload_url, last_seen_at')
      .order('last_seen_at', { ascending: false })
      .limit(10);

    const recentContentExamples: RecentContentExample[] = (recentContent || []).map(row => ({
      provider: row.provider || 'unknown',
      content_hash_prefix: (row.content_hash || '').substring(0, 12) + '...',
      receipt_count: row.receipt_count || 1,
      payload_url_present: row.payload_url != null,
      last_seen_at: row.last_seen_at,
    }));

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

    // Compute health status
    const unroutable15mStatus: 'healthy' | 'warning' | 'critical' = 
      metrics15m.unroutable_count >= 200 ? 'critical' :
      metrics15m.unroutable_count >= 50 ? 'warning' : 'healthy';

    const payloadUrlStatus: 'healthy' | 'warning' | 'critical' = 
      metrics24h.email_content_payload_url_populated_pct < 80 ? 'critical' :
      metrics24h.email_content_payload_url_populated_pct < 95 ? 'warning' : 'healthy';

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
      recent_content_examples: recentContentExamples,
      recent_unroutable_examples: recentUnroutableExamples,
    };

    console.log(`[inspector-dedup-cost] Health: ${overallStatus}, Unroutable15m: ${metrics15m.unroutable_count}, PayloadURL%: ${metrics24h.email_content_payload_url_populated_pct}%`);

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
