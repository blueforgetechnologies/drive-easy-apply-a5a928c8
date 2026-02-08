/**
 * Daily Gmail Watch Renewal
 * 
 * Ensures Gmail Pub/Sub push notifications stay active by calling
 * gmail.users.watch() for every tenant with valid Gmail tokens.
 * Gmail watch subscriptions expire after ~7 days, so this daily job
 * prevents stubs from silently stopping.
 * 
 * Triggered via pg_cron daily.
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

  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const cronSecret = Deno.env.get('CRON_SECRET');
  const clientId = Deno.env.get('GMAIL_CLIENT_ID');
  const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');
  const pubsubTopic = Deno.env.get('GMAIL_PUBSUB_TOPIC');

  if (!supabaseUrl || !supabaseKey) {
    return new Response(JSON.stringify({ error: 'Missing Supabase config' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  // Validate cron secret
  const providedSecret = req.headers.get('x-cron-secret');
  if (cronSecret && providedSecret !== cronSecret) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!clientId || !clientSecret || !pubsubTopic) {
    return new Response(JSON.stringify({ error: 'Missing Gmail OAuth or Pub/Sub config' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const startTime = Date.now();

  console.log('[renew-gmail-watch] Starting daily watch renewal...');

  try {
    // Get all valid Gmail tokens
    const { data: tokens, error: tokensError } = await supabase
      .from('gmail_tokens')
      .select('id, user_email, tenant_id, access_token, refresh_token, token_expiry, needs_reauth')
      .eq('needs_reauth', false);

    if (tokensError) {
      console.error('[renew-gmail-watch] Failed to fetch tokens:', tokensError.message);
      return new Response(JSON.stringify({ error: tokensError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!tokens || tokens.length === 0) {
      console.log('[renew-gmail-watch] No Gmail tokens to renew');
      return new Response(JSON.stringify({ success: true, message: 'No tokens', elapsed_ms: Date.now() - startTime }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[renew-gmail-watch] Processing ${tokens.length} Gmail accounts`);

    const results = { renewed: 0, refreshed: 0, failed: 0, errors: [] as string[] };

    for (const token of tokens) {
      try {
        // Refresh token if expired
        let accessToken = token.access_token;
        const tokenExpiry = token.token_expiry ? new Date(token.token_expiry) : new Date(0);

        if (tokenExpiry < new Date()) {
          const refreshRes = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
              client_id: clientId,
              client_secret: clientSecret,
              refresh_token: token.refresh_token,
              grant_type: 'refresh_token',
            }),
          });

          if (!refreshRes.ok) {
            const errText = await refreshRes.text();
            console.error(`[renew-gmail-watch] Token refresh failed for ${token.user_email}: ${refreshRes.status} ${errText}`);

            // Mark as needing reauth
            await supabase
              .from('gmail_tokens')
              .update({ needs_reauth: true, reauth_reason: `Daily refresh failed: ${refreshRes.status}` })
              .eq('id', token.id);

            results.failed++;
            results.errors.push(`${token.user_email}: refresh failed ${refreshRes.status}`);
            continue;
          }

          const refreshData = await refreshRes.json() as { access_token: string; expires_in: number };
          accessToken = refreshData.access_token;

          await supabase
            .from('gmail_tokens')
            .update({
              access_token: accessToken,
              token_expiry: new Date(Date.now() + (refreshData.expires_in || 3600) * 1000).toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', token.id);

          results.refreshed++;
        }

        // Call Gmail watch API
        const watchRes = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            topicName: pubsubTopic,
            labelIds: ['INBOX'],
          }),
        });

        const watchData = await watchRes.json() as Record<string, unknown>;

        if (!watchRes.ok || (watchData as any)?.error) {
          const errMsg = (watchData as any)?.error?.message || `HTTP ${watchRes.status}`;
          console.error(`[renew-gmail-watch] watch() failed for ${token.user_email}: ${errMsg}`);
          results.failed++;
          results.errors.push(`${token.user_email}: watch failed - ${errMsg}`);
          continue;
        }

        console.log(`[renew-gmail-watch] ✓ ${token.user_email} watch renewed, expiration: ${(watchData as any).expiration}`);
        results.renewed++;
      } catch (err) {
        const errMsg = `${token.user_email}: ${err instanceof Error ? err.message : String(err)}`;
        results.errors.push(errMsg);
        results.failed++;
        console.error(`[renew-gmail-watch] Exception:`, errMsg);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[renew-gmail-watch] Completed in ${elapsed}ms:`, results);

    return new Response(JSON.stringify({ success: true, ...results, elapsed_ms: elapsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[renew-gmail-watch] Unexpected error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
