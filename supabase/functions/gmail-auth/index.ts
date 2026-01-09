import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type JsonRecord = Record<string, unknown>;

function json(data: JsonRecord, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function getEnv() {
  const GMAIL_CLIENT_ID = Deno.env.get("GMAIL_CLIENT_ID") ?? "";
  const GMAIL_CLIENT_SECRET = Deno.env.get("GMAIL_CLIENT_SECRET") ?? "";
  const GMAIL_PUBSUB_TOPIC = Deno.env.get("GMAIL_PUBSUB_TOPIC") ?? "";

  return { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_PUBSUB_TOPIC };
}

function parseState(state: string | null): { tenantId?: string } {
  if (!state) return {};
  try {
    const decoded = atob(state);
    const parsed = JSON.parse(decoded);
    if (parsed && typeof parsed === "object" && typeof parsed.tenantId === "string") {
      return { tenantId: parsed.tenantId };
    }
  } catch (_e) {
    // ignore
  }
  return {};
}

function buildState(payload: { tenantId: string }) {
  return btoa(JSON.stringify(payload));
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);

    // Parse body once (supabase.functions.invoke sends JSON)
    let body: JsonRecord | null = null;
    if (req.method !== "GET") {
      try {
        body = (await req.json()) as JsonRecord;
      } catch {
        body = null;
      }
    }

    const action =
      (url.searchParams.get("action") ??
        (typeof body?.action === "string" ? (body.action as string) : null) ??
        null) ||
      // Fallback: treat POSTs to /gmail-auth as "start" if no explicit action was provided
      (req.method === "POST" && url.pathname.endsWith("/gmail-auth") ? "start" : null);

    const tenantId =
      (url.searchParams.get("tenantId") ??
        url.searchParams.get("tenant_id") ??
        (typeof body?.tenantId === "string" ? (body.tenantId as string) : null) ??
        (typeof body?.tenant_id === "string" ? (body.tenant_id as string) : null) ??
        null) ||
      null;

    const { GMAIL_CLIENT_ID, GMAIL_CLIENT_SECRET, GMAIL_PUBSUB_TOPIC } = getEnv();

    // Setup Gmail push notifications for existing tokens
    if (action === "setup-push") {
      if (!tenantId) {
        return json({ success: false, error: "Missing tenantId" });
      }

      console.log("Setting up Gmail push notifications...", { tenantId });

      // Get the most recent token for this tenant
      const { data: tokenData, error: tokenError } = await supabase
        .from("gmail_tokens")
        .select("*")
        .eq("tenant_id", tenantId)
        .order("updated_at", { ascending: false })
        .limit(1)
        .single();

      if (tokenError || !tokenData) {
        console.error("No tokens found:", tokenError);
        return json({
          success: false,
          code: "NO_GMAIL_TOKENS",
          error: "No Gmail tokens found for this tenant. Please connect Gmail first.",
        });
      }

      // Check if token needs refresh
      let accessToken = tokenData.access_token as string;
      const tokenExpiry = new Date(tokenData.token_expiry as string);

      if (tokenExpiry < new Date()) {
        console.log("Token expired, refreshing...", {
          userEmail: tokenData.user_email,
          tenantId,
          clientIdPrefix: GMAIL_CLIENT_ID ? GMAIL_CLIENT_ID.slice(0, 10) : "(missing)",
        });

        const refreshResponse = await fetch("https://oauth2.googleapis.com/token", {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: new URLSearchParams({
            client_id: GMAIL_CLIENT_ID,
            client_secret: GMAIL_CLIENT_SECRET,
            refresh_token: tokenData.refresh_token as string,
            grant_type: "refresh_token",
          }),
        });

        const refreshData = (await refreshResponse.json()) as JsonRecord;

        if (!refreshData.access_token) {
          console.error("Failed to refresh token:", refreshData);

          // If the refresh token was revoked/expired, clear it so the UI can reconnect cleanly.
          if (refreshData.error === "invalid_grant") {
            await supabase
              .from("gmail_tokens")
              .delete()
              .eq("tenant_id", tenantId)
              .eq("user_email", tokenData.user_email as string);
          }

          return json({
            success: false,
            code:
              refreshData.error === "invalid_grant"
                ? "RECONNECT_REQUIRED"
                : "TOKEN_REFRESH_FAILED",
            error: "Failed to refresh token. Please reconnect Gmail.",
            provider_error: refreshData.error ?? null,
            provider_error_description: refreshData.error_description ?? null,
          });
        }

        accessToken = refreshData.access_token as string;

        // Update token in database
        await supabase
          .from("gmail_tokens")
          .update({
            access_token: accessToken,
            token_expiry: new Date(
              Date.now() + (Number(refreshData.expires_in) || 3600) * 1000,
            ).toISOString(),
          })
          .eq("tenant_id", tenantId)
          .eq("user_email", tokenData.user_email as string);
      }

      // Call Gmail watch API
      console.log("Calling Gmail watch API with topic:", GMAIL_PUBSUB_TOPIC);
      const watchResponse = await fetch(
        "https://gmail.googleapis.com/gmail/v1/users/me/watch",
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            topicName: GMAIL_PUBSUB_TOPIC,
            labelIds: ["INBOX"],
          }),
        },
      );

      const watchData = (await watchResponse.json()) as JsonRecord;
      console.log("Gmail watch response:", watchData);

      if ((watchData as any)?.error) {
        return json({
          success: false,
          code: "WATCH_FAILED",
          error:
            (watchData as any).error?.message ||
            "Failed to setup push notifications",
          details: (watchData as any).error,
        });
      }

      return json({
        success: true,
        message: "Gmail push notifications configured successfully",
        historyId: (watchData as any).historyId,
        expiration: (watchData as any).expiration,
      });
    }

    // Initiate OAuth flow
    if (action === "start") {
      if (!tenantId) {
        return json({ success: false, error: "Missing tenantId" });
      }

      const redirectUri = `${SUPABASE_URL}/functions/v1/gmail-auth?action=callback`;
      const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
      authUrl.searchParams.set("client_id", GMAIL_CLIENT_ID);
      authUrl.searchParams.set("redirect_uri", redirectUri);
      authUrl.searchParams.set("response_type", "code");
      authUrl.searchParams.set(
        "scope",
        "https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
      );
      authUrl.searchParams.set("access_type", "offline");
      authUrl.searchParams.set("prompt", "consent");
      authUrl.searchParams.set("state", buildState({ tenantId }));

      return json({ success: true, authUrl: authUrl.toString() });
    }

    // Handle OAuth callback
    if (action === "callback") {
      const code = url.searchParams.get("code");
      if (!code) {
        throw new Error("No authorization code provided");
      }

      const { tenantId: tenantFromState } = parseState(
        url.searchParams.get("state"),
      );
      const effectiveTenantId = tenantFromState ?? null;

      console.log("Exchanging authorization code for tokens...", {
        hasTenant: !!effectiveTenantId,
      });

      const redirectUri = `${SUPABASE_URL}/functions/v1/gmail-auth?action=callback`;
      const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          code,
          client_id: GMAIL_CLIENT_ID,
          client_secret: GMAIL_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: "authorization_code",
        }),
      });

      const tokens = (await tokenResponse.json()) as JsonRecord;
      console.log("Tokens received:", {
        hasAccessToken: !!tokens.access_token,
        hasRefreshToken: !!tokens.refresh_token,
      });

      if (!tokens.access_token) {
        throw new Error("Failed to get access token");
      }

      // Get user's email address
      const userInfoResponse = await fetch(
        "https://www.googleapis.com/oauth2/v2/userinfo",
        {
          headers: { Authorization: `Bearer ${tokens.access_token}` },
        },
      );
      const userInfo = (await userInfoResponse.json()) as JsonRecord;

      const userEmail = typeof userInfo.email === "string" ? userInfo.email : null;
      if (!userEmail) {
        throw new Error("Failed to determine Gmail account email");
      }

      // Store tokens in database
      const tokenExpiry = new Date(
        Date.now() + (Number(tokens.expires_in) || 3600) * 1000,
      );

      const upsertPayload: JsonRecord = {
        user_email: userEmail,
        access_token: tokens.access_token,
        token_expiry: tokenExpiry.toISOString(),
      };

      // Only overwrite refresh_token if we got one (Google may omit it on re-auth)
      if (typeof tokens.refresh_token === "string" && tokens.refresh_token.length > 0) {
        upsertPayload.refresh_token = tokens.refresh_token;
      }

      if (effectiveTenantId) {
        upsertPayload.tenant_id = effectiveTenantId;
      }

      const { error: upsertError } = await supabase
        .from("gmail_tokens")
        .upsert(upsertPayload, { onConflict: "user_email" });

      if (upsertError) {
        console.error("Error storing tokens:", upsertError);
        throw upsertError;
      }

      // Best-effort: set up watch immediately
      try {
        const { GMAIL_PUBSUB_TOPIC: topic } = getEnv();
        await fetch("https://gmail.googleapis.com/gmail/v1/users/me/watch", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${tokens.access_token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ topicName: topic, labelIds: ["INBOX"] }),
        });
      } catch (error) {
        console.error("Error setting up push notifications:", error);
      }

      // Return success page (and ping opener to refresh UI if present)
      return new Response(
        `<html>
          <head>
            <title>Gmail Connected</title>
            <meta name="viewport" content="width=device-width, initial-scale=1" />
          </head>
          <body style="font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f0f0;">
            <div style="text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h1 style="color: #10b981; margin-bottom: 12px;">✓ Gmail Connected</h1>
              <p style="color: #666; margin-bottom: 24px;">You can close this window and return to the app.</p>
              <button onclick="window.close()" style="background: #10b981; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 16px;">Close Window</button>
            </div>
            <script>
              try {
                if (window.opener) {
                  window.opener.postMessage({ type: 'gmail_oauth_complete' }, '*');
                }
              } catch (e) {}
            </script>
          </body>
        </html>`,
        { headers: { ...corsHeaders, "Content-Type": "text/html" } },
      );
    }

    return json({ success: false, error: "Invalid request" });
  } catch (error) {
    console.error("Gmail auth error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return json({ success: false, error: errorMessage }, 500);
  }
});
