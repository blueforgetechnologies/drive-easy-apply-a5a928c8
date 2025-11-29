import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const GMAIL_CLIENT_ID = Deno.env.get('GMAIL_CLIENT_ID')!;
const GMAIL_CLIENT_SECRET = Deno.env.get('GMAIL_CLIENT_SECRET')!;
const GMAIL_PUBSUB_TOPIC = Deno.env.get('GMAIL_PUBSUB_TOPIC')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const url = new URL(req.url);
    let action = url.searchParams.get('action');

    // Also support receiving the action in the JSON body (for supabase.functions.invoke)
    if (!action && req.method !== 'GET' && req.method !== 'OPTIONS') {
      try {
        const body = await req.json();
        if (body && typeof body.action === 'string') {
          action = body.action;
        }
      } catch (_err) {
        console.error('Failed to parse request body for gmail-auth:', _err);
      }
    }

    // Fallback: treat POSTs to /gmail-auth as "start" if no explicit action was provided
    if (!action && req.method === 'POST' && url.pathname.endsWith('/gmail-auth')) {
      action = 'start';
    }

    // Initiate OAuth flow
    if (action === 'start') {
      const redirectUri = `${SUPABASE_URL}/functions/v1/gmail-auth?action=callback`;
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', GMAIL_CLIENT_ID);
      authUrl.searchParams.set('redirect_uri', redirectUri);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.readonly https://www.googleapis.com/auth/gmail.modify https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile');
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');

      return new Response(JSON.stringify({ authUrl: authUrl.toString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle OAuth callback
    if (action === 'callback') {
      const code = url.searchParams.get('code');
      
      if (!code) {
        throw new Error('No authorization code provided');
      }

      console.log('Exchanging authorization code for tokens...');

      // Exchange code for tokens
      const redirectUri = `${SUPABASE_URL}/functions/v1/gmail-auth?action=callback`;
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GMAIL_CLIENT_ID,
          client_secret: GMAIL_CLIENT_SECRET,
          redirect_uri: redirectUri,
          grant_type: 'authorization_code',
        }),
      });

      const tokens = await tokenResponse.json();
      console.log('Tokens received:', { hasAccessToken: !!tokens.access_token, hasRefreshToken: !!tokens.refresh_token });

      if (!tokens.access_token) {
        throw new Error('Failed to get access token');
      }

      // Get user's email address
      const userInfoResponse = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
        headers: { 'Authorization': `Bearer ${tokens.access_token}` },
      });
      const userInfo = await userInfoResponse.json();
      console.log('User email:', userInfo.email);

      // Store tokens in database
      const tokenExpiry = new Date(Date.now() + (tokens.expires_in * 1000));
      const { error: upsertError } = await supabase
        .from('gmail_tokens')
        .upsert({
          user_email: userInfo.email,
          access_token: tokens.access_token,
          refresh_token: tokens.refresh_token,
          token_expiry: tokenExpiry.toISOString(),
        }, {
          onConflict: 'user_email'
        });

      if (upsertError) {
        console.error('Error storing tokens:', upsertError);
        throw upsertError;
      }

      console.log('Tokens stored successfully');

      // Set up Gmail push notifications
      try {
        const watchResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${tokens.access_token}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            topicName: GMAIL_PUBSUB_TOPIC,
            labelIds: ['INBOX'],
          }),
        });

        const watchData = await watchResponse.json();
        console.log('Gmail push notifications configured:', watchData);
      } catch (error) {
        console.error('Error setting up push notifications:', error);
      }

      // Return success page
      return new Response(
        `<html>
          <head><title>Gmail Integration Success</title></head>
          <body style="font-family: Arial, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #f0f0f0;">
            <div style="text-align: center; background: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,0.1);">
              <h1 style="color: #10b981; margin-bottom: 20px;">✓ Gmail Connected Successfully!</h1>
              <p style="color: #666; margin-bottom: 30px;">Your Gmail account is now connected to Load Hunter.</p>
              <button onclick="window.close()" style="background: #10b981; color: white; border: none; padding: 12px 24px; border-radius: 6px; cursor: pointer; font-size: 16px;">Close Window</button>
            </div>
          </body>
        </html>`,
        {
          headers: { ...corsHeaders, 'Content-Type': 'text/html' },
        }
      );
    }

    return new Response('Invalid request', { status: 400, headers: corsHeaders });
  } catch (error) {
    console.error('Gmail auth error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});