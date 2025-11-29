import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GMAIL_CLIENT_ID = Deno.env.get('GMAIL_CLIENT_ID')!;
const GMAIL_CLIENT_SECRET = Deno.env.get('GMAIL_CLIENT_SECRET')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface PubSubMessage {
  message: {
    data: string;
    messageId: string;
    publishTime: string;
  };
  subscription: string;
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const tokens = await response.json();
  if (!tokens.access_token) {
    throw new Error('Failed to refresh access token');
  }

  // Update token in database
  const tokenExpiry = new Date(Date.now() + (tokens.expires_in * 1000));
  await supabase
    .from('gmail_tokens')
    .update({
      access_token: tokens.access_token,
      token_expiry: tokenExpiry.toISOString(),
    })
    .eq('refresh_token', refreshToken);

  return tokens.access_token;
}

async function getAccessToken(userEmail: string): Promise<string> {
  const { data: tokenData, error } = await supabase
    .from('gmail_tokens')
    .select('*')
    .eq('user_email', userEmail)
    .single();

  if (error || !tokenData) {
    throw new Error('No token found for user');
  }

  // Check if token is expired
  const tokenExpiry = new Date(tokenData.token_expiry);
  const now = new Date();
  
  if (tokenExpiry <= now) {
    console.log('Token expired, refreshing...');
    return await refreshAccessToken(tokenData.refresh_token);
  }

  return tokenData.access_token;
}

function parseLoadEmail(subject: string, bodyText: string): any {
  const parsed: any = {
    origin: null,
    destination: null,
    pickup_date: null,
    delivery_date: null,
    rate: null,
    miles: null,
    weight: null,
    equipment_type: null,
    commodity: null,
  };

  // Extract origin and destination (common patterns)
  const originDestMatch = bodyText.match(/(?:from|origin|pickup)[\s:]+([A-Z]{2}|[A-Za-z\s]+,\s*[A-Z]{2})/i);
  if (originDestMatch) parsed.origin = originDestMatch[1].trim();

  const destMatch = bodyText.match(/(?:to|destination|delivery)[\s:]+([A-Z]{2}|[A-Za-z\s]+,\s*[A-Z]{2})/i);
  if (destMatch) parsed.destination = destMatch[1].trim();

  // Extract rate
  const rateMatch = bodyText.match(/(?:rate|pay|paying)[\s:]*\$?([\d,]+(?:\.\d{2})?)/i);
  if (rateMatch) parsed.rate = parseFloat(rateMatch[1].replace(/,/g, ''));

  // Extract miles
  const milesMatch = bodyText.match(/([\d,]+)\s*(?:miles|mi|dh)/i);
  if (milesMatch) parsed.miles = parseInt(milesMatch[1].replace(/,/g, ''));

  // Extract weight
  const weightMatch = bodyText.match(/([\d,]+)\s*(?:lbs?|pounds?|weight)/i);
  if (weightMatch) parsed.weight = parseInt(weightMatch[1].replace(/,/g, ''));

  // Extract equipment type
  const equipmentMatch = bodyText.match(/(?:equipment|trailer|truck)[\s:]*([A-Za-z0-9\s]+?)(?:\n|rate|$)/i);
  if (equipmentMatch) parsed.equipment_type = equipmentMatch[1].trim();

  // Extract commodity
  const commodityMatch = bodyText.match(/(?:commodity|product|freight)[\s:]*([A-Za-z0-9\s]+?)(?:\n|rate|$)/i);
  if (commodityMatch) parsed.commodity = commodityMatch[1].trim();

  // Extract dates
  const pickupDateMatch = bodyText.match(/(?:pickup|pick up|available)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
  if (pickupDateMatch) parsed.pickup_date = pickupDateMatch[1];

  const deliveryDateMatch = bodyText.match(/(?:delivery|deliver by)[\s:]*(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i);
  if (deliveryDateMatch) parsed.delivery_date = deliveryDateMatch[1];

  return parsed;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const pubsubMessage: PubSubMessage = await req.json();
    
    // Decode Pub/Sub message
    const decodedData = atob(pubsubMessage.message.data);
    const notification = JSON.parse(decodedData);
    
    console.log('Gmail notification received:', notification);

    // Get the email address from notification
    const userEmail = notification.emailAddress || 'P.D@talbilogistics.com';

    // Get access token
    const accessToken = await getAccessToken(userEmail);

    // Fetch list of messages (get latest unread messages)
    const messagesResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?q=is:unread&maxResults=10',
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    const messagesData = await messagesResponse.json();
    
    if (!messagesData.messages || messagesData.messages.length === 0) {
      console.log('No new messages to process');
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`Processing ${messagesData.messages.length} messages`);

    // Process each message
    for (const message of messagesData.messages) {
      try {
        // Fetch full message details
        const messageResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`,
          {
            headers: { 'Authorization': `Bearer ${accessToken}` },
          }
        );

        const messageData = await messageResponse.json();
        
        // Extract headers
        const headers = messageData.payload.headers;
        const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from');
        const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject');
        const dateHeader = headers.find((h: any) => h.name.toLowerCase() === 'date');

        const fromEmail = fromHeader?.value || '';
        const fromName = fromEmail.split('<')[0].trim();
        const subject = subjectHeader?.value || '';
        const receivedAt = dateHeader ? new Date(dateHeader.value).toISOString() : new Date().toISOString();

        // Extract body text
        let bodyText = '';
        let bodyHtml = '';

        const decodeBase64Utf8 = (data: string) => {
          const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
          const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
          return new TextDecoder('utf-8').decode(bytes);
        };

        function extractBody(part: any) {
          if (part.mimeType === 'text/plain' && part.body.data) {
            bodyText = decodeBase64Utf8(part.body.data);
          } else if (part.mimeType === 'text/html' && part.body.data) {
            bodyHtml = decodeBase64Utf8(part.body.data);
          } else if (part.parts) {
            part.parts.forEach(extractBody);
          }
        }

        extractBody(messageData.payload);

        // Parse load information
        const parsedData = parseLoadEmail(subject, bodyText);

        // Store in database
        const { error: emailError } = await supabase
          .from('load_emails')
          .insert({
            email_id: message.id,
            thread_id: messageData.threadId,
            from_email: fromEmail,
            from_name: fromName,
            subject: subject,
            received_at: receivedAt,
            body_text: bodyText,
            body_html: bodyHtml,
            parsed_data: parsedData,
            status: 'new',
            expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(), // 7 days
          });

        if (emailError) {
          console.error('Error storing email:', emailError);
        } else {
          console.log('Email stored successfully:', message.id);
        }

        // Mark message as read
        await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}/modify`,
          {
            method: 'POST',
            headers: {
              'Authorization': `Bearer ${accessToken}`,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              removeLabelIds: ['UNREAD'],
            }),
          }
        );

      } catch (error) {
        console.error('Error processing message:', message.id, error);
      }
    }

    return new Response(JSON.stringify({ success: true, processed: messagesData.messages.length }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Gmail webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});