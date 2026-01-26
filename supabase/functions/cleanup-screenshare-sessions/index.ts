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

    // Find stale sessions:
    // - Created more than 30 minutes ago OR
    // - No heartbeat in last 60 seconds (if heartbeat was ever set)
    const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000).toISOString();
    const sixtySecondsAgo = new Date(Date.now() - 60 * 1000).toISOString();

    // Get sessions to clean up
    const { data: staleSessions, error: fetchError } = await supabase
      .from('screen_share_sessions')
      .select('id, session_code, status, created_at, last_heartbeat_at')
      .in('status', ['pending', 'active'])
      .or(`created_at.lt.${thirtyMinutesAgo},and(last_heartbeat_at.not.is.null,last_heartbeat_at.lt.${sixtySecondsAgo})`);

    if (fetchError) {
      console.error('Error fetching stale sessions:', fetchError);
      throw fetchError;
    }

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
