import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Validate cron secret for security
    const cronSecret = req.headers.get('x-cron-secret');
    const expectedSecret = Deno.env.get('CRON_SECRET');
    
    if (!expectedSecret || cronSecret !== expectedSecret) {
      console.error('Unauthorized: Invalid or missing cron secret');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // ============================================================================
    // GUARD: Exit immediately if no pending/active sessions exist
    // This avoids expensive cleanup queries when there's no work to do
    // ============================================================================
    const { count, error: guardError } = await supabase
      .from('screen_share_sessions')
      .select('id', { count: 'exact', head: true })
      .in('status', ['pending', 'active']);

    if (guardError) {
      console.error('Guard query error:', guardError);
      // Fail-open: continue to cleanup logic if guard query fails
    } else if (count === 0) {
      console.log('[cleanup-screenshare] ⚡ GUARD: No active/pending sessions, exiting early');
      return new Response(
        JSON.stringify({ guarded: true, message: 'No sessions to check', cleaned: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } else {
      console.log(`[cleanup-screenshare] Found ${count} active/pending sessions, proceeding with cleanup check`);
    }

    // Find stale sessions with updated thresholds:
    // - pending: end if created_at < now() - 10 minutes
    // - active: end if last_heartbeat_at < now() - 90 seconds
    const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000).toISOString();
    const ninetySecondsAgo = new Date(Date.now() - 90 * 1000).toISOString();

    // Get stale pending sessions (older than 10 minutes)
    const { data: stalePending, error: pendingError } = await supabase
      .from('screen_share_sessions')
      .select('id, session_code, status, created_at, last_heartbeat_at')
      .eq('status', 'pending')
      .lt('created_at', tenMinutesAgo);

    if (pendingError) {
      console.error('Error fetching stale pending sessions:', pendingError);
      throw pendingError;
    }

    // Get stale active sessions (no heartbeat in 90 seconds)
    const { data: staleActive, error: activeError } = await supabase
      .from('screen_share_sessions')
      .select('id, session_code, status, created_at, last_heartbeat_at')
      .eq('status', 'active')
      .not('last_heartbeat_at', 'is', null)
      .lt('last_heartbeat_at', ninetySecondsAgo);

    if (activeError) {
      console.error('Error fetching stale active sessions:', activeError);
      throw activeError;
    }

    const staleSessions = [...(stalePending || []), ...(staleActive || [])];

    if (!staleSessions || staleSessions.length === 0) {
      console.log('No stale sessions to clean up');
      return new Response(
        JSON.stringify({ message: 'No stale sessions found', cleaned: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${staleSessions.length} stale sessions to clean up`);

    // End stale sessions
    const sessionIds = staleSessions.map(s => s.id);
    const { data: updatedSessions, error: updateError } = await supabase
      .from('screen_share_sessions')
      .update({
        status: 'ended',
        ended_at: new Date().toISOString(),
        // Clear signaling fields
        admin_offer: null,
        client_answer: null,
        admin_ice_candidates: [],
        client_ice_candidates: [],
      })
      .in('id', sessionIds)
      .select('id');

    if (updateError) {
      console.error('Error cleaning up sessions:', updateError);
      throw updateError;
    }

    const cleanedCount = updatedSessions?.length || 0;
    console.log(`Successfully cleaned up ${cleanedCount} stale sessions`);

    return new Response(
      JSON.stringify({ 
        message: `Cleaned up ${cleanedCount} stale sessions`,
        cleaned: cleanedCount,
        sessionIds: sessionIds
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in cleanup-screenshare-sessions:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
