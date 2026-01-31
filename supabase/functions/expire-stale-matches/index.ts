import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// Match record type from query
// deno-lint-ignore no-explicit-any
type MatchRecord = any;

// Get current time in Eastern timezone (America/New_York)
// This handles both EST (-5) and EDT (-4) automatically
function getCurrentEasternTime(): Date {
  // Get current UTC time
  const now = new Date();
  
  // Format in Eastern timezone to get the correct offset
  const easternFormatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  
  // Parse the formatted string back to components
  const parts = easternFormatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || '0';
  
  // Create a new Date using the Eastern time components as UTC
  // This gives us a Date object representing "now" in Eastern time
  const easternNow = new Date(Date.UTC(
    parseInt(getPart('year')),
    parseInt(getPart('month')) - 1,
    parseInt(getPart('day')),
    parseInt(getPart('hour')),
    parseInt(getPart('minute')),
    parseInt(getPart('second'))
  ));
  
  console.log(`🕐 Server UTC: ${now.toISOString()}, Eastern: ${easternNow.toISOString().replace('Z', ' ET')}`);
  
  return easternNow;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Create Supabase client inside handler to avoid module-level env var issues
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!supabaseUrl || !supabaseKey) {
      console.error('Missing environment variables:', { hasUrl: !!supabaseUrl, hasKey: !!supabaseKey });
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Validate request - accept CRON_SECRET or valid JWT
    const cronSecret = Deno.env.get('CRON_SECRET');
    const providedSecret = req.headers.get('x-cron-secret');
    const authHeader = req.headers.get('authorization');
    
    const isValidCron = cronSecret && providedSecret === cronSecret;
    const isValidAuth = authHeader && authHeader.startsWith('Bearer ');
    
    if (!isValidCron && !isValidAuth) {
      console.error('Unauthorized: No valid cron secret or authorization header');
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get optional tenant_id filter from query params (for manual testing)
    const url = new URL(req.url);
    const tenantIdFilter = url.searchParams.get('tenant_id');
    
    console.log('🔄 Starting match expiration check...');
    const startTime = Date.now();
    
    // Get current time - use server's UTC time for consistent comparison
    // All expires_at values are stored as UTC ISO strings
    const nowUtc = new Date().toISOString();
    console.log(`📅 Current UTC time: ${nowUtc}`);
    
    // Fetch all active/undecided matches with their load expiration info
    let query = supabase
      .from('load_hunt_matches')
      .select(`
        id, 
        match_status, 
        matched_at,
        tenant_id,
        load_emails!inner (
          id,
          expires_at,
          parsed_data
        )
      `)
      .in('match_status', ['active', 'undecided']);
    
    // Apply tenant filter if provided (for testing)
    if (tenantIdFilter) {
      query = query.eq('tenant_id', tenantIdFilter);
      console.log(`🔍 Filtering by tenant: ${tenantIdFilter}`);
    }
    
    const { data: matches, error: fetchError } = await query;

    if (fetchError) {
      console.error('Error fetching matches:', fetchError);
      return new Response(JSON.stringify({ error: 'Failed to fetch matches', details: fetchError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!matches || matches.length === 0) {
      console.log('✅ No active/undecided matches to check');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No matches to check',
        checked: 0,
        expired: 0,
        duration_ms: Date.now() - startTime
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📊 Found ${matches.length} active/undecided matches to check`);

    // Current time for comparison (use Date object for proper comparison)
    const currentTime = new Date();
    
    // Filter to only matches where the load has actually expired
    const expiredMatches = matches.filter((match: MatchRecord) => {
      const loadEmail = match.load_emails as any;
      if (!loadEmail) return false;
      
      // Priority 1: Use expires_at from load_emails table (already UTC ISO string)
      let expiresAt = loadEmail.expires_at;
      
      // Priority 2: Fall back to parsed_data.expires_at
      if (!expiresAt && loadEmail.parsed_data?.expires_at) {
        expiresAt = loadEmail.parsed_data.expires_at;
      }
      
      // Priority 3: If no expiration time, use 2 hours from matched_at as safety net
      // (Much more generous than the old 40 min - gives time for review)
      if (!expiresAt) {
        const matchedAt = new Date(match.matched_at);
        const twoHoursLater = new Date(matchedAt.getTime() + 2 * 60 * 60 * 1000);
        const isExpired = currentTime > twoHoursLater;
        if (isExpired) {
          console.log(`⏰ Match ${match.id.substring(0, 8)} expired (no expires_at, 2h fallback)`);
        }
        return isExpired;
      }
      
      // Compare current UTC time to load's expiration time
      const expirationTime = new Date(expiresAt);
      const isExpired = currentTime > expirationTime;
      
      if (isExpired) {
        console.log(`⏰ Match ${match.id.substring(0, 8)} expired: ${expiresAt} < ${currentTime.toISOString()}`);
      }
      
      return isExpired;
    });

    if (expiredMatches.length === 0) {
      console.log('✅ No expired matches found');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No expired matches',
        checked: matches.length,
        expired: 0,
        duration_ms: Date.now() - startTime
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const activeCount = expiredMatches.filter(m => m.match_status === 'active').length;
    const undecidedCount = expiredMatches.filter(m => m.match_status === 'undecided').length;
    console.log(`🕐 Found ${expiredMatches.length} expired matches (${activeCount} active, ${undecidedCount} undecided)`);

    // Update expired matches in batches
    const BATCH_SIZE = 100;
    let totalUpdated = 0;
    
    for (let i = 0; i < expiredMatches.length; i += BATCH_SIZE) {
      const batch = expiredMatches.slice(i, i + BATCH_SIZE);
      const batchIds = batch.map(m => m.id);
      
      const { error: updateError, count } = await supabase
        .from('load_hunt_matches')
        .update({ match_status: 'expired' })
        .in('id', batchIds);

      if (updateError) {
        console.error(`Error updating batch ${Math.floor(i / BATCH_SIZE) + 1}:`, updateError);
      } else {
        totalUpdated += batch.length;
        console.log(`✅ Batch ${Math.floor(i / BATCH_SIZE) + 1}: Updated ${batch.length} matches`);
      }
    }

    const duration = Date.now() - startTime;
    console.log(`✅ Completed: ${totalUpdated} matches marked as expired in ${duration}ms`);

    // Group by tenant for logging
    const tenantCounts: Record<string, number> = {};
    expiredMatches.forEach(m => {
      const tid = m.tenant_id || 'unknown';
      tenantCounts[tid] = (tenantCounts[tid] || 0) + 1;
    });
    console.log('📊 Expired by tenant:', JSON.stringify(tenantCounts));

    return new Response(JSON.stringify({ 
      success: true,
      message: `Expired ${totalUpdated} matches`,
      checked: matches.length,
      expired: totalUpdated,
      by_status: { active: activeCount, undecided: undecidedCount },
      by_tenant: tenantCounts,
      duration_ms: duration
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in expire-stale-matches:', error);
    return new Response(JSON.stringify({ 
      error: 'Internal server error', 
      details: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
