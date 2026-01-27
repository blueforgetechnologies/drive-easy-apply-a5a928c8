/**
 * Gmail API Client for VPS Worker
 * 
 * Handles token management and Gmail API calls for processing inbound stubs.
 */

import { supabase } from './supabase.js';

interface GmailToken {
  access_token: string;
  refresh_token: string | null;
  token_expiry: string;
  user_email: string;
  tenant_id: string | null;
}

interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    mimeType?: string;
    body?: { data?: string };
    parts?: any[];
  };
}

// Cache tokens to avoid repeated DB lookups (5 minute cache)
const tokenCache = new Map<string, { token: GmailToken; fetchedAt: number }>();
const TOKEN_CACHE_TTL_MS = 5 * 60 * 1000;

/**
 * Get Gmail token for an email address, with caching and auto-refresh
 */
export async function getGmailToken(emailAddress: string): Promise<GmailToken | null> {
  // Check cache first
  const cached = tokenCache.get(emailAddress);
  if (cached && Date.now() - cached.fetchedAt < TOKEN_CACHE_TTL_MS) {
    // Check if cached token is still valid
    if (new Date(cached.token.token_expiry) > new Date()) {
      return cached.token;
    }
  }

  // Fetch from database
  const { data: tokenData, error } = await supabase
    .from('gmail_tokens')
    .select('access_token, refresh_token, token_expiry, user_email, tenant_id')
    .eq('user_email', emailAddress)
    .maybeSingle();

  if (error || !tokenData) {
    console.error(`[gmail] No token found for ${emailAddress}:`, error?.message);
    return null;
  }

  let token = tokenData as GmailToken;

  // Check if token needs refresh
  if (new Date(token.token_expiry) <= new Date()) {
    console.log(`[gmail] Token expired for ${emailAddress}, refreshing...`);
    const refreshed = await refreshGmailToken(token);
    if (refreshed) {
      token = refreshed;
    } else {
      console.error(`[gmail] Failed to refresh token for ${emailAddress}`);
      return null;
    }
  }

  // Cache the token
  tokenCache.set(emailAddress, { token, fetchedAt: Date.now() });
  return token;
}

/**
 * Refresh an expired Gmail token
 */
async function refreshGmailToken(token: GmailToken): Promise<GmailToken | null> {
  if (!token.refresh_token) {
    console.error(`[gmail] No refresh token for ${token.user_email}`);
    await supabase
      .from('gmail_tokens')
      .update({ needs_reauth: true, reauth_reason: 'missing_refresh_token' })
      .eq('user_email', token.user_email);
    return null;
  }

  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    console.error('[gmail] Missing GMAIL_CLIENT_ID or GMAIL_CLIENT_SECRET');
    return null;
  }

  try {
    const response = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: clientId,
        client_secret: clientSecret,
        refresh_token: token.refresh_token,
        grant_type: 'refresh_token',
      }),
    });

    const data = await response.json();

    if (!response.ok || !data.access_token) {
      console.error(`[gmail] Token refresh failed:`, data);
      
      // Mark for re-auth if refresh token is revoked
      if (data.error === 'invalid_grant') {
        await supabase
          .from('gmail_tokens')
          .update({ needs_reauth: true, reauth_reason: 'refresh_token_revoked' })
          .eq('user_email', token.user_email);
      }
      return null;
    }

    const newExpiry = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();

    // Persist refreshed token
    await supabase
      .from('gmail_tokens')
      .update({
        access_token: data.access_token,
        token_expiry: newExpiry,
        needs_reauth: false,
        reauth_reason: null,
        updated_at: new Date().toISOString(),
      })
      .eq('user_email', token.user_email);

    console.log(`[gmail] ✅ Token refreshed for ${token.user_email}`);

    return {
      ...token,
      access_token: data.access_token,
      token_expiry: newExpiry,
    };
  } catch (error) {
    console.error(`[gmail] Token refresh exception:`, error);
    return null;
  }
}

/**
 * Fetch messages from Gmail history since a given historyId
 */
export async function fetchMessagesFromHistory(
  accessToken: string,
  historyId: string
): Promise<GmailMessage[]> {
  try {
    // Get history changes
    const historyResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/history?startHistoryId=${historyId}&historyTypes=messageAdded`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!historyResponse.ok) {
      const errorText = await historyResponse.text();
      console.error(`[gmail] History fetch failed: ${historyResponse.status} - ${errorText.substring(0, 200)}`);
      return [];
    }

    const historyData = await historyResponse.json();
    const history = historyData.history || [];

    // Extract unique message IDs from history
    const messageIds = new Set<string>();
    for (const entry of history) {
      if (entry.messagesAdded) {
        for (const added of entry.messagesAdded) {
          if (added.message?.id) {
            messageIds.add(added.message.id);
          }
        }
      }
    }

    if (messageIds.size === 0) {
      console.log('[gmail] No new messages in history');
      return [];
    }

    console.log(`[gmail] Found ${messageIds.size} messages in history`);

    // Fetch full message details
    const messages: GmailMessage[] = [];
    for (const msgId of messageIds) {
      const message = await fetchFullMessage(accessToken, msgId);
      if (message) {
        messages.push(message);
      }
    }

    return messages;
  } catch (error) {
    console.error('[gmail] Error fetching history:', error);
    return [];
  }
}

/**
 * Fetch unread messages from Sylectus and Full Circle TMS
 */
export async function fetchUnreadLoadEmails(accessToken: string): Promise<GmailMessage[]> {
  try {
    // Fetch from both providers
    const sylectusResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=is:unread from:sylectus.com`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    
    const fullCircleResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=5&q=is:unread (from:fullcircletms.com OR from:fctms.com)`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    const sylectusData = sylectusResponse.ok ? await sylectusResponse.json() : { messages: [] };
    const fullCircleData = fullCircleResponse.ok ? await fullCircleResponse.json() : { messages: [] };

    // Merge and dedupe
    const allMessageIds = new Set<string>();
    const allMessages: any[] = [];

    for (const msg of [...(sylectusData.messages || []), ...(fullCircleData.messages || [])]) {
      if (!allMessageIds.has(msg.id)) {
        allMessageIds.add(msg.id);
        allMessages.push(msg);
      }
    }

    if (allMessages.length === 0) {
      return [];
    }

    console.log(`[gmail] Found ${allMessages.length} unread messages`);

    // Fetch full details
    const messages: GmailMessage[] = [];
    for (const msg of allMessages) {
      const full = await fetchFullMessage(accessToken, msg.id);
      if (full) {
        messages.push(full);
      }
    }

    return messages;
  } catch (error) {
    console.error('[gmail] Error fetching unread messages:', error);
    return [];
  }
}

/**
 * Fetch a single message with full payload
 */
async function fetchFullMessage(accessToken: string, messageId: string): Promise<GmailMessage | null> {
  try {
    // Headers needed for routing
    const ROUTING_HEADERS = [
      'Delivered-To', 'X-Original-To', 'X-Gm-Original-To', 'X-Forwarded-To',
      'Envelope-To', 'To', 'Cc', 'From', 'Subject', 'Return-Path', 'Received',
    ];

    // Phase 1: Fetch metadata headers for reliable routing
    const metaParams = new URLSearchParams({ format: 'metadata' });
    ROUTING_HEADERS.forEach(h => metaParams.append('metadataHeaders', h));

    const metaResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?${metaParams.toString()}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    let metaHeaders: Array<{ name: string; value: string }> = [];
    if (metaResponse.ok) {
      const metaData = await metaResponse.json();
      metaHeaders = metaData.payload?.headers || [];
    }

    // Phase 2: Fetch full message for body
    const fullResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );

    if (!fullResponse.ok) {
      console.error(`[gmail] Failed to fetch message ${messageId}: ${fullResponse.status}`);
      return null;
    }

    const fullMessage = await fullResponse.json();

    // Merge metadata headers into full message
    const fullHeaders = fullMessage.payload?.headers || [];
    const fullHeaderNames = new Set(fullHeaders.map((h: any) => h.name.toLowerCase()));

    for (const h of metaHeaders) {
      if (!fullHeaderNames.has(h.name.toLowerCase())) {
        fullHeaders.push(h);
      }
    }

    return {
      id: fullMessage.id,
      threadId: fullMessage.threadId,
      internalDate: fullMessage.internalDate,
      payload: {
        ...fullMessage.payload,
        headers: fullHeaders,
      },
    };
  } catch (error) {
    console.error(`[gmail] Error fetching message ${messageId}:`, error);
    return null;
  }
}

/**
 * Mark a message as read
 */
export async function markMessageAsRead(accessToken: string, messageId: string): Promise<void> {
  try {
    await fetch(`https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}/modify`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    });
  } catch (error) {
    // Non-critical - don't throw
    console.warn(`[gmail] Failed to mark ${messageId} as read:`, error);
  }
}

/**
 * Extract Gmail alias from email headers
 */
export function extractAliasFromHeaders(headers: Array<{ name: string; value: string }>): {
  alias: string | null;
  source: string | null;
  deliveredTo: string | null;
} {
  const headerMap = new Map<string, string>();
  for (const h of headers) {
    headerMap.set(h.name.toLowerCase(), h.value);
  }

  const deliveredTo = headerMap.get('delivered-to') || null;
  
  // Priority order for alias extraction
  const priorityOrder = [
    { header: headerMap.get('delivered-to'), source: 'Delivered-To' },
    { header: headerMap.get('x-original-to'), source: 'X-Original-To' },
    { header: headerMap.get('x-gm-original-to'), source: 'X-Gm-Original-To' },
    { header: headerMap.get('x-forwarded-to'), source: 'X-Forwarded-To' },
    { header: headerMap.get('envelope-to'), source: 'Envelope-To' },
    { header: headerMap.get('to'), source: 'To' },
    { header: headerMap.get('cc'), source: 'Cc' },
  ];

  for (const { header, source } of priorityOrder) {
    if (!header) continue;
    const match = header.match(/([^@]+)\+([^@]+)@/);
    if (match && match[2]) {
      return { alias: `+${match[2]}`, source, deliveredTo };
    }
  }

  return { alias: null, source: null, deliveredTo };
}

/**
 * Get tenant ID from gmail alias
 */
export async function getTenantIdFromAlias(alias: string | null): Promise<{
  tenantId: string | null;
  tenantName: string | null;
  isPaused: boolean;
}> {
  if (!alias) {
    return { tenantId: null, tenantName: null, isPaused: false };
  }

  const { data: tenant } = await supabase
    .from('tenants')
    .select('id, name, is_paused')
    .eq('gmail_alias', alias)
    .maybeSingle();

  if (tenant) {
    return { tenantId: tenant.id, tenantName: tenant.name, isPaused: tenant.is_paused || false };
  }

  return { tenantId: null, tenantName: null, isPaused: false };
}

/**
 * Check if Load Hunter is enabled for tenant
 */
export async function isLoadHunterEnabled(tenantId: string): Promise<boolean> {
  const { data } = await supabase.rpc('is_feature_enabled', {
    _tenant_id: tenantId,
    _feature_key: 'load_hunter_enabled',
  });
  return data === true;
}

/**
 * Store raw payload to object storage
 */
export async function storeRawPayload(
  tenantId: string,
  messageId: string,
  payload: any
): Promise<string | null> {
  try {
    const timestamp = new Date().toISOString().split('T')[0];
    const filePath = `${tenantId}/${timestamp}/${messageId}.json`;

    const { error } = await supabase.storage
      .from('email-payloads')
      .upload(filePath, JSON.stringify(payload), {
        contentType: 'application/json',
        upsert: true,
      });

    if (error) {
      console.error(`[gmail] Failed to store payload: ${error.message}`);
      return null;
    }

    return filePath;
  } catch (error) {
    console.error('[gmail] Storage error:', error);
    return null;
  }
}
