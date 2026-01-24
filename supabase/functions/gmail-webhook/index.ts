import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { crypto } from "https://deno.land/std@0.168.0/crypto/mod.ts";

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
  xGmOriginalTo: string | null;
  xForwardedTo: string | null;
  envelopeTo: string | null;
  to: string | null;
  cc: string | null;
}

// Content dedup result
interface ContentDedupResult {
  contentId: string;
  receiptId: string;
  isNewContent: boolean;
  contentHash: string;
}

// Raw MIME fetch result
interface RawMimeResult {
  rawBytes: Uint8Array;
  contentHash: string;
  sizeBytes: number;
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

// Extract alias from headers with priority order (expanded for robust routing):
// 1. Delivered-To (most reliable for Gmail plus-addressing)
// 2. X-Original-To (commonly used by mail servers)
// 3. X-Gm-Original-To (Gmail specific - sometimes present)
// 4. X-Forwarded-To (used when forwarding)
// 5. Envelope-To (sometimes available)
// 6. To (standard recipient - may have multiple)
// 7. Cc (fallback - rarely has the alias but worth checking)
function extractAliasFromHeaders(headers: { name: string; value: string }[]): HeaderExtractionResult {
  const result: HeaderExtractionResult = {
    alias: null,
    source: null,
    deliveredTo: null,
    xOriginalTo: null,
    xGmOriginalTo: null,
    xForwardedTo: null,
    envelopeTo: null,
    to: null,
    cc: null,
  };
  
  // Build header map (case-insensitive)
  const headerMap = new Map<string, string>();
  for (const h of headers) {
    headerMap.set(h.name.toLowerCase(), h.value);
  }
  
  // Extract all header values for debugging and routing
  result.deliveredTo = headerMap.get('delivered-to') || null;
  result.xOriginalTo = headerMap.get('x-original-to') || null;
  result.xGmOriginalTo = headerMap.get('x-gm-original-to') || null;
  result.xForwardedTo = headerMap.get('x-forwarded-to') || null;
  result.envelopeTo = headerMap.get('envelope-to') || null;
  result.to = headerMap.get('to') || null;
  result.cc = headerMap.get('cc') || null;
  
  // Priority order extraction - check ALL routing headers
  const priorityOrder: Array<{ header: string | null; source: string }> = [
    { header: result.deliveredTo, source: 'Delivered-To' },
    { header: result.xOriginalTo, source: 'X-Original-To' },
    { header: result.xGmOriginalTo, source: 'X-Gm-Original-To' },
    { header: result.xForwardedTo, source: 'X-Forwarded-To' },
    { header: result.envelopeTo, source: 'Envelope-To' },
    { header: result.to, source: 'To' },
    { header: result.cc, source: 'Cc' },
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

// Extract first email address from header value that may contain "Name <email>" or multiple recipients
function extractFirstEmail(headerValue: string): string | null {
  if (!headerValue) return null;
  
  // Pattern 1: "Name <email@domain.com>" or just "<email@domain.com>"
  const angleMatch = headerValue.match(/<([^>]+@[^>]+)>/);
  if (angleMatch) {
    return angleMatch[1].toLowerCase().trim();
  }
  
  // Pattern 2: Plain email address (may have multiple comma-separated)
  const plainMatch = headerValue.split(',')[0].trim();
  if (plainMatch.includes('@')) {
    return plainMatch.toLowerCase().trim();
  }
  
  return null;
}

// NOTE: getTenantByInboundAddress has been REMOVED as part of alias-only routing.
// Base email addresses are no longer routed to tenants.
// Only +alias routing is supported for strict tenant isolation.

// Get tenant ID from gmail alias (ALIAS-ONLY ROUTING)
// Routing: +alias match ONLY - no fallback to base email addresses
// This ensures strict tenant isolation for multi-tenant deployments
async function getTenantId(gmailAlias: string | null, headerResult?: HeaderExtractionResult): Promise<TenantInfo> {
  // ALIAS-ONLY: Only route if we have a valid +alias
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

  // NO FALLBACK: Base emails (without +alias) are NOT routed
  // This prevents cross-tenant leakage in multi-tenant deployments
  // Emails without a valid +alias will be quarantined
  if (headerResult) {
    const baseEmail = extractFirstEmail(headerResult.deliveredTo || headerResult.to || '');
    if (baseEmail) {
      console.log(`[gmail-webhook] 🚫 ALIAS-ONLY: Rejecting base email ${baseEmail} - no +alias found`);
    }
  }

  // FAIL-CLOSED - Return null to trigger quarantine
  return { 
    tenantId: null, 
    isPaused: false,
    rateLimitPerMinute: 60,
    rateLimitPerDay: 10000,
    tenantName: null,
  };
}

// Quarantine an unroutable email with full header visibility
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
        // Store ALL routing headers for debugging
        delivered_to_header: headers.deliveredTo,
        x_original_to_header: headers.xOriginalTo,
        x_gm_original_to_header: headers.xGmOriginalTo,
        x_forwarded_to_header: headers.xForwardedTo,
        envelope_to_header: headers.envelopeTo,
        to_header: headers.to,
        cc_header: headers.cc,
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
      // Enhanced logging for debugging header extraction issues
      const headerSummary = {
        deliveredTo: headers.deliveredTo?.substring(0, 50) || 'NULL',
        xOriginalTo: headers.xOriginalTo?.substring(0, 50) || 'NULL',
        xGmOriginalTo: headers.xGmOriginalTo?.substring(0, 50) || 'NULL',
        xForwardedTo: headers.xForwardedTo?.substring(0, 50) || 'NULL',
        to: headers.to?.substring(0, 50) || 'NULL',
        rawHeaderCount: rawHeaders.length,
      };
      console.log(`[gmail-webhook] 🔒 Quarantined ${messageId}: ${failureReason}`, headerSummary);
    }
  } catch (err) {
    console.error(`[gmail-webhook] Quarantine error:`, err);
  }
}

// Check tenant rate limit using atomic DB function (dry_run=true means check without incrementing)
async function checkRateLimit(
  tenantId: string, 
  limitPerMinute: number, 
  limitPerDay: number,
  dryRun: boolean = false
): Promise<{ allowed: boolean; reason: string | null; minuteCount: number; dayCount: number }> {
  const { data, error } = await supabase.rpc('check_tenant_rate_limit', {
    p_tenant_id: tenantId,
    p_limit_per_minute: limitPerMinute,
    p_limit_per_day: limitPerDay,
    p_dry_run: dryRun,
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

// Increment tenant rate counter by a specific count (after dedup)
async function incrementRateCount(tenantId: string, count: number): Promise<void> {
  if (count <= 0) return;
  
  const { error } = await supabase.rpc('increment_tenant_rate_count', {
    p_tenant_id: tenantId,
    p_count: count,
  });
  
  if (error) {
    console.error('[gmail-webhook] Rate count increment failed:', error);
  }
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

// ============================================================================
// CONTENT DEDUPLICATION FUNCTIONS (Step 2) - RAW MIME HASHING
// ============================================================================

// Fetch raw MIME bytes from Gmail API and compute SHA256 hash
// This ensures 100% identical emails produce the same hash - no false positives
async function fetchRawMimeAndHash(
  accessToken: string,
  messageId: string
): Promise<RawMimeResult | null> {
  try {
    // Fetch raw MIME (base64url encoded)
    const response = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=raw`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    if (!response.ok) {
      console.error(`[raw-mime] Failed to fetch raw for ${messageId}: ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    
    if (!data.raw) {
      console.error(`[raw-mime] No raw field in response for ${messageId}`);
      return null;
    }
    
    // Decode base64url to bytes
    // Gmail uses URL-safe base64: replace - with + and _ with /
    const base64 = data.raw.replace(/-/g, '+').replace(/_/g, '/');
    const binaryString = atob(base64);
    const rawBytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      rawBytes[i] = binaryString.charCodeAt(i);
    }
    
    // Compute SHA256 of raw MIME bytes
    const hashBuffer = await crypto.subtle.digest('SHA-256', rawBytes);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const contentHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    
    console.log(`[raw-mime] ✅ Fetched ${rawBytes.length} bytes, hash: ${contentHash.substring(0, 12)}...`);
    
    return {
      rawBytes,
      contentHash,
      sizeBytes: rawBytes.length,
    };
  } catch (err) {
    console.error(`[raw-mime] Error fetching raw MIME:`, err);
    return null;
  }
}

// Detect provider from email sender
function detectProvider(fromEmail: string | null): string {
  if (!fromEmail) return 'unknown';
  const lower = fromEmail.toLowerCase();
  if (lower.includes('sylectus')) return 'sylectus';
  if (lower.includes('fullcircle') || lower.includes('fctms')) return 'fullcircle';
  return 'unknown';
}

// Store raw MIME bytes to global content-addressed bucket
// Uses SHA256 hash as path - if file exists, content is guaranteed identical
async function storeRawMimeContent(
  provider: string,
  contentHash: string,
  rawBytes: Uint8Array
): Promise<string | null> {
  const hashPrefix = contentHash.substring(0, 4);
  const filePath = `${provider}/${hashPrefix}/${contentHash}.eml`;
  const contentType = 'application/octet-stream'; // message/rfc822 not supported by Supabase Storage
  
  try {
    const { error } = await supabase.storage
      .from('email-content')
      .upload(filePath, rawBytes, {
        contentType,
        upsert: false, // Don't overwrite - content is immutable by definition
      });
    
    if (error) {
      // If already exists, that's expected for content-addressed storage
      if (error.message?.includes('already exists') || error.message?.includes('Duplicate')) {
        console.log(`[storage] ✅ Already exists: ${filePath} (hash: ${hashPrefix}..., type: ${contentType})`);
        return filePath;
      }
      // Real error - log but don't break ingestion
      console.error(`[storage] ❌ Upload failed: ${filePath} (hash: ${hashPrefix}..., type: ${contentType}) - ${error.message?.substring(0, 100)}`);
      return null;
    }
    
    console.log(`[storage] ✅ NEW upload: ${filePath} (${rawBytes.length} bytes, hash: ${hashPrefix}..., type: ${contentType})`);
    return filePath;
  } catch (err) {
    const errMsg = err instanceof Error ? err.message.substring(0, 100) : 'Unknown error';
    console.error(`[storage] ❌ Exception: ${filePath} (hash: ${hashPrefix}...) - ${errMsg}`);
    return null;
  }
}

// Upsert email_content and create receipt (atomic content dedup)
async function processContentDedup(
  tenantId: string,
  provider: string,
  contentHash: string,
  payloadUrl: string | null,
  gmailMessageId: string,
  historyId: string | null,
  headerResult: HeaderExtractionResult,
  sizeBytes?: number
): Promise<ContentDedupResult | null> {

  try {
    // 1. Upsert email_content: insert if new, update last_seen_at + increment receipt_count if exists
    const { data: existingContent, error: lookupError } = await supabase
      .from('email_content')
      .select('id, receipt_count')
      .eq('provider', provider)
      .eq('content_hash', contentHash)
      .maybeSingle();
    
    if (lookupError) {
      console.error(`[gmail-webhook] Content lookup error:`, lookupError);
      return null;
    }
    
    let contentId: string;
    let isNewContent = false;
    
    if (existingContent) {
      // Content exists - update last_seen_at and increment receipt_count
      const { error: updateError } = await supabase
        .from('email_content')
        .update({
          last_seen_at: new Date().toISOString(),
          receipt_count: existingContent.receipt_count + 1,
        })
        .eq('id', existingContent.id);
      
      if (updateError) {
        console.error(`[gmail-webhook] Content update error:`, updateError);
        return null;
      }
      
      contentId = existingContent.id;
      console.log(`♻️ Reusing content ${contentHash.substring(0, 8)}... (count: ${existingContent.receipt_count + 1})`);
    } else {
      // New content - insert
      const { data: newContent, error: insertError } = await supabase
        .from('email_content')
        .insert({
          provider,
          content_hash: contentHash,
          payload_url: payloadUrl,
          receipt_count: 1,
        })
        .select('id')
        .single();
      
      if (insertError) {
        // Handle race condition - another request may have inserted
        if (insertError.message?.includes('duplicate') || insertError.message?.includes('unique')) {
          // Retry lookup
          const { data: retryContent } = await supabase
            .from('email_content')
            .select('id, receipt_count')
            .eq('provider', provider)
            .eq('content_hash', contentHash)
            .single();
          
          if (retryContent) {
            contentId = retryContent.id;
            // Increment count for this receipt
            await supabase
              .from('email_content')
              .update({
                last_seen_at: new Date().toISOString(),
                receipt_count: retryContent.receipt_count + 1,
              })
              .eq('id', retryContent.id);
          } else {
            console.error(`[gmail-webhook] Content race condition unresolved`);
            return null;
          }
        } else {
          console.error(`[gmail-webhook] Content insert error:`, insertError);
          return null;
        }
      } else {
        contentId = newContent.id;
        isNewContent = true;
        console.log(`🆕 New content stored: ${contentHash.substring(0, 8)}...`);
      }
    }
    
    // 2. Insert email_receipt for this tenant
    const { data: receipt, error: receiptError } = await supabase
      .from('email_receipts')
      .upsert({
        tenant_id: tenantId,
        content_id: contentId,
        provider,
        gmail_message_id: gmailMessageId,
        gmail_history_id: historyId,
        routing_method: headerResult.source || 'unknown',
        extracted_alias: headerResult.alias,
        delivered_to_header: headerResult.deliveredTo,
        status: 'pending',
        received_at: new Date().toISOString(),
      }, {
        onConflict: 'tenant_id,gmail_message_id',
        ignoreDuplicates: false, // Update if exists
      })
      .select('id')
      .single();
    
    if (receiptError) {
      console.error(`[gmail-webhook] Receipt insert error:`, receiptError);
      return null;
    }
    
    return {
      contentId,
      receiptId: receipt.id,
      isNewContent,
      contentHash,
    };
  } catch (err) {
    console.error(`[gmail-webhook] Content dedup error:`, err);
    return null;
  }
}

// Store raw payload to object storage for audit compliance (legacy path)
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
  
  // Metrics for content dedup
  let contentDedupStats = {
    enabled: false,
    newContent: 0,
    reusedContent: 0,
    receiptsCreated: 0,
    errors: 0,
  };
  
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

    // NOTE: Removed per-message pubsub_tracking writes to reduce DB costs
    // Pub/Sub usage can be estimated from load_emails count (1 email ≈ 4 notifications)
    // This saves ~300K writes/week at current volume

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
      console.log(`[gmail-webhook] Token expired for ${tokenData.user_email}, attempting refresh...`);
      
      const clientId = Deno.env.get('GMAIL_CLIENT_ID');
      const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');
      
      if (!tokenData.refresh_token) {
        console.error(`[gmail-webhook] No refresh_token for ${tokenData.user_email} - marking for re-auth`);
        // Mark token as needing re-auth
        await supabase
          .from('gmail_tokens')
          .update({ needs_reauth: true, reauth_reason: 'missing_refresh_token' })
          .eq('user_email', tokenData.user_email);
        return new Response(JSON.stringify({ 
          error: 'Token expired and no refresh token available',
          needs_reauth: true 
        }), {
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      
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

      const refreshData = await refreshResponse.json();

      if (refreshResponse.ok && refreshData.access_token) {
        accessToken = refreshData.access_token;
        const newExpiry = new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString();
        
        // CRITICAL: Await the update to ensure persistence before proceeding
        const { error: updateError } = await supabase
          .from('gmail_tokens')
          .update({
            access_token: refreshData.access_token,
            token_expiry: newExpiry,
            needs_reauth: false,
            reauth_reason: null,
            updated_at: new Date().toISOString(),
          })
          .eq('user_email', tokenData.user_email);
        
        if (updateError) {
          console.error(`[gmail-webhook] Failed to persist refreshed token:`, updateError);
          // Continue with the refreshed token even if persist failed - better than stopping
        } else {
          console.log(`[gmail-webhook] ✅ Token refreshed for ${tokenData.user_email}, new expiry: ${newExpiry}`);
        }
      } else {
        // Handle refresh failure
        const errorCode = refreshData.error || 'unknown_error';
        const errorDesc = refreshData.error_description || 'Token refresh failed';
        
        console.error(`[gmail-webhook] Token refresh failed for ${tokenData.user_email}:`, {
          error: errorCode,
          description: errorDesc,
        });
        
        // Mark token as needing re-auth for UI visibility
        await supabase
          .from('gmail_tokens')
          .update({ 
            needs_reauth: true, 
            reauth_reason: errorCode === 'invalid_grant' ? 'refresh_token_revoked' : errorCode 
          })
          .eq('user_email', tokenData.user_email);
        
        // For invalid_grant (revoked/expired refresh token), we must stop - no way to recover without user re-auth
        if (errorCode === 'invalid_grant') {
          console.error(`[gmail-webhook] 🚨 Refresh token revoked/expired for ${tokenData.user_email} - user must re-authenticate`);
          return new Response(JSON.stringify({ 
            error: 'Refresh token revoked or expired - user must reconnect Gmail',
            needs_reauth: true,
            error_code: errorCode 
          }), {
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        
        // For other transient errors, continue with old token (might still work briefly)
        console.warn(`[gmail-webhook] Continuing with potentially expired token for ${tokenData.user_email}`);
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

    // Headers needed for routing - Gmail format=full may not include these consistently
    // We fetch metadata first with explicit header list, then full for body
    const ROUTING_HEADERS = [
      'Delivered-To',
      'X-Original-To', 
      'X-Gm-Original-To',
      'X-Forwarded-To',
      'Envelope-To',
      'To',
      'Cc',
      'From',
      'Subject',
      'Return-Path',
      'Received',
    ];

    // Fetch message details with explicit header request
    const messageDetailsPromises = messages.map(async (m: any) => {
      try {
        // Phase 1: Fetch with format=metadata + explicit metadataHeaders for routing
        // IMPORTANT: metadataHeaders must be repeated per header, not comma-separated
        const params = new URLSearchParams({ format: 'metadata' });
        ROUTING_HEADERS.forEach(h => params.append('metadataHeaders', h));
        
        const metadataResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?${params.toString()}`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        
        let headers: { name: string; value: string }[] = [];
        
        if (metadataResponse.ok) {
          const metadataMessage = await metadataResponse.json();
          headers = metadataMessage.payload?.headers || [];
          const headerNames = headers.map(h => h.name).join(', ');
          console.log(`[gmail-webhook] 📋 Metadata fetch for ${m.id}: ${headers.length} headers [${headerNames}]`);
        } else {
          const errorText = await metadataResponse.text();
          console.warn(`[gmail-webhook] ⚠️ Metadata fetch failed for ${m.id}: ${metadataResponse.status} - ${errorText.substring(0, 100)}`);
        }
        
        // Phase 2: Fetch full message for body content (worker parsing)
        const fullResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${m.id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );
        
        let fullMessage = null;
        if (fullResponse.ok) {
          fullMessage = await fullResponse.json();
          
          // Merge headers from metadata fetch into full message if missing
          // This ensures we have routing headers even if format=full didn't include them
          const fullHeaders = fullMessage.payload?.headers || [];
          const fullHeaderNames = new Set(fullHeaders.map((h: any) => h.name.toLowerCase()));
          
          for (const h of headers) {
            if (!fullHeaderNames.has(h.name.toLowerCase())) {
              fullHeaders.push(h);
            }
          }
          
          // Use merged headers for extraction
          headers = fullHeaders;
        }
        
        // Extract From and Subject for logging
        const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from');
        const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject');
        
        return { 
          message: m, 
          fullMessage, // Store full message for VPS worker
          headers,
          fromEmail: fromHeader?.value || null,
          subject: subjectHeader?.value || null,
        };
      } catch (err) {
        console.error(`Error fetching message ${m.id}:`, err);
        return { message: m, fullMessage: null, headers: [], fromEmail: null, subject: null };
      }
    });

    const messageDetails = await Promise.all(messageDetailsPromises);

    // Process messages with improved header extraction
    const tenantQueueMap = new Map<string, { tenantId: string; items: any[] }>();
    let skippedCount = 0;
    let quarantinedCount = 0;

    for (const { message, fullMessage, headers, fromEmail, subject } of messageDetails) {
      // Extract alias using priority-ordered header extraction
      const headerResult = extractAliasFromHeaders(headers);
      
      // Get tenant info for this message (fail-closed approach)
      // Routing: 1) +alias match, 2) custom inbound address lookup, 3) quarantine
      const tenantInfo = await getTenantId(headerResult.alias, headerResult);
      
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
      
      // Check rate limit for this tenant (DRY RUN - check without incrementing)
      // We'll increment AFTER we know how many were actually queued (post-dedup)
      const rateCheck = await checkRateLimit(tenantInfo.tenantId, tenantInfo.rateLimitPerMinute, tenantInfo.rateLimitPerDay, true);
      if (!rateCheck.allowed) {
        console.warn(`Rate limit exceeded for tenant ${tenantInfo.tenantName} (day: ${rateCheck.dayCount}/${tenantInfo.rateLimitPerDay}), skipping message ${message.id}`);
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
      
      // Detect provider from sender
      const provider = detectProvider(fromEmail);
      
      // Build raw payload for storage - FULL MESSAGE for VPS worker parsing
      // Include complete Gmail API message structure so worker can extract body
      const rawPayload = fullMessage || {
        id: message.id,
        threadId: message.threadId,
        internalDate: String(Date.now()),
        payload: {
          headers,
        },
        // Fallback metadata
        _metadata: {
          historyId,
          receivedAt: new Date().toISOString(),
          tenantId: tenantInfo.tenantId,
          headerExtraction: headerResult,
          fromEmail,
          subject,
        }
      };
      
      // ========================================================================
      // CONTENT DEDUPLICATION PATH (Feature-flagged)
      // ========================================================================
      let contentId: string | null = null;
      let receiptId: string | null = null;
      let payloadUrl: string | null = null;
      
      // Check if content dedup is enabled for this tenant
      const contentDedupEnabled = await isFeatureEnabled(tenantInfo.tenantId, 'content_dedup_enabled');
      
      if (contentDedupEnabled) {
        contentDedupStats.enabled = true;
        
        // ====================================================================
        // RAW MIME HASHING: Fetch format=raw and compute SHA256 of exact bytes
        // This ensures 100% identical emails produce the same hash
        // ====================================================================
        const rawMimeResult = await fetchRawMimeAndHash(accessToken, message.id);
        
        if (rawMimeResult) {
          const { rawBytes, contentHash, sizeBytes } = rawMimeResult;
          
          // Store raw MIME bytes to global content-addressed bucket
          const globalPayloadUrl = await storeRawMimeContent(provider, contentHash, rawBytes);
          
          // Upsert content + create receipt
          const dedupResult = await processContentDedup(
            tenantInfo.tenantId,
            provider,
            contentHash,
            globalPayloadUrl,
            message.id,
            historyId,
            headerResult,
            sizeBytes
          );
          
          if (dedupResult) {
            contentId = dedupResult.contentId;
            receiptId = dedupResult.receiptId;
            
            if (dedupResult.isNewContent) {
              contentDedupStats.newContent++;
            } else {
              contentDedupStats.reusedContent++;
            }
            contentDedupStats.receiptsCreated++;
            
            console.log(`[content-dedup] ✅ ${dedupResult.isNewContent ? 'NEW' : 'REUSED'} content for tenant ${tenantInfo.tenantName} (${sizeBytes} bytes)`);
          } else {
            contentDedupStats.errors++;
            console.error(`[content-dedup] ❌ Failed for message ${message.id}`);
          }
        } else {
          contentDedupStats.errors++;
          console.error(`[content-dedup] ❌ Failed to fetch raw MIME for ${message.id}`);
        }
      }

      // ========================================================================
      // LEGACY PATH: Always store to tenant-scoped bucket (dual-write for now)
      // ========================================================================
      payloadUrl = await storeRawPayload(tenantInfo.tenantId, message.id, rawPayload);
      
      // Add to tenant's queue with both legacy and new fields
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
        // NEW: Content dedup references (nullable if feature disabled)
        content_id: contentId,
        receipt_id: receiptId,
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
        
        // INCREMENT rate counter by actual queued count (post-dedup)
        // This ensures we only count emails that were actually processed, not duplicates
        await incrementRateCount(tenantId, queued);
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
    
    // Log content dedup stats if enabled
    if (contentDedupStats.enabled) {
      console.log(`[content-dedup] 📊 Stats: ${contentDedupStats.newContent} new, ${contentDedupStats.reusedContent} reused, ${contentDedupStats.receiptsCreated} receipts, ${contentDedupStats.errors} errors`);
    }
    
    console.log(`✅ Queued ${totalQueued} across ${tenantResults.length} tenants (${totalDeduplicated} deduped, ${skippedCount} skipped, ${quarantinedCount} quarantined) in ${elapsed}ms`);

    return new Response(JSON.stringify({ 
      queued: totalQueued, 
      deduplicated: totalDeduplicated,
      skipped: skippedCount,
      quarantined: quarantinedCount,
      tenants: tenantResults,
      elapsed,
      contentDedup: contentDedupStats.enabled ? contentDedupStats : undefined,
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
