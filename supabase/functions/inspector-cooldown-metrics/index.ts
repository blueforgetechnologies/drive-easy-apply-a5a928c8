import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Verify platform admin access via JWT
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid authorization token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if user is platform admin
    const { data: profile } = await supabase
      .from('user_profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single();

    if (!profile?.is_platform_admin) {
      return new Response(
        JSON.stringify({ error: 'Platform admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 1. Get overall stats for last 1 hour
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    
    // Count allowed actions in last hour (action_count increments = allowed)
    const { data: recentActions } = await supabase
      .from('hunt_fingerprint_actions')
      .select('id, action_count, last_action_at, created_at')
      .gte('last_action_at', oneHourAgo);

    // Calculate allowed count (sum of all action_counts for records touched in last hour)
    // vs suppressed (we don't have a direct count, but we can estimate from action_count patterns)
    let allowedCount = 0;
    let newFingerprints = 0;
    if (recentActions) {
      for (const action of recentActions) {
        if (new Date(action.created_at) >= new Date(oneHourAgo)) {
          newFingerprints++;
          allowedCount++; // First action for this fingerprint
          if (action.action_count > 1) {
            allowedCount += (action.action_count - 1); // Additional re-triggers
          }
        } else if (new Date(action.last_action_at) >= new Date(oneHourAgo)) {
          // Updated in last hour = at least one allowed action
          allowedCount++;
        }
      }
    }

    // 2. Get top 10 fingerprints by action_count (most re-triggered)
    const { data: topFingerprints } = await supabase
      .from('hunt_fingerprint_actions')
      .select('tenant_id, hunt_plan_id, load_content_fingerprint, action_count, last_received_at, last_action_at')
      .order('action_count', { ascending: false })
      .limit(10);

    // 3. Get recent 20 cooldown decisions (most recent actions)
    const { data: recentDecisions } = await supabase
      .from('hunt_fingerprint_actions')
      .select('tenant_id, hunt_plan_id, load_content_fingerprint, action_count, last_received_at, last_action_at, last_load_email_id')
      .order('last_action_at', { ascending: false })
      .limit(20);

    // 4. Get re-trigger evidence: fingerprints with action_count > 1
    const { data: retriggeredFingerprints } = await supabase
      .from('hunt_fingerprint_actions')
      .select('tenant_id, hunt_plan_id, load_content_fingerprint, action_count, last_received_at, last_action_at')
      .gt('action_count', 1)
      .order('last_action_at', { ascending: false })
      .limit(50);

    // 5. Cross-reference with load_hunt_matches to prove multiple matches exist
    const { data: multiMatchFingerprints } = await supabase.rpc('get_multi_match_fingerprints');

    // Format response
    const response = {
      summary: {
        allowed_last_hour: allowedCount,
        new_fingerprints_last_hour: newFingerprints,
        total_fingerprints: recentActions?.length || 0,
        retriggered_fingerprints: retriggeredFingerprints?.length || 0,
        cooldown_seconds: 60,
      },
      top_fingerprints_by_action_count: (topFingerprints || []).map(fp => ({
        tenant_id: fp.tenant_id,
        hunt_plan_id: fp.hunt_plan_id,
        fingerprint_prefix: fp.load_content_fingerprint?.substring(0, 12) + '...',
        action_count: fp.action_count,
        last_received_at: fp.last_received_at,
        last_action_at: fp.last_action_at,
      })),
      recent_cooldown_decisions: (recentDecisions || []).map(d => ({
        tenant_id: d.tenant_id,
        hunt_plan_id: d.hunt_plan_id,
        fingerprint_prefix: d.load_content_fingerprint?.substring(0, 12) + '...',
        action_count: d.action_count,
        last_received_at: d.last_received_at,
        last_action_at: d.last_action_at,
        decision: 'allowed', // If it's in the table, it was allowed
      })),
      retrigger_evidence: (retriggeredFingerprints || []).map(fp => ({
        tenant_id: fp.tenant_id,
        hunt_plan_id: fp.hunt_plan_id,
        fingerprint_prefix: fp.load_content_fingerprint?.substring(0, 12) + '...',
        action_count: fp.action_count,
        last_received_at: fp.last_received_at,
      })),
      multi_match_fingerprints: multiMatchFingerprints || [],
      generated_at: new Date().toISOString(),
    };

    return new Response(
      JSON.stringify(response, null, 2),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error in inspector-cooldown-metrics:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
