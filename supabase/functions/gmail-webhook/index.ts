import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

/**
 * Gmail Webhook - ENQUEUE-ONLY MODE (Phase 5B)
 * 
 * This function receives Pub/Sub notifications from Gmail and:
 * 1. Validates the request is from Google Pub/Sub
 * 2. Checks for duplicate notifications (pubsub_dedup)
 * 3. Writes a STUB row to email_queue with minimal data
 * 4. Returns immediately (<100ms target)
 * 
 * ALL heavy work (Gmail API, MIME parsing, content storage) is done by VPS worker.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-api-key',
};

// Google Pub/Sub push requests use this User-Agent prefix
const GOOGLE_PUBSUB_USER_AGENT_PREFIX = "CloudPubSub-Google";

// Initialize Supabase client once
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    // ============================================================================
    // STEP 1: Validate request is from Google Pub/Sub
    // ============================================================================
    const userAgent = req.headers.get('user-agent') || '';
    const isFromPubSub = userAgent.startsWith(GOOGLE_PUBSUB_USER_AGENT_PREFIX);
    
    const bodyText = await req.text();
    let body: any = {};
    
    try {
      body = JSON.parse(bodyText);
    } catch (e) {
      // Body might be empty for some requests
    }
    
    const hasPubSubStructure = body && typeof body === 'object' && 
      (body.message !== undefined || body.subscription !== undefined);
    
    if (!isFromPubSub && !hasPubSubStructure) {
      console.warn('[gmail-webhook] Request rejected: Invalid origin. User-Agent:', userAgent);
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Invalid request origin' }),
        { 
          status: 403, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      );
    }

    console.log('[gmail-webhook] Request validated as Pub/Sub notification');

    // ============================================================================
    // STEP 2: Parse Pub/Sub message for historyId and emailAddress
    // ============================================================================
    let historyId: string | null = null;
    let pubsubEmailAddress: string | null = null;
    
    try {
      if (body.message?.data) {
        const decoded = JSON.parse(atob(body.message.data));
        historyId = decoded.historyId;
        pubsubEmailAddress = decoded.emailAddress || null;
        console.log(`[gmail-webhook] Pub/Sub: historyId=${historyId}, email=${pubsubEmailAddress}`);
      }
    } catch (e) {
      console.log('[gmail-webhook] Could not decode Pub/Sub data');
    }

    // ============================================================================
    // STEP 3: HARD DEDUP - Check if (emailAddress, historyId) already processed
    // ============================================================================
    if (pubsubEmailAddress && historyId) {
      const { data: insertResult, error: dedupError } = await supabase
        .from('pubsub_dedup')
        .insert({
          email_address: pubsubEmailAddress,
          history_id: historyId,
        })
        .select('id')
        .maybeSingle();

      if (dedupError) {
        // Check if it's a unique constraint violation (duplicate)
        if (dedupError.code === '23505' || dedupError.message?.includes('duplicate') || dedupError.message?.includes('unique')) {
          const elapsed = Date.now() - startTime;
          console.log(`[gmail-webhook] ⚡ DEDUP: Skipping duplicate (${pubsubEmailAddress}, ${historyId}) in ${elapsed}ms`);
          return new Response(
            JSON.stringify({ duplicate: true, historyId, emailAddress: pubsubEmailAddress, elapsed_ms: elapsed }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // Other errors - log but continue (fail-open for non-dedup errors)
        console.error('[gmail-webhook] Dedup check error:', dedupError);
      } else if (insertResult) {
        console.log(`[gmail-webhook] ✅ NEW notification (${pubsubEmailAddress}, ${historyId})`);
      }
    } else {
      // Missing required data - cannot process
      console.warn('[gmail-webhook] Missing historyId or emailAddress, cannot enqueue');
      return new Response(
        JSON.stringify({ error: 'Missing historyId or emailAddress' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================================================
    // STEP 4: Write STUB to email_queue for VPS worker processing
    // The worker will do all heavy lifting: Gmail API, routing, parsing
    // ============================================================================
    const stubRow = {
      gmail_message_id: `stub_${historyId}_${Date.now()}`, // Temporary ID until worker fetches real messages
      gmail_history_id: historyId,
      status: 'pending',
      tenant_id: null, // Worker will determine tenant from Gmail token
      from_email: pubsubEmailAddress, // Store the inbox email for worker lookup
      payload_url: null, // NULL = stub that needs Gmail API fetch
      subject: null, // NULL = not yet processed
      queued_at: new Date().toISOString(),
    };

    const { error: queueError } = await supabase
      .from('email_queue')
      .insert(stubRow);

    if (queueError) {
      console.error('[gmail-webhook] Queue insert error:', queueError);
      // Don't fail the webhook - Pub/Sub will retry
      return new Response(
        JSON.stringify({ error: 'Queue insert failed', details: queueError.message }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const elapsed = Date.now() - startTime;
    console.log(`[gmail-webhook] ✅ Stub enqueued for history ${historyId} in ${elapsed}ms`);

    return new Response(JSON.stringify({ 
      enqueued: true,
      historyId,
      emailAddress: pubsubEmailAddress,
      elapsed_ms: elapsed,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error('[gmail-webhook] Error:', error);
    return new Response(JSON.stringify({ error: String(error), elapsed_ms: elapsed }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
