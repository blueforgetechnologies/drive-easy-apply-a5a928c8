/**
 * Daily Gmail Watch Renewal
 * 
 * Ensures Gmail Pub/Sub push notifications stay active by calling
 * gmail.users.watch() for every active tenant with valid Gmail tokens.
 * Gmail watch subscriptions expire after ~7 days, so this runs every 12h.
 * 
 * Key behaviors:
 * - Only marks needs_reauth=true on invalid_grant (revoked token)
 * - Stores watch_expiry after each successful watch() call
 * - Only processes tokens updated in the last 7 days (active tenants)
 * 
 * Triggered via pg_cron every 12 hours.
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

  console.log('[renew-gmail-watch] Starting watch renewal...');

  try {
    // Only get tokens that are active (updated in last 7 days) and don't need reauth
    const { data: tokens, error: tokensError } = await supabase
      .from('gmail_tokens')
      .select('id, user_email, tenant_id, access_token, refresh_token, token_expiry, needs_reauth')
      .eq('needs_reauth', false)
      .gte('updated_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    if (tokensError) {
      console.error('[renew-gmail-watch] Failed to fetch tokens:', tokensError.message);
      return new Response(JSON.stringify({ error: tokensError.message }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!tokens || tokens.length === 0) {
      console.log('[renew-gmail-watch] No active Gmail tokens to renew');
      return new Response(JSON.stringify({ success: true, message: 'No active tokens', elapsed_ms: Date.now() - startTime }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`[renew-gmail-watch] Processing ${tokens.length} active Gmail accounts`);

    const results = { renewed: 0, refreshed: 0, failed: 0, errors: [] as string[] };

    for (const token of tokens) {
      try {
        // Refresh token if expired or expiring within 5 minutes
        let accessToken = token.access_token;
        const tokenExpiry = token.token_expiry ? new Date(token.token_expiry) : new Date(0);
        const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);

        if (tokenExpiry < fiveMinFromNow) {
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

            // ONLY mark needs_reauth on invalid_grant (token revoked/expired permanently)
            const isInvalidGrant = errText.includes('invalid_grant');
            if (isInvalidGrant) {
              await supabase
                .from('gmail_tokens')
                .update({ needs_reauth: true, reauth_reason: 'invalid_grant: refresh token revoked or expired' })
                .eq('id', token.id);
              results.errors.push(`${token.user_email}: invalid_grant - marked needs_reauth`);
            } else {
              // Transient failure - log but do NOT mark needs_reauth
              results.errors.push(`${token.user_email}: refresh failed ${refreshRes.status} (transient, will retry next cycle)`);
            }

            results.failed++;
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

        // Store watch_expiry from Gmail response (expiration is in ms epoch)
        const expirationMs = (watchData as any).expiration;
        const watchExpiry = expirationMs ? new Date(Number(expirationMs)).toISOString() : null;

        await supabase
          .from('gmail_tokens')
          .update({
            watch_expiry: watchExpiry,
            updated_at: new Date().toISOString(),
          })
          .eq('id', token.id);

        console.log(`[renew-gmail-watch] ✓ ${token.user_email} watch renewed, expiry: ${watchExpiry}`);
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
