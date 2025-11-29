import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const GMAIL_CLIENT_ID = Deno.env.get('GMAIL_CLIENT_ID');
const GMAIL_CLIENT_SECRET = Deno.env.get('GMAIL_CLIENT_SECRET');
const GMAIL_PUBSUB_TOPIC = Deno.env.get('GMAIL_PUBSUB_TOPIC');
const REDIRECT_URI = `${Deno.env.get('SUPABASE_URL')}/functions/v1/gmail-auth-callback`;

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
    const action = url.searchParams.get('action');

    // Initiate OAuth flow
    if (action === 'start') {
      const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
      authUrl.searchParams.set('client_id', GMAIL_CLIENT_ID!);
      authUrl.searchParams.set('redirect_uri', REDIRECT_URI);
      authUrl.searchParams.set('response_type', 'code');
      authUrl.searchParams.set('scope', 'https://www.googleapis.com/auth/gmail.readonly');
      authUrl.searchParams.set('access_type', 'offline');
      authUrl.searchParams.set('prompt', 'consent');

      return new Response(JSON.stringify({ authUrl: authUrl.toString() }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Handle OAuth callback
    if (url.pathname.endsWith('/gmail-auth-callback')) {
      const code = url.searchParams.get('code');
      
      if (!code) {
        return new Response('Authorization code not found', { status: 400 });
      }

      // Exchange code for tokens
      const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          code,
          client_id: GMAIL_CLIENT_ID!,
          client_secret: GMAIL_CLIENT_SECRET!,
          redirect_uri: REDIRECT_URI,
          grant_type: 'authorization_code',
        }),
      });

      if (!tokenResponse.ok) {
        throw new Error('Failed to exchange authorization code');
      }

      const tokens = await tokenResponse.json();
      console.log('OAuth tokens obtained successfully');

      // Set up Gmail push notifications
      const watchResponse = await fetch('https://gmail.googleapis.com/gmail/v1/users/me/watch', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${tokens.access_token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          topicName: GMAIL_PUBSUB_TOPIC,
          labelIds: ['INBOX'],
          labelFilterBehavior: 'INCLUDE',
        }),
      });

      if (!watchResponse.ok) {
        const error = await watchResponse.text();
        console.error('Failed to set up Gmail watch:', error);
        throw new Error('Failed to set up Gmail notifications');
      }

      const watchData = await watchResponse.json();
      console.log('Gmail push notifications configured:', watchData);

      // Return success page
      return new Response(`
        <!DOCTYPE html>
        <html>
          <head>
            <title>Gmail Integration Complete</title>
            <style>
              body {
                font-family: system-ui, -apple-system, sans-serif;
                display: flex;
                justify-content: center;
                align-items: center;
                height: 100vh;
                margin: 0;
                background: #f5f5f5;
              }
              .container {
                background: white;
                padding: 40px;
                border-radius: 8px;
                box-shadow: 0 2px 10px rgba(0,0,0,0.1);
                text-align: center;
              }
              h1 { color: #10b981; margin-bottom: 16px; }
              p { color: #666; margin-bottom: 24px; }
              button {
                background: #2563eb;
                color: white;
                border: none;
                padding: 12px 24px;
                border-radius: 6px;
                cursor: pointer;
                font-size: 16px;
              }
              button:hover { background: #1d4ed8; }
            </style>
          </head>
          <body>
            <div class="container">
              <h1>✓ Gmail Integration Successful!</h1>
              <p>Load emails from P.D@talbilogistics.com will now appear in the Load Hunter tab.</p>
              <button onclick="window.close()">Close Window</button>
            </div>
          </body>
        </html>
      `, {
        headers: { 'Content-Type': 'text/html' },
      });
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