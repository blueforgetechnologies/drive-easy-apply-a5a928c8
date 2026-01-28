import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

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

/**
 * ENQUEUE-ONLY MODE (Phase 5D)
 * 
 * This webhook does MINIMAL work:
 * 1. Validate Pub/Sub origin
 * 2. Decode Pub/Sub payload to get emailAddress + historyId
 * 3. Check pubsub_dedup - if duplicate, return 200 immediately
 * 4. Write STUB row to email_queue (gmail_message_id derived from historyId)
 * 5. Return 200 immediately
 * 
 * NO Gmail API calls
 * NO MIME parsing
 * NO storage writes
 * 
 * The VPS worker will claim these stubs and perform full Gmail API fetch + processing.
 */

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();

  try {
    // Security validation: Verify request originates from Google Pub/Sub
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

    // Parse Pub/Sub message for historyId and emailAddress
    let historyId: string | null = null;
    let pubsubEmailAddress: string | null = null;
    
    try {
      if (body.message?.data) {
        const decoded = JSON.parse(atob(body.message.data));
        historyId = decoded.historyId || null;
        pubsubEmailAddress = decoded.emailAddress || null;
        console.log('[gmail-webhook] Pub/Sub:', { historyId, emailAddress: pubsubEmailAddress });
      }
    } catch (e) {
      console.log('[gmail-webhook] Could not decode Pub/Sub data');
    }

    // FAIL-FAST: If we don't have historyId, we can't create a stub
    if (!historyId) {
      console.log('[gmail-webhook] No historyId in Pub/Sub payload, skipping');
      return new Response(
        JSON.stringify({ skipped: true, reason: 'no_history_id' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================================================
    // HARD DEDUP: Check if this (emailAddress, historyId) was already processed
    // This happens BEFORE any further work
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
          console.log(`[gmail-webhook] ⚡ DEDUP in ${elapsed}ms: (${pubsubEmailAddress}, ${historyId})`);
          return new Response(
            JSON.stringify({ duplicate: true, historyId, emailAddress: pubsubEmailAddress, elapsed }),
            { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        // Other errors - log but continue (fail-open for non-dedup errors)
        console.error('[gmail-webhook] Dedup check error:', dedupError);
      } else if (insertResult) {
        console.log(`[gmail-webhook] ✅ NEW Pub/Sub: (${pubsubEmailAddress}, ${historyId})`);
      }
    }

    // ============================================================================
    // ENQUEUE-ONLY: Write stub row to email_queue
    // 
    // IMPORTANT: We use a composite key as gmail_message_id since we don't have
    // the actual message ID without calling Gmail API.
    // Format: "stub:{emailAddress}:{historyId}"
    // 
    // The VPS worker will need to:
    // 1. Detect stub format
    // 2. Call Gmail history.list API to get actual message IDs
    // 3. Process those messages
    // ============================================================================
    
    // Generate a deterministic stub message ID
    // This allows the worker to identify these as stubs and handle appropriately
    const stubMessageId = `stub:${pubsubEmailAddress || 'unknown'}:${historyId}`;
    
    // Write stub to email_queue using INSERT with ON CONFLICT DO NOTHING
    // The unique constraint is on (tenant_id, dedupe_key), but for stubs we use
    // gmail_message_id as the natural key since tenant_id is unknown
    // We'll use a simple insert and check for existing by gmail_message_id first
    
    // Check if this stub already exists
    const { count: existingCount } = await supabase
      .from('email_queue')
      .select('id', { count: 'exact', head: true })
      .eq('gmail_message_id', stubMessageId);
    
    let queueResult: { id: string } | null = null;
    let queueError: any = null;
    
    if (existingCount && existingCount > 0) {
      // Already exists, skip insert
      console.log(`[gmail-webhook] Stub already exists: ${stubMessageId}`);
    } else {
      // Insert new stub
      const { data, error } = await supabase
        .from('email_queue')
        .insert({
          gmail_message_id: stubMessageId,
          gmail_history_id: historyId,
          status: 'pending',
          queued_at: new Date().toISOString(),
          // Leave these null - worker will populate after Gmail fetch
          tenant_id: null,
          payload_url: null,
          dedupe_key: stubMessageId,
          routing_method: 'stub',
          // Store email address for worker to use
          to_email: pubsubEmailAddress,
        })
        .select('id')
        .maybeSingle();
      
      queueResult = data;
      queueError = error;
    }

    const elapsed = Date.now() - startTime;

    if (queueError) {
      console.error(`[gmail-webhook] Queue error:`, queueError);
      return new Response(
        JSON.stringify({ error: 'Queue insert failed', elapsed }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const queued = queueResult ? 1 : 0;
    console.log(`[gmail-webhook] ✅ Stub queued in ${elapsed}ms: ${stubMessageId}`);

    return new Response(
      JSON.stringify({ 
        mode: 'enqueue-only',
        queued,
        stubMessageId,
        historyId,
        emailAddress: pubsubEmailAddress,
        elapsed,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.error('[gmail-webhook] Error:', error);
    return new Response(
      JSON.stringify({ error: String(error), elapsed }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
