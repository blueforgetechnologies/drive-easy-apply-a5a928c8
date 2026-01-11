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

// Tenant info including rate limits
interface TenantInfo {
  tenantId: string | null;
  isPaused: boolean;
  rateLimitPerMinute: number;
  rateLimitPerDay: number;
  tenantName: string | null;
}

// Header extraction result
interface HeaderExtractionResult {
  alias: string | null;
  source: string | null;
  deliveredTo: string | null;
  xOriginalTo: string | null;
  envelopeTo: string | null;
  to: string | null;
}

// Extract gmail alias from email address (e.g., "talbilogistics+acme@gmail.com" -> "+acme")
function extractGmailAlias(email: string | null): string | null {
  if (!email) return null;
  
  // Match the pattern: anything+alias@domain
  const match = email.match(/([^@]+)\+([^@]+)@/);
  if (match && match[2]) {
    return `+${match[2]}`;
  }
  return null;
}

// Extract alias from headers with priority order:
// 1. Delivered-To (most reliable for Gmail)
// 2. X-Original-To (commonly used by mail servers)
// 3. Envelope-To (sometimes available)
// 4. To (fallback - least reliable for routing)
function extractAliasFromHeaders(headers: { name: string; value: string }[]): HeaderExtractionResult {
  const result: HeaderExtractionResult = {
    alias: null,
    source: null,
    deliveredTo: null,
    xOriginalTo: null,
    envelopeTo: null,
    to: null,
  };
  
  // Build header map (case-insensitive)
  const headerMap = new Map<string, string>();
  for (const h of headers) {
    headerMap.set(h.name.toLowerCase(), h.value);
  }
  
  // Extract header values
  result.deliveredTo = headerMap.get('delivered-to') || null;
  result.xOriginalTo = headerMap.get('x-original-to') || null;
  result.envelopeTo = headerMap.get('envelope-to') || null;
  result.to = headerMap.get('to') || null;
  
  // Priority order extraction
  const priorityOrder: Array<{ header: string | null; source: string }> = [
    { header: result.deliveredTo, source: 'Delivered-To' },
    { header: result.xOriginalTo, source: 'X-Original-To' },
    { header: result.envelopeTo, source: 'Envelope-To' },
    { header: result.to, source: 'To' },
  ];
  
  for (const { header, source } of priorityOrder) {
    const alias = extractGmailAlias(header);
    if (alias) {
      result.alias = alias;
      result.source = source;
      break;
    }
  }
  
  return result;
}

// Get tenant ID from gmail alias (fail-closed: no fallback to default)
async function getTenantId(gmailAlias: string | null): Promise<TenantInfo> {
  // Only route by gmail alias - fail-closed approach
  if (gmailAlias) {
    const { data: tenant, error } = await supabase
      .from('tenants')
      .select('id, is_paused, rate_limit_per_minute, rate_limit_per_day, name')
      .eq('gmail_alias', gmailAlias)
      .maybeSingle();
    
    if (tenant) {
      console.log(`[gmail-webhook] ✅ Routed to tenant "${tenant.name}" via alias ${gmailAlias}`);
      return { 
        tenantId: tenant.id, 
        isPaused: tenant.is_paused || false,
        rateLimitPerMinute: tenant.rate_limit_per_minute || 60,
        rateLimitPerDay: tenant.rate_limit_per_day || 10000,
        tenantName: tenant.name,
      };
    }
    console.warn(`[gmail-webhook] ⚠️ No tenant found for alias ${gmailAlias}`);
  }

  // FAIL-CLOSED: No fallback to default tenant
  // Return null tenantId to trigger quarantine
  return { 
    tenantId: null, 
    isPaused: false,
    rateLimitPerMinute: 60,
    rateLimitPerDay: 10000,
    tenantName: null,
  };
}

// Quarantine an unroutable email
async function quarantineEmail(
  messageId: string,
  historyId: string | null,
  headers: HeaderExtractionResult,
  fromEmail: string | null,
  subject: string | null,
  failureReason: string,
  rawHeaders: { name: string; value: string }[]
): Promise<void> {
  try {
    const { error } = await supabase
      .from('unroutable_emails')
      .upsert({
        gmail_message_id: messageId,
        gmail_history_id: historyId,
        received_at: new Date().toISOString(),
        delivered_to_header: headers.deliveredTo,
        x_original_to_header: headers.xOriginalTo,
        envelope_to_header: headers.envelopeTo,
        to_header: headers.to,
        from_header: fromEmail,
        subject: subject,
        extracted_alias: headers.alias,
        extraction_source: headers.source,
        failure_reason: failureReason,
        raw_headers: rawHeaders,
        status: 'quarantined',
      }, { 
        onConflict: 'gmail_message_id',
        ignoreDuplicates: true 
      });
    
    if (error) {
      console.error(`[gmail-webhook] Failed to quarantine email ${messageId}:`, error);
    } else {
      console.log(`[gmail-webhook] 🔒 Quarantined email ${messageId}: ${failureReason}`);
    }
  } catch (err) {
    console.error(`[gmail-webhook] Quarantine error:`, err);
  }
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
    return true;
  }
  
  return data === true;
}

// Generate deterministic dedupe key for tenant-scoped deduplication
function generateDedupeKey(gmailMessageId: string): string {
  return gmailMessageId;
}

// Store raw payload to object storage for audit compliance
async function storeRawPayload(
  tenantId: string, 
  gmailMessageId: string, 
  payload: any
): Promise<string | null> {
  try {
    const timestamp = new Date().toISOString().split('T')[0];
    const filePath = `${tenantId}/${timestamp}/${gmailMessageId}.json`;
    
    const { error } = await supabase.storage
      .from('email-payloads')
      .upload(filePath, JSON.stringify(payload), {
        contentType: 'application/json',
        upsert: true,
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
    
    const bodyText = await req.text();
    let body: any = {};
    let historyId: string | null = null;
    
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

    // Get access token
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
      return new Response(JSON.stringify({ queued: 0 }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📧 Processing ${messages.length} messages for tenant routing`);

    // Fetch full metadata for each message to get all routing headers
    const messageDetailsPromises = messages.map(async (m: any) => {
      try {
        // Request all relevant headers for routing
        const detailResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=metadata&metadataHeaders=Delivered-To&metadataHeaders=X-Original-To&metadataHeaders=Envelope-To&metadataHeaders=To&metadataHeaders=From&metadataHeaders=Subject`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        
        if (!detailResponse.ok) {
          console.warn(`Failed to fetch details for message ${m.id}`);
          return { message: m, headers: [], fromEmail: null, subject: null };
        }
        
        const detail = await detailResponse.json();
        const headers = detail.payload?.headers || [];
        
        // Extract From and Subject for logging
        const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from');
        const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject');
        
        return { 
          message: m, 
          headers,
          fromEmail: fromHeader?.value || null,
          subject: subjectHeader?.value || null,
        };
      } catch (err) {
        console.error(`Error fetching message ${m.id}:`, err);
        return { message: m, headers: [], fromEmail: null, subject: null };
      }
    });

    const messageDetails = await Promise.all(messageDetailsPromises);

    // Process messages with improved header extraction
    const tenantQueueMap = new Map<string, { tenantId: string; items: any[] }>();
    let skippedCount = 0;
    let quarantinedCount = 0;

    for (const { message, headers, fromEmail, subject } of messageDetails) {
      // Extract alias using priority-ordered header extraction
      const headerResult = extractAliasFromHeaders(headers);
      
      // Get tenant info for this message (fail-closed approach)
      const tenantInfo = await getTenantId(headerResult.alias);
      
      if (!tenantInfo.tenantId) {
        // QUARANTINE: No tenant found - fail-closed routing
        const failureReason = headerResult.alias 
          ? `No tenant configured for alias: ${headerResult.alias}`
          : 'No alias found in email headers';
        
        await quarantineEmail(
          message.id,
          historyId,
          headerResult,
          fromEmail,
          subject,
          failureReason,
          headers
        );
        quarantinedCount++;
        continue;
      }
      
      if (tenantInfo.isPaused) {
        console.log(`Tenant ${tenantInfo.tenantName} is paused, skipping message ${message.id}`);
        skippedCount++;
        continue;
      }
      
      // Check rate limit for this tenant
      const rateCheck = await checkRateLimit(tenantInfo.tenantId, tenantInfo.rateLimitPerMinute, tenantInfo.rateLimitPerDay);
      if (!rateCheck.allowed) {
        console.warn(`Rate limit exceeded for tenant ${tenantInfo.tenantName}, skipping message ${message.id}`);
        skippedCount++;
        continue;
      }
      
      // Check if Load Hunter is enabled for this tenant
      const loadHunterEnabled = await isFeatureEnabled(tenantInfo.tenantId, 'load_hunter_enabled');
      if (!loadHunterEnabled) {
        console.log(`Load Hunter disabled for tenant ${tenantInfo.tenantName}, skipping message ${message.id}`);
        skippedCount++;
        continue;
      }
      
      // Store raw payload
      const rawPayload = {
        messageId: message.id,
        threadId: message.threadId,
        historyId,
        receivedAt: new Date().toISOString(),
        tenantId: tenantInfo.tenantId,
        headerExtraction: headerResult,
        fromEmail,
        subject,
      };
      const payloadUrl = await storeRawPayload(tenantInfo.tenantId, message.id, rawPayload);
      
      // Add to tenant's queue
      if (!tenantQueueMap.has(tenantInfo.tenantId)) {
        tenantQueueMap.set(tenantInfo.tenantId, { tenantId: tenantInfo.tenantId, items: [] });
      }
      
      tenantQueueMap.get(tenantInfo.tenantId)!.items.push({
        gmail_message_id: message.id,
        gmail_history_id: historyId,
        status: 'pending',
        tenant_id: tenantInfo.tenantId,
        dedupe_key: generateDedupeKey(message.id),
        payload_url: payloadUrl,
        to_email: headerResult.deliveredTo || headerResult.to,
        routing_method: headerResult.source || 'unknown',
        extracted_alias: headerResult.alias,
        delivered_to_header: headerResult.deliveredTo,
      });
    }

    // Insert queue items for each tenant (tenant-scoped dedup)
    let totalQueued = 0;
    let totalDeduplicated = 0;
    const tenantResults: { tenantId: string; queued: number }[] = [];

    for (const [tenantId, { items }] of tenantQueueMap) {
      if (items.length === 0) continue;
      
      // Use tenant-scoped dedup: UNIQUE(tenant_id, dedupe_key)
      const { data: upsertResult, error: queueError } = await supabase
        .from('email_queue')
        .upsert(items, { 
          onConflict: 'tenant_id,dedupe_key', 
          ignoreDuplicates: true 
        })
        .select('id');

      if (queueError) {
        console.error(`Queue error for tenant ${tenantId}:`, queueError);
      }
      
      const queued = upsertResult?.length || 0;
      const deduped = items.length - queued;
      totalQueued += queued;
      totalDeduplicated += deduped;
      
      if (queued > 0) {
        tenantResults.push({ tenantId, queued });
        console.log(`📧 Queued ${queued} for tenant ${tenantId}`);
      }
    }
    
    if (totalDeduplicated > 0) {
      console.log(`🔄 Deduplicated ${totalDeduplicated} messages (already in queue for tenant)`);
    }

    // Mark messages as read in background
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
    console.log(`✅ Queued ${totalQueued} across ${tenantResults.length} tenants (${totalDeduplicated} deduped, ${skippedCount} skipped, ${quarantinedCount} quarantined) in ${elapsed}ms`);

    return new Response(JSON.stringify({ 
      queued: totalQueued, 
      deduplicated: totalDeduplicated,
      skipped: skippedCount,
      quarantined: quarantinedCount,
      tenants: tenantResults,
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
