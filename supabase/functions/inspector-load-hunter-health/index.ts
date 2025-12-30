import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface LoadHunterHealth {
  // Email ingestion
  total_emails_received: number;
  unique_emails_processed: number;
  deduped_emails_count: number;
  dedupe_rate_percentage: number;
  
  // Load processing
  loads_created: number;
  loads_matched: number;
  active_hunts_count: number;
  average_processing_time_ms: number | null;
  
  // Cost-related signals
  geocoding_requests_count: number;
  geocoding_cache_hits: number;
  geocoding_cache_hit_rate: number;
  ai_parsing_calls_count: number;
  
  // Health indicators
  ingestion_enabled: boolean;
  webhook_enabled: boolean;
  last_error_at: string | null;
  errors_last_24h: number;
  queue_pending_count: number;
  queue_failed_count: number;
  oldest_pending_at: string | null;
  queue_lag_seconds: number | null;
  
  // Context
  tenant_id: string | null;
  tenant_name: string | null;
  time_window: string;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Verify platform admin
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single();

    if (profileError || !profile?.is_platform_admin) {
      return new Response(
        JSON.stringify({ error: 'Forbidden - Platform admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Platform admin verified, fetching Load Hunter health...');

    // Parse query params
    const url = new URL(req.url);
    const tenantId = url.searchParams.get('tenant_id');
    const timeWindow = url.searchParams.get('time_window') || 'today';

    // Calculate time range
    const now = new Date();
    const startOfToday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    const last24h = new Date(now.getTime() - 24 * 60 * 60 * 1000);

    let tenantName: string | null = null;
    if (tenantId) {
      const { data: tenant } = await serviceClient
        .from('tenants')
        .select('name')
        .eq('id', tenantId)
        .single();
      tenantName = tenant?.name || null;
    }

    // Build tenant filter for queries
    const tenantFilter = tenantId ? { tenant_id: tenantId } : {};

    // Parallel queries for efficiency
    const [
      emailQueueStats,
      loadEmailsStats,
      loadsCreated,
      matchesStats,
      huntPlansStats,
      geocodingStats,
      aiUsageStats,
      emailVolumeStats,
      featureFlagsResult,
    ] = await Promise.all([
      // Email queue stats
      serviceClient
        .from('email_queue')
        .select('status, queued_at, processed_at, last_error, dedupe_key')
        .gte('queued_at', startOfToday.toISOString())
        .match(tenantFilter),
      
      // Load emails received today
      serviceClient
        .from('load_emails')
        .select('id, status, received_at, created_at')
        .gte('received_at', startOfToday.toISOString())
        .match(tenantFilter),
      
      // Loads created today (via load_emails with assigned_load_id)
      serviceClient
        .from('load_emails')
        .select('assigned_load_id')
        .not('assigned_load_id', 'is', null)
        .gte('received_at', startOfToday.toISOString())
        .match(tenantFilter),
      
      // Matches created today
      serviceClient
        .from('load_hunt_matches')
        .select('id, matched_at')
        .gte('matched_at', startOfToday.toISOString())
        .match(tenantFilter),
      
      // Active hunt plans
      serviceClient
        .from('hunt_plans')
        .select('id')
        .eq('enabled', true)
        .match(tenantFilter),
      
      // Geocoding stats today
      serviceClient
        .from('geocoding_api_tracking')
        .select('was_cache_hit')
        .gte('created_at', startOfToday.toISOString()),
      
      // AI usage today
      serviceClient
        .from('ai_usage_tracking')
        .select('id, feature')
        .gte('created_at', startOfToday.toISOString()),
      
      // Recent email volume stats
      serviceClient
        .from('email_volume_stats')
        .select('*')
        .order('hour_start', { ascending: false })
        .limit(24),
      
      // Feature flags for Load Hunter
      serviceClient
        .from('feature_flags')
        .select('key, default_enabled')
        .in('key', ['load_hunter_enabled', 'load_hunter_matching', 'gmail_webhook_enabled']),
    ]);

    // Calculate email ingestion metrics
    const emailQueueData = emailQueueStats.data || [];
    const totalQueued = emailQueueData.length;
    const processedEmails = emailQueueData.filter(e => e.status === 'processed' || e.status === 'completed');
    const dedupedEmails = emailQueueData.filter(e => e.status === 'deduped_skipped' || e.status === 'duplicate');
    const failedEmails = emailQueueData.filter(e => e.status === 'failed');
    
    const loadEmailsData = loadEmailsStats.data || [];
    const totalEmailsReceived = loadEmailsData.length;
    const uniqueEmailsProcessed = processedEmails.length || loadEmailsData.filter(e => e.status !== 'duplicate').length;
    const dedupedCount = dedupedEmails.length;
    const dedupeRate = totalQueued > 0 ? (dedupedCount / totalQueued) * 100 : 0;

    // Calculate processing time from email_volume_stats
    const volumeStats = emailVolumeStats.data || [];
    const avgProcessingTimes = volumeStats
      .filter(s => s.avg_processing_time_ms !== null)
      .map(s => s.avg_processing_time_ms as number);
    const avgProcessingTime = avgProcessingTimes.length > 0 
      ? Math.round(avgProcessingTimes.reduce((a, b) => a + b, 0) / avgProcessingTimes.length)
      : null;

    // Load processing metrics
    const loadsCreatedCount = loadsCreated.data?.length || 0;
    const matchesCount = matchesStats.data?.length || 0;
    const activeHuntsCount = huntPlansStats.data?.length || 0;

    // Geocoding metrics
    const geocodingData = geocodingStats.data || [];
    const geocodingRequestsCount = geocodingData.length;
    const geocodingCacheHits = geocodingData.filter(g => g.was_cache_hit).length;
    const geocodingCacheHitRate = geocodingRequestsCount > 0 
      ? (geocodingCacheHits / geocodingRequestsCount) * 100 
      : 0;

    // AI parsing calls
    const aiData = aiUsageStats.data || [];
    const aiParsingCalls = aiData.filter(a => 
      a.feature?.includes('parse') || a.feature?.includes('email') || a.feature?.includes('load')
    ).length;

    // Health indicators
    const featureFlags = featureFlagsResult.data || [];
    const ingestionFlag = featureFlags.find(f => f.key === 'load_hunter_enabled');
    const webhookFlag = featureFlags.find(f => f.key === 'gmail_webhook_enabled');
    
    const ingestionEnabled = ingestionFlag?.default_enabled ?? true;
    const webhookEnabled = webhookFlag?.default_enabled ?? true;

    // Error tracking
    const errorsLast24h = failedEmails.length;
    const lastErrorEmail = failedEmails
      .filter(e => e.last_error)
      .sort((a, b) => new Date(b.queued_at).getTime() - new Date(a.queued_at).getTime())[0];
    const lastErrorAt = lastErrorEmail?.queued_at || null;

    // Queue lag - check oldest pending item
    const { data: pendingQueue } = await serviceClient
      .from('email_queue')
      .select('queued_at')
      .eq('status', 'pending')
      .order('queued_at', { ascending: true })
      .limit(1);
    
    const { data: failedQueue } = await serviceClient
      .from('email_queue')
      .select('id')
      .eq('status', 'failed');

    const oldestPending = pendingQueue?.[0];
    const oldestPendingAt = oldestPending?.queued_at || null;
    const queueLagSeconds = oldestPending 
      ? Math.round((now.getTime() - new Date(oldestPending.queued_at).getTime()) / 1000)
      : null;

    const health: LoadHunterHealth = {
      // Email ingestion
      total_emails_received: totalEmailsReceived,
      unique_emails_processed: uniqueEmailsProcessed,
      deduped_emails_count: dedupedCount,
      dedupe_rate_percentage: Math.round(dedupeRate * 100) / 100,
      
      // Load processing
      loads_created: loadsCreatedCount,
      loads_matched: matchesCount,
      active_hunts_count: activeHuntsCount,
      average_processing_time_ms: avgProcessingTime,
      
      // Cost-related signals
      geocoding_requests_count: geocodingRequestsCount,
      geocoding_cache_hits: geocodingCacheHits,
      geocoding_cache_hit_rate: Math.round(geocodingCacheHitRate * 100) / 100,
      ai_parsing_calls_count: aiParsingCalls,
      
      // Health indicators
      ingestion_enabled: ingestionEnabled,
      webhook_enabled: webhookEnabled,
      last_error_at: lastErrorAt,
      errors_last_24h: errorsLast24h,
      queue_pending_count: pendingQueue?.length || 0,
      queue_failed_count: failedQueue?.length || 0,
      oldest_pending_at: oldestPendingAt,
      queue_lag_seconds: queueLagSeconds,
      
      // Context
      tenant_id: tenantId,
      tenant_name: tenantName,
      time_window: timeWindow,
    };

    console.log('Load Hunter health data compiled');

    return new Response(
      JSON.stringify({ health }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
