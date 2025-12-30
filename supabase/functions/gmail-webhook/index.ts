import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-tenant-api-key',
};

// Google Pub/Sub push requests use this User-Agent prefix
// See: https://cloud.google.com/pubsub/docs/push
const GOOGLE_PUBSUB_USER_AGENT_PREFIX = "CloudPubSub-Google";

// Initialize Supabase client once
const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Tenant info including rate limits
interface TenantInfo {
  tenantId: string | null;
  isPaused: boolean;
  rateLimitPerMinute: number;
  rateLimitPerDay: number;
}

// Get tenant ID from API key or use default tenant
async function getTenantId(apiKey: string | null): Promise<TenantInfo> {
  // If API key provided, look up the tenant
  if (apiKey) {
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, is_paused, rate_limit_per_minute, rate_limit_per_day')
      .eq('api_key', apiKey)
      .maybeSingle();
    
    if (tenant) {
      return { 
        tenantId: tenant.id, 
        isPaused: tenant.is_paused || false,
        rateLimitPerMinute: tenant.rate_limit_per_minute || 60,
        rateLimitPerDay: tenant.rate_limit_per_day || 10000,
      };
    }
    console.warn('[gmail-webhook] Invalid API key provided, falling back to default tenant');
  }
  
  // Fall back to default tenant for single-tenant mode
  const { data: defaultTenant } = await supabase
    .from('tenants')
    .select('id, is_paused, rate_limit_per_minute, rate_limit_per_day')
    .eq('slug', 'default')
    .maybeSingle();
  
  return { 
    tenantId: defaultTenant?.id || null, 
    isPaused: defaultTenant?.is_paused || false,
    rateLimitPerMinute: defaultTenant?.rate_limit_per_minute || 60,
    rateLimitPerDay: defaultTenant?.rate_limit_per_day || 10000,
  };
}

// Check tenant rate limit using atomic DB function
async function checkRateLimit(
  tenantId: string, 
  limitPerMinute: number, 
  limitPerDay: number
): Promise<{ allowed: boolean; reason: string | null; minuteCount: number; dayCount: number }> {
  const { data, error } = await supabase.rpc('check_tenant_rate_limit', {
    p_tenant_id: tenantId,
    p_limit_per_minute: limitPerMinute,
    p_limit_per_day: limitPerDay,
  });
  
  if (error) {
    console.error('[gmail-webhook] Rate limit check failed:', error);
    // Allow on error to avoid blocking legitimate traffic
    return { allowed: true, reason: null, minuteCount: 0, dayCount: 0 };
  }
  
  return {
    allowed: data.allowed,
    reason: data.reason,
    minuteCount: data.minute_count,
    dayCount: data.day_count,
  };
}

// Check if a feature is enabled for a tenant
async function isFeatureEnabled(tenantId: string, featureKey: string): Promise<boolean> {
  const { data, error } = await supabase.rpc('is_feature_enabled', {
    _tenant_id: tenantId,
    _feature_key: featureKey,
  });
  
  if (error) {
    console.error(`[gmail-webhook] Feature flag check failed for ${featureKey}:`, error);
    // Default to enabled on error to avoid blocking
    return true;
  }
  
  return data === true;
}

// Generate deterministic dedupe key for tenant-scoped deduplication
function generateDedupeKey(gmailMessageId: string): string {
  // For now, dedupe_key is the gmail_message_id
  // In future, could include additional factors like email hash
  return gmailMessageId;
}

// Store raw payload to object storage for audit compliance
async function storeRawPayload(
  tenantId: string, 
  gmailMessageId: string, 
  payload: any
): Promise<string | null> {
  try {
    const timestamp = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
    const filePath = `${tenantId}/${timestamp}/${gmailMessageId}.json`;
    
    const { error } = await supabase.storage
      .from('email-payloads')
      .upload(filePath, JSON.stringify(payload), {
        contentType: 'application/json',
        upsert: true, // Allow overwrite for retries
      });
    
    if (error) {
      console.error(`[gmail-webhook] Failed to store payload for ${gmailMessageId}:`, error);
      return null;
    }
    
    console.log(`📦 Stored raw payload: ${filePath}`);
    return filePath;
  } catch (err) {
    console.error(`[gmail-webhook] Storage error:`, err);
    return null;
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    // Security validation: Verify request originates from Google Pub/Sub
    const userAgent = req.headers.get('user-agent') || '';
    const isFromPubSub = userAgent.startsWith(GOOGLE_PUBSUB_USER_AGENT_PREFIX);
    
    // Clone request to read body for validation while preserving it for later use
    const bodyText = await req.text();
    let body: any = {};
    let historyId: string | null = null;
    
    try {
      body = JSON.parse(bodyText);
    } catch (e) {
      // Body might be empty for some requests
    }
    
    // Check for Pub/Sub message structure
    const hasPubSubStructure = body && typeof body === 'object' && 
      (body.message !== undefined || body.subscription !== undefined);
    
    // Reject requests that don't appear to be from Pub/Sub
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

    // Get tenant from API key header or use default
    const tenantApiKey = req.headers.get('x-tenant-api-key');
    const { tenantId, isPaused, rateLimitPerMinute, rateLimitPerDay } = await getTenantId(tenantApiKey);
    
    if (!tenantId) {
      console.error('[gmail-webhook] No tenant found');
      return new Response(JSON.stringify({ error: 'No tenant configured' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Check if tenant is paused (kill switch)
    if (isPaused) {
      console.log(`[gmail-webhook] Tenant ${tenantId} is paused, skipping ingestion`);
      return new Response(JSON.stringify({ queued: 0, paused: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Check rate limit before processing
    const rateCheck = await checkRateLimit(tenantId, rateLimitPerMinute, rateLimitPerDay);
    if (!rateCheck.allowed) {
      console.warn(`[gmail-webhook] Rate limit exceeded for tenant ${tenantId}: ${rateCheck.reason}`);
      return new Response(JSON.stringify({ 
        error: 'Rate limit exceeded',
        reason: rateCheck.reason,
        minuteCount: rateCheck.minuteCount,
        dayCount: rateCheck.dayCount,
      }), {
        status: 429,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Check if Load Hunter is enabled for this tenant
    const loadHunterEnabled = await isFeatureEnabled(tenantId, 'load_hunter_enabled');
    if (!loadHunterEnabled) {
      console.log(`[gmail-webhook] Load Hunter disabled for tenant ${tenantId}`);
      return new Response(JSON.stringify({ queued: 0, featureDisabled: true }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    console.log(`[gmail-webhook] Processing for tenant: ${tenantId} (${rateCheck.minuteCount}/min, ${rateCheck.dayCount}/day)`);

    // Track Pub/Sub usage
    supabase
      .from('pubsub_tracking')
      .insert({
        message_type: 'gmail_notification',
        message_size_bytes: bodyText.length,
      })
      .then(() => console.log('📊 Pub/Sub usage tracked'));

    // Parse Pub/Sub message for historyId
    try {
      if (body.message?.data) {
        const decoded = JSON.parse(atob(body.message.data));
        historyId = decoded.historyId;
        console.log('Pub/Sub historyId:', historyId);
      }
    } catch (e) {
      console.log('Could not decode Pub/Sub data');
    }

    // Get access token - quick single lookup
    const { data: tokenData, error: tokenError } = await supabase
      .from('gmail_tokens')
      .select('access_token, refresh_token, token_expiry, user_email')
      .limit(1)
      .single();

    if (tokenError || !tokenData) {
      console.error('No token found');
      return new Response(JSON.stringify({ error: 'No token' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check if token needs refresh
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.token_expiry) <= new Date()) {
      const clientId = Deno.env.get('GMAIL_CLIENT_ID');
      const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');
      
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId!,
          client_secret: clientSecret!,
          refresh_token: tokenData.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      if (refreshResponse.ok) {
        const tokens = await refreshResponse.json();
        accessToken = tokens.access_token;
        
        // Update token - don't wait
        supabase
          .from('gmail_tokens')
          .update({
            access_token: tokens.access_token,
            token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          })
          .eq('user_email', tokenData.user_email)
          .then(() => console.log('Token refreshed'));
      }
    }

    // Fetch unread messages from BOTH Sylectus and Full Circle TMS
    // Use OR query to get emails from either source
    const sylectusResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=is:unread from:sylectus.com`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    const fullCircleResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=is:unread (from:fullcircletms.com OR from:fctms.com)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!sylectusResponse.ok && !fullCircleResponse.ok) {
      console.error('Gmail API error:', sylectusResponse.status, fullCircleResponse.status);
      return new Response(JSON.stringify({ error: 'Gmail API error' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Combine messages from both sources
    const sylectusData = sylectusResponse.ok ? await sylectusResponse.json() : { messages: [] };
    const fullCircleData = fullCircleResponse.ok ? await fullCircleResponse.json() : { messages: [] };
    
    // Merge and dedupe by message id
    const allMessageIds = new Set<string>();
    const allMessages: any[] = [];
    
    for (const msg of [...(sylectusData.messages || []), ...(fullCircleData.messages || [])]) {
      if (!allMessageIds.has(msg.id)) {
        allMessageIds.add(msg.id);
        allMessages.push(msg);
      }
    }

    const messages = allMessages;

    if (messages.length === 0) {
      console.log('No new messages');
      return new Response(JSON.stringify({ queued: 0, tenantId }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📧 Queuing ${messages.length} messages for tenant ${tenantId}`);

    // Store raw payloads in background and build queue items
    const payloadPromises = messages.map(async (m: any) => {
      // Store raw message reference (minimal data - full content fetched later)
      const rawPayload = {
        messageId: m.id,
        threadId: m.threadId,
        historyId,
        receivedAt: new Date().toISOString(),
        tenantId,
      };
      const payloadUrl = await storeRawPayload(tenantId!, m.id, rawPayload);
      return { message: m, payloadUrl };
    });
    
    const payloadResults = await Promise.all(payloadPromises);
    
    // Queue messages with tenant_id, dedupe_key, and payload_url
    const queueItems = payloadResults.map(({ message, payloadUrl }) => ({
      gmail_message_id: message.id,
      gmail_history_id: historyId,
      status: 'pending',
      tenant_id: tenantId,
      dedupe_key: generateDedupeKey(message.id),
      payload_url: payloadUrl,
    }));

    // Use upsert with tenant-scoped dedupe key to prevent duplicates
    const { data: upsertResult, error: queueError } = await supabase
      .from('email_queue')
      .upsert(queueItems, { 
        onConflict: 'gmail_message_id', 
        ignoreDuplicates: true 
      })
      .select('id');

    if (queueError) {
      console.error('Queue error:', queueError);
    }
    
    const actualQueued = upsertResult?.length || 0;
    const deduplicated = messages.length - actualQueued;
    
    if (deduplicated > 0) {
      console.log(`🔄 Deduplicated ${deduplicated} messages (already in queue)`);
    }

    // Mark messages as read in background - don't block response
    Promise.all(messages.map((msg: any) =>
      fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
      }).catch(() => {})
    ));

    const elapsed = Date.now() - startTime;
    console.log(`✅ Queued ${actualQueued} (${deduplicated} deduped) in ${elapsed}ms for tenant ${tenantId}`);

    return new Response(JSON.stringify({ 
      queued: actualQueued, 
      deduplicated, 
      tenantId, 
      elapsed 
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});