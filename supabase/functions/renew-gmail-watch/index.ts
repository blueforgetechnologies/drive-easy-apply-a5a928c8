/**
 * Gmail Watch Renewal (Hardened v3)
 * 
 * Ensures Gmail Pub/Sub push notifications stay active AND access tokens stay fresh.
 * 
 * Key behaviors:
 * - On EVERY run (every 2h): refreshes access token for all tokens expiring within 5 min
 * - Watch renewal: only calls watch() when watch_expiry is NULL or within 24h of expiry
 * - This keeps the DB token_expiry current, preventing false "Token expired" UI warnings
 * - Only marks needs_reauth=true on invalid_grant (revoked token)
 * 
 * Triggered via pg_cron every 2 hours.
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

  // Validate cron secret - but allow if CRON_SECRET is not set (fail-open for cron)
  const providedSecret = req.headers.get('x-cron-secret');
  if (cronSecret && providedSecret && providedSecret !== cronSecret) {
    console.error('[renew-gmail-watch] CRON_SECRET mismatch - rejecting');
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  if (!clientId || !clientSecret || !pubsubTopic) {
    console.error('[renew-gmail-watch] Missing Gmail OAuth or Pub/Sub config', {
      hasClientId: !!clientId,
      hasClientSecret: !!clientSecret,
      hasPubsubTopic: !!pubsubTopic,
    });
    return new Response(JSON.stringify({ error: 'Missing Gmail OAuth or Pub/Sub config' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const startTime = Date.now();

  console.log('[renew-gmail-watch] Starting watch renewal (v3-always-refresh-token, 2h cycle)...');

  try {
    // Get ALL tokens that don't need reauth
    const { data: tokens, error: tokensError } = await supabase
      .from('gmail_tokens')
      .select('id, user_email, tenant_id, access_token, refresh_token, token_expiry, watch_expiry, needs_reauth')
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

    console.log(`[renew-gmail-watch] Processing ${tokens.length} Gmail account(s)`);

    const results = { renewed: 0, refreshed: 0, skipped: 0, failed: 0, errors: [] as string[] };

    for (const token of tokens) {
      try {
        // Determine if watch needs renewal:
        // - watch_expiry is NULL (never set or lost)
        // - watch_expiry is within 24 hours of now (proactive renewal)
        const watchExpiry = token.watch_expiry ? new Date(token.watch_expiry) : null;
        const twentyFourHoursFromNow = new Date(Date.now() + 24 * 60 * 60 * 1000);
        const needsWatchRenewal = !watchExpiry || watchExpiry < twentyFourHoursFromNow;

        // ALWAYS check if access token needs refresh (1h expiry from Google).
        // This runs on every 2h cycle regardless of watch status, keeping the DB
        // token_expiry current and preventing false "Token expired" UI warnings.
        let accessToken = token.access_token;
        const tokenExpiry = token.token_expiry ? new Date(token.token_expiry) : new Date(0);
        const fiveMinFromNow = new Date(Date.now() + 5 * 60 * 1000);
        const tokenNeedsRefresh = tokenExpiry < fiveMinFromNow;

        if (tokenNeedsRefresh) {
          console.log(`[renew-gmail-watch] 🔑 Refreshing access token for ${token.user_email}`);
          
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
            console.error(`[renew-gmail-watch] ❌ Token refresh failed for ${token.user_email}: ${refreshRes.status} ${errText}`);

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
              results.errors.push(`${token.user_email}: refresh failed ${refreshRes.status} (transient, will retry in 2h)`);
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
          console.log(`[renew-gmail-watch] ✅ Token refreshed for ${token.user_email}`);
        } else {
          console.log(`[renew-gmail-watch] ⏭️ ${token.user_email} access token still valid until ${tokenExpiry.toISOString()}`);
        }

        // Only call Gmail watch API if the subscription needs renewal
        if (!needsWatchRenewal) {
          console.log(`[renew-gmail-watch] ⏭️ ${token.user_email} watch still valid until ${watchExpiry?.toISOString()}`);
          results.skipped++;
          continue;
        }

        const renewalReason = !watchExpiry ? 'watch_expiry_null' : 'watch_expiring_soon';
        console.log(`[renew-gmail-watch] 📡 Calling watch() for ${token.user_email} (${renewalReason})`);
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
          console.error(`[renew-gmail-watch] ❌ watch() failed for ${token.user_email}: ${errMsg}`);
          results.failed++;
          results.errors.push(`${token.user_email}: watch failed - ${errMsg}`);
          continue;
        }

        // Store watch_expiry from Gmail response (expiration is in ms epoch)
        const expirationMs = (watchData as any).expiration;
        const newWatchExpiry = expirationMs ? new Date(Number(expirationMs)).toISOString() : null;

        await supabase
          .from('gmail_tokens')
          .update({
            watch_expiry: newWatchExpiry,
            updated_at: new Date().toISOString(),
          })
          .eq('id', token.id);

        console.log(`[renew-gmail-watch] ✅ ${token.user_email} watch renewed, expiry: ${newWatchExpiry}`);
        results.renewed++;
      } catch (err) {
        const errMsg = `${token.user_email}: ${err instanceof Error ? err.message : String(err)}`;
        results.errors.push(errMsg);
        results.failed++;
        console.error(`[renew-gmail-watch] ❌ Exception:`, errMsg);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`[renew-gmail-watch] ✅ Completed in ${elapsed}ms:`, JSON.stringify(results));

    return new Response(JSON.stringify({ success: true, ...results, elapsed_ms: elapsed }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('[renew-gmail-watch] ❌ Unexpected error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
