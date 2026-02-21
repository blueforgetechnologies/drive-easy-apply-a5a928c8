import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL');
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');

    if (!supabaseUrl || !supabaseKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Validate auth: cron secret or JWT
    const cronSecret = Deno.env.get('CRON_SECRET');
    const providedSecret = req.headers.get('x-cron-secret');
    const authHeader = req.headers.get('authorization');
    const isValidCron = cronSecret && providedSecret === cronSecret;
    const isValidAuth = authHeader && authHeader.startsWith('Bearer ');

    if (!isValidCron && !isValidAuth) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check if matching is enabled in worker_config
    const { data: config } = await supabase
      .from('worker_config')
      .select('matching_enabled')
      .eq('id', 'default')
      .maybeSingle();

    if (!config?.matching_enabled) {
      console.log('⏸️ Matching is disabled (matching_enabled=false). Skipping.');
      return new Response(JSON.stringify({
        skipped: true,
        reason: 'matching_enabled is false in worker_config',
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // TODO: When ready, this will POST to the VPS matcher URL
    // const VPS_MATCHER_URL = Deno.env.get('VPS_MATCHER_URL');
    // const result = await fetch(VPS_MATCHER_URL, { method: 'POST', ... });

    console.log('🔄 Matching enabled but no VPS URL configured yet. Placeholder.');
    return new Response(JSON.stringify({
      ok: true,
      message: 'Matching is enabled. VPS matcher URL not yet configured.',
      placeholder: true,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error in trigger-matching-run:', error);
    return new Response(JSON.stringify({
      error: 'Internal server error',
      details: error instanceof Error ? error.message : String(error),
    }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
