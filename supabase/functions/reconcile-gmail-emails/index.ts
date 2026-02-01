/**
 * Gmail Reconciliation Job
 * 
 * Hourly job that compares Gmail inbox vs load_emails table and ingests gaps.
 * This catches any emails missed due to history.list gaps or worker failures.
 * 
 * ARCHITECTURE:
 * - Runs hourly via cron
 * - For each tenant with Gmail connected, fetches recent inbox messages
 * - Compares against load_emails.email_id
 * - Creates gmail_stubs for any missing messages (worker will process them)
 */

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Initialize Supabase inside the request handler
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cronSecret = Deno.env.get('CRON_SECRET');
  
  if (!supabaseUrl || !supabaseKey) {
    console.error('[reconcile-gmail] Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
    return new Response(JSON.stringify({ error: 'Server configuration error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Validate cron secret for scheduled invocations
  const providedSecret = req.headers.get('x-cron-secret');
  if (cronSecret && providedSecret !== cronSecret) {
    console.log('[reconcile-gmail] Invalid or missing cron secret');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);

  console.log('[reconcile-gmail] Starting hourly reconciliation...');
  const startTime = Date.now();

  try {
    // Get all tenants with Load Hunter enabled and Gmail connected
    const { data: tenants, error: tenantsError } = await supabase
      .from('tenants')
      .select('id, name')
      .eq('load_hunter_enabled', true);

    if (tenantsError) {
      console.error('[reconcile-gmail] Failed to fetch tenants:', tenantsError.message);
      return new Response(JSON.stringify({ error: tenantsError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!tenants || tenants.length === 0) {
      console.log('[reconcile-gmail] No tenants with Load Hunter enabled, exiting early');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No tenants to reconcile',
        elapsed_ms: Date.now() - startTime 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get Gmail tokens for these tenants
    const tenantIds = tenants.map(t => t.id);
    const { data: tokens, error: tokensError } = await supabase
      .from('gmail_tokens')
      .select('id, user_email, tenant_id, access_token, refresh_token, token_expiry, needs_reauth')
      .in('tenant_id', tenantIds)
      .eq('needs_reauth', false);

    if (tokensError) {
      console.error('[reconcile-gmail] Failed to fetch tokens:', tokensError.message);
      return new Response(JSON.stringify({ error: tokensError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!tokens || tokens.length === 0) {
      console.log('[reconcile-gmail] No valid Gmail tokens found');
      return new Response(JSON.stringify({ 
        success: true, 
        message: 'No Gmail tokens to reconcile',
        elapsed_ms: Date.now() - startTime 
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[reconcile-gmail] Processing ${tokens.length} Gmail accounts across ${tenants.length} tenants`);

    const results = {
      accountsProcessed: 0,
      accountsWithGaps: 0,
      stubsCreated: 0,
      errors: [] as string[],
    };

    // Process each Gmail account
    for (const token of tokens) {
      try {
        const accountResult = await reconcileAccount(supabase, token);
        results.accountsProcessed++;
        if (accountResult.stubsCreated > 0) {
          results.accountsWithGaps++;
          results.stubsCreated += accountResult.stubsCreated;
        }
      } catch (err) {
        const errorMsg = `${token.user_email}: ${err instanceof Error ? err.message : String(err)}`;
        results.errors.push(errorMsg);
        console.error(`[reconcile-gmail] Error processing account:`, errorMsg);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[reconcile-gmail] Completed in ${elapsed}ms:`, results);

    return new Response(JSON.stringify({ 
      success: true, 
      ...results,
      elapsed_ms: elapsed 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('[reconcile-gmail] Unexpected error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : String(error) 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});

interface GmailToken {
  id: string;
  user_email: string;
  tenant_id: string;
  access_token: string;
  refresh_token: string;
  token_expiry: string | null;
  needs_reauth: boolean;
}

interface ReconcileResult {
  stubsCreated: number;
  messagesChecked: number;
  alreadyExists: number;
}

async function reconcileAccount(
  supabase: any,
  token: GmailToken
): Promise<ReconcileResult> {
  const clientId = Deno.env.get('GMAIL_CLIENT_ID');
  const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');

  if (!clientId || !clientSecret) {
    throw new Error('Gmail OAuth credentials not configured');
  }

  // Refresh token if expired
  let accessToken: string | null = token.access_token;
  if (isTokenExpired(token.token_expiry)) {
    console.log(`[reconcile-gmail] Refreshing token for ${token.user_email}`);
    accessToken = await refreshToken(supabase, token, clientId, clientSecret);
    if (!accessToken) {
      throw new Error('Failed to refresh token');
    }
  }

  // Fetch recent inbox messages (last 2 hours for hourly job)
  const recentMessages = await fetchRecentInboxMessages(accessToken, token.user_email, 100, 120);
  
  if (recentMessages.length === 0) {
    console.log(`[reconcile-gmail] No recent messages for ${token.user_email}`);
    return { stubsCreated: 0, messagesChecked: 0, alreadyExists: 0 };
  }

  console.log(`[reconcile-gmail] Found ${recentMessages.length} recent messages for ${token.user_email}`);

  // Check which messages already exist in load_emails
  const messageIds = recentMessages.map(m => m.id);
  const { data: existing, error: existingError } = await supabase
    .from('load_emails')
    .select('email_id')
    .eq('tenant_id', token.tenant_id)
    .in('email_id', messageIds);

  if (existingError) {
    throw new Error(`Failed to check existing emails: ${existingError.message}`);
  }

  const existingIds = new Set((existing || []).map((e: any) => e.email_id));
  const missingIds = messageIds.filter(id => !existingIds.has(id));

  if (missingIds.length === 0) {
    console.log(`[reconcile-gmail] No missing messages for ${token.user_email}`);
    return { 
      stubsCreated: 0, 
      messagesChecked: recentMessages.length, 
      alreadyExists: existingIds.size 
    };
  }

  console.log(`[reconcile-gmail] Found ${missingIds.length} missing messages for ${token.user_email}, creating stubs`);

  // Get the latest historyId from the first message (most recent)
  const latestHistoryId = recentMessages[0]?.historyId || '0';

  // Create gmail_stubs for missing messages (worker will process them)
  // We use a synthetic history_id based on the latest message
  const stubsToCreate = missingIds.map(messageId => ({
    tenant_id: token.tenant_id,
    email_address: token.user_email,
    history_id: latestHistoryId, // Use latest historyId as reference
    status: 'pending',
    source: 'reconciliation', // Mark source for tracking
    queued_at: new Date().toISOString(),
  }));

  // Insert stubs (ignore duplicates)
  const { data: insertedStubs, error: stubsError } = await supabase
    .from('gmail_stubs')
    .insert(stubsToCreate)
    .select('id');

  if (stubsError) {
    // Log but don't fail - some may be duplicates
    console.warn(`[reconcile-gmail] Stubs insert warning for ${token.user_email}:`, stubsError.message);
  }

  const stubsCreated = insertedStubs?.length || 0;

  // Log reconciliation event
  await supabase.from('circuit_breaker_events').insert({
    tenant_id: token.tenant_id,
    email_address: token.user_email,
    history_id: latestHistoryId,
    breaker_type: 'reconciliation_run',
    reason: `Reconciled: ${missingIds.length} missing, ${stubsCreated} stubs created`,
  });

  return {
    stubsCreated,
    messagesChecked: recentMessages.length,
    alreadyExists: existingIds.size,
  };
}

function isTokenExpired(tokenExpiry: string | null): boolean {
  if (!tokenExpiry) return true;
  const expiryTime = new Date(tokenExpiry).getTime();
  const bufferMs = 5 * 60 * 1000; // 5 minute buffer
  return Date.now() > (expiryTime - bufferMs);
}

async function refreshToken(
  supabase: any,
  token: GmailToken,
  clientId: string,
  clientSecret: string
): Promise<string | null> {
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

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[reconcile-gmail] Token refresh failed: ${response.status} ${errorText}`);
      
      // Mark token as needing reauth
      await supabase
        .from('gmail_tokens')
        .update({ needs_reauth: true, reauth_reason: `Refresh failed: ${response.status}` })
        .eq('id', token.id);
      
      return null;
    }

    const data = await response.json() as { access_token: string; expires_in: number };
    const newExpiry = new Date(Date.now() + (data.expires_in || 3600) * 1000).toISOString();

    // Update token in database
    await supabase
      .from('gmail_tokens')
      .update({
        access_token: data.access_token,
        token_expiry: newExpiry,
        updated_at: new Date().toISOString(),
      })
      .eq('id', token.id);

    return data.access_token;
  } catch (error) {
    console.error(`[reconcile-gmail] Token refresh exception:`, error);
    return null;
  }
}

interface MessageListItem {
  id: string;
  threadId?: string;
  historyId?: string;
}

async function fetchRecentInboxMessages(
  accessToken: string,
  emailAddress: string,
  maxResults: number,
  newerThanMinutes: number
): Promise<MessageListItem[]> {
  try {
    const afterDate = new Date(Date.now() - newerThanMinutes * 60 * 1000);
    const afterEpoch = Math.floor(afterDate.getTime() / 1000);
    
    const url = new URL(`https://gmail.googleapis.com/gmail/v1/users/${emailAddress}/messages`);
    url.searchParams.set('maxResults', String(maxResults));
    url.searchParams.set('q', `in:inbox after:${afterEpoch}`);
    
    const response = await fetch(url.toString(), {
      headers: { Authorization: `Bearer ${accessToken}` },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[reconcile-gmail] Messages.list failed: ${response.status} ${errorText}`);
      return [];
    }

    const data = await response.json() as { messages?: MessageListItem[] };
    return data.messages || [];
  } catch (error) {
    console.error(`[reconcile-gmail] Messages.list exception:`, error);
    return [];
  }
}
