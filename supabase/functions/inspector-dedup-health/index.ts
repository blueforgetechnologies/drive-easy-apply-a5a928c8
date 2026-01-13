import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

interface DedupHealthMetrics {
  time_window_hours: number;
  
  // Overall counts
  total_emails: number;
  eligible_count: number;
  eligible_missing_fingerprint: number;
  eligible_missing_fk: number;
  
  // Rates
  coverage_rate: number; // % with parsed_load_fingerprint
  fk_coverage_rate: number; // % of eligible with load_content_fingerprint
  reuse_rate: number; // % load_content with receipt_count > 1
  
  // Breakdown by provider
  by_provider: Record<string, {
    total: number;
    eligible: number;
    eligible_missing_fp: number;
    eligible_missing_fk: number;
  }>;
  
  // Breakdown by ingestion_source
  by_ingestion_source: Record<string, {
    total: number;
    eligible: number;
    eligible_missing_fp: number;
    eligible_missing_fk: number;
  }>;
  
  // Top fingerprint_missing_reason
  top_fingerprint_missing_reasons: Array<{
    reason: string;
    count: number;
  }>;
  
  // Top dedup_eligible_reason (for non-eligible)
  top_dedup_eligible_reasons: Array<{
    reason: string;
    count: number;
  }>;
  
  // load_content stats
  load_content: {
    total_unique: number;
    with_receipt_count_gt_1: number;
    avg_receipt_count: number;
    max_receipt_count: number;
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

    // Parse request
    const url = new URL(req.url);
    const timeWindowHours = parseInt(url.searchParams.get('hours') || '1', 10);
    const cutoffTime = new Date(Date.now() - timeWindowHours * 60 * 60 * 1000).toISOString();

    console.log(`[inspector-dedup-health] Fetching metrics for last ${timeWindowHours} hour(s)`);

    // Fetch load_emails stats in parallel
    const [
      totalResult,
      eligibleResult,
      eligibleMissingFpResult,
      eligibleMissingFkResult,
      byProviderResult,
      byIngestionSourceResult,
      topFpMissingReasonResult,
      topDedupReasonResult,
      loadContentStatsResult,
    ] = await Promise.all([
      // Total emails in window
      supabase
        .from('load_emails')
        .select('id', { count: 'exact', head: true })
        .gte('received_at', cutoffTime),
      
      // Eligible count
      supabase
        .from('load_emails')
        .select('id', { count: 'exact', head: true })
        .gte('received_at', cutoffTime)
        .eq('dedup_eligible', true),
      
      // Eligible but missing fingerprint (should be 0 with guardrail)
      supabase
        .from('load_emails')
        .select('id', { count: 'exact', head: true })
        .gte('received_at', cutoffTime)
        .eq('dedup_eligible', true)
        .is('parsed_load_fingerprint', null),
      
      // Eligible but missing FK
      supabase
        .from('load_emails')
        .select('id', { count: 'exact', head: true })
        .gte('received_at', cutoffTime)
        .eq('dedup_eligible', true)
        .not('parsed_load_fingerprint', 'is', null)
        .is('load_content_fingerprint', null),
      
      // By provider (email_source)
      supabase
        .from('load_emails')
        .select('email_source, dedup_eligible, parsed_load_fingerprint, load_content_fingerprint')
        .gte('received_at', cutoffTime),
      
      // By ingestion_source
      supabase
        .from('load_emails')
        .select('ingestion_source, dedup_eligible, parsed_load_fingerprint, load_content_fingerprint')
        .gte('received_at', cutoffTime),
      
      // Top fingerprint_missing_reason
      supabase
        .from('load_emails')
        .select('fingerprint_missing_reason')
        .gte('received_at', cutoffTime)
        .not('fingerprint_missing_reason', 'is', null),
      
      // Top dedup_eligible_reason
      supabase
        .from('load_emails')
        .select('dedup_eligible_reason')
        .gte('received_at', cutoffTime)
        .eq('dedup_eligible', false)
        .not('dedup_eligible_reason', 'is', null),
      
      // load_content stats
      supabase
        .from('load_content')
        .select('fingerprint, receipt_count'),
    ]);

    // Aggregate by provider
    const byProvider: Record<string, { total: number; eligible: number; eligible_missing_fp: number; eligible_missing_fk: number }> = {};
    if (byProviderResult.data) {
      for (const row of byProviderResult.data) {
        const key = row.email_source || 'unknown';
        if (!byProvider[key]) {
          byProvider[key] = { total: 0, eligible: 0, eligible_missing_fp: 0, eligible_missing_fk: 0 };
        }
        byProvider[key].total++;
        if (row.dedup_eligible) {
          byProvider[key].eligible++;
          if (!row.parsed_load_fingerprint) {
            byProvider[key].eligible_missing_fp++;
          } else if (!row.load_content_fingerprint) {
            byProvider[key].eligible_missing_fk++;
          }
        }
      }
    }

    // Aggregate by ingestion_source
    const byIngestionSource: Record<string, { total: number; eligible: number; eligible_missing_fp: number; eligible_missing_fk: number }> = {};
    if (byIngestionSourceResult.data) {
      for (const row of byIngestionSourceResult.data) {
        const key = row.ingestion_source || 'unknown';
        if (!byIngestionSource[key]) {
          byIngestionSource[key] = { total: 0, eligible: 0, eligible_missing_fp: 0, eligible_missing_fk: 0 };
        }
        byIngestionSource[key].total++;
        if (row.dedup_eligible) {
          byIngestionSource[key].eligible++;
          if (!row.parsed_load_fingerprint) {
            byIngestionSource[key].eligible_missing_fp++;
          } else if (!row.load_content_fingerprint) {
            byIngestionSource[key].eligible_missing_fk++;
          }
        }
      }
    }

    // Aggregate top fingerprint_missing_reason
    const fpMissingReasons: Record<string, number> = {};
    if (topFpMissingReasonResult.data) {
      for (const row of topFpMissingReasonResult.data) {
        const reason = row.fingerprint_missing_reason || 'unknown';
        fpMissingReasons[reason] = (fpMissingReasons[reason] || 0) + 1;
      }
    }
    const topFpReasons = Object.entries(fpMissingReasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // Aggregate top dedup_eligible_reason
    const dedupReasons: Record<string, number> = {};
    if (topDedupReasonResult.data) {
      for (const row of topDedupReasonResult.data) {
        const reason = row.dedup_eligible_reason || 'unknown';
        dedupReasons[reason] = (dedupReasons[reason] || 0) + 1;
      }
    }
    const topDedupReasons = Object.entries(dedupReasons)
      .map(([reason, count]) => ({ reason, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10);

    // load_content stats
    let lcTotal = 0;
    let lcWithReuse = 0;
    let lcTotalReceipts = 0;
    let lcMaxReceipts = 0;
    if (loadContentStatsResult.data) {
      lcTotal = loadContentStatsResult.data.length;
      for (const row of loadContentStatsResult.data) {
        const rc = row.receipt_count || 1;
        lcTotalReceipts += rc;
        if (rc > 1) lcWithReuse++;
        if (rc > lcMaxReceipts) lcMaxReceipts = rc;
      }
    }

    const totalEmails = totalResult.count || 0;
    const eligibleCount = eligibleResult.count || 0;
    const eligibleMissingFp = eligibleMissingFpResult.count || 0;
    const eligibleMissingFk = eligibleMissingFkResult.count || 0;

    // Coverage rate: % of all emails with parsed_load_fingerprint
    // (we need to query this)
    const { count: withFpCount } = await supabase
      .from('load_emails')
      .select('id', { count: 'exact', head: true })
      .gte('received_at', cutoffTime)
      .not('parsed_load_fingerprint', 'is', null);

    const coverageRate = totalEmails > 0 ? ((withFpCount || 0) / totalEmails) * 100 : 0;
    const fkCoverageRate = eligibleCount > 0 ? ((eligibleCount - eligibleMissingFk) / eligibleCount) * 100 : 0;
    const reuseRate = lcTotal > 0 ? (lcWithReuse / lcTotal) * 100 : 0;

    const metrics: DedupHealthMetrics = {
      time_window_hours: timeWindowHours,
      total_emails: totalEmails,
      eligible_count: eligibleCount,
      eligible_missing_fingerprint: eligibleMissingFp,
      eligible_missing_fk: eligibleMissingFk,
      coverage_rate: Math.round(coverageRate * 100) / 100,
      fk_coverage_rate: Math.round(fkCoverageRate * 100) / 100,
      reuse_rate: Math.round(reuseRate * 100) / 100,
      by_provider: byProvider,
      by_ingestion_source: byIngestionSource,
      top_fingerprint_missing_reasons: topFpReasons,
      top_dedup_eligible_reasons: topDedupReasons,
      load_content: {
        total_unique: lcTotal,
        with_receipt_count_gt_1: lcWithReuse,
        avg_receipt_count: lcTotal > 0 ? Math.round((lcTotalReceipts / lcTotal) * 100) / 100 : 0,
        max_receipt_count: lcMaxReceipts,
      },
    };

    console.log(`[inspector-dedup-health] Metrics: coverage=${metrics.coverage_rate}% fk_coverage=${metrics.fk_coverage_rate}% reuse=${metrics.reuse_rate}%`);

    return new Response(JSON.stringify(metrics), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error(`[inspector-dedup-health] Error: ${error}`);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
