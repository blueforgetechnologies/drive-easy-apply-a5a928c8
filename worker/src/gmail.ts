import { supabase } from './supabase.js';

interface GmailToken {
  access_token: string;
  refresh_token: string;
  token_expiry: string;
  user_email: string;
}

let cachedToken: { accessToken: string; expiresAt: Date } | null = null;

/**
 * Get a valid Gmail access token, refreshing if necessary.
 */
export async function getAccessToken(): Promise<string> {
  // Check cached token
  if (cachedToken && new Date() < cachedToken.expiresAt) {
    return cachedToken.accessToken;
  }

  // Fetch from database
  const { data: tokenData, error } = await supabase
    .from('gmail_tokens')
    .select('access_token, refresh_token, token_expiry, user_email')
    .limit(1)
    .single();

  if (error || !tokenData) {
    throw new Error('No Gmail token found in database');
  }

  const token = tokenData as GmailToken;

  // Check if token needs refresh
  if (new Date(token.token_expiry) <= new Date()) {
    return refreshToken(token);
  }

  // Cache the token (with 5 minute buffer)
  const expiresAt = new Date(token.token_expiry);
  expiresAt.setMinutes(expiresAt.getMinutes() - 5);
  cachedToken = { accessToken: token.access_token, expiresAt };

  return token.access_token;
}

/**
 * Refresh the Gmail OAuth token.
 */
async function refreshToken(token: GmailToken): Promise<string> {
  const clientId = process.env.GMAIL_CLIENT_ID;
  const clientSecret = process.env.GMAIL_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error('GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET are required');
  }

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

  if (!response.ok) {
    throw new Error(`Token refresh failed: ${response.status}`);
  }

  const data = await response.json();
  const newExpiry = new Date(Date.now() + data.expires_in * 1000);

  // Update token in database
  await supabase
    .from('gmail_tokens')
    .update({
      access_token: data.access_token,
      token_expiry: newExpiry.toISOString(),
    })
    .eq('user_email', token.user_email);

  // Cache the new token
  const cacheExpiry = new Date(newExpiry);
  cacheExpiry.setMinutes(cacheExpiry.getMinutes() - 5);
  cachedToken = { accessToken: data.access_token, expiresAt: cacheExpiry };

  console.log('[gmail] Token refreshed successfully');
  return data.access_token;
}

/**
 * Fetch email message from Gmail API.
 */
export async function fetchMessage(messageId: string): Promise<GmailMessage> {
  const accessToken = await getAccessToken();

  const response = await fetch(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages/${messageId}?format=full`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );

  if (!response.ok) {
    throw new Error(`Gmail API error: ${response.status}`);
  }

  return response.json();
}

export interface GmailMessage {
  id: string;
  threadId: string;
  internalDate: string;
  payload: {
    headers: Array<{ name: string; value: string }>;
    parts?: GmailPart[];
    mimeType?: string;
    body?: { data?: string };
  };
}

interface GmailPart {
  mimeType: string;
  body?: { data?: string };
  parts?: GmailPart[];
}

/**
 * Extract body content from Gmail message.
 */
export function extractBody(message: GmailMessage): { text: string; html: string } {
  const extractPart = (part: any, mimeType: string): string => {
    if (part.mimeType === mimeType && part.body?.data) {
      return Buffer.from(part.body.data, 'base64url').toString('utf-8');
    }
    if (part.parts) {
      for (const p of part.parts) {
        const text = extractPart(p, mimeType);
        if (text) return text;
      }
    }
    return '';
  };

  const text = extractPart(message.payload, 'text/plain') || extractPart(message.payload, 'text/html');
  const html = extractPart(message.payload, 'text/html');

  return { text, html };
}

/**
 * Get header value from Gmail message.
 */
export function getHeader(message: GmailMessage, name: string): string | undefined {
  return message.payload.headers.find(
    (h) => h.name.toLowerCase() === name.toLowerCase()
  )?.value;
}
