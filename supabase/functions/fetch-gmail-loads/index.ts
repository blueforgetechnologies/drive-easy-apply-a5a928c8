import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const GMAIL_CLIENT_ID = Deno.env.get('GMAIL_CLIENT_ID')!;
const GMAIL_CLIENT_SECRET = Deno.env.get('GMAIL_CLIENT_SECRET')!;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

async function refreshAccessToken(refreshToken: string): Promise<string> {
  const tokenResponse = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: GMAIL_CLIENT_ID,
      client_secret: GMAIL_CLIENT_SECRET,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
    }),
  });

  const tokens = await tokenResponse.json();
  
  if (!tokens.access_token) {
    throw new Error('Failed to refresh access token');
  }

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
    throw new Error('No Gmail token found');
  }

  const tokenExpiry = new Date(tokenData.token_expiry);
  if (tokenExpiry <= new Date()) {
    return await refreshAccessToken(tokenData.refresh_token);
  }

  return tokenData.access_token;
}

function parseLoadEmail(subject: string, bodyText: string): any {
  const parsed: any = {};

  // Parse Sylectus email subject format:
  // "VAN from Van Horn, TX to Tupelo, MS - Expedited Load - Typical Premium Freight Hot Shot Load : 1091 miles, 0 lbs. - Posted by..."
  
  // Extract vehicle type (first word)
  const vehicleTypeMatch = subject.match(/^([A-Z\s]+)\s+from/i);
  if (vehicleTypeMatch) {
    parsed.vehicle_type = vehicleTypeMatch[1].trim();
  }

  // Extract origin and destination from subject
  const routeMatch = subject.match(/from\s+([^,]+),\s*([A-Z]{2})\s+to\s+([^,]+),\s*([A-Z]{2})/i);
  if (routeMatch) {
    parsed.origin_city = routeMatch[1].trim();
    parsed.origin_state = routeMatch[2].trim();
    parsed.destination_city = routeMatch[3].trim();
    parsed.destination_state = routeMatch[4].trim();
  }

  // Extract miles from subject
  const milesMatch = subject.match(/:\s*(\d+)\s*miles/i);
  if (milesMatch) {
    parsed.loaded_miles = parseInt(milesMatch[1]);
  }

  // Extract weight from subject
  const weightMatch = subject.match(/(\d+)\s*lbs/i);
  if (weightMatch) {
    parsed.weight = weightMatch[1];
  }

  // Extract customer/poster from subject
  const postedByMatch = subject.match(/Posted by\s+([^(]+)/i);
  if (postedByMatch) {
    parsed.customer = postedByMatch[1].trim();
  }

  // Clean HTML if present in body
  let cleanText = bodyText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  // Extract pickup date and time from body
  const pickupMatch = cleanText.match(/Pick.*?Up.*?(\d{1,2}\/\d{1,2}\/\d{4}).*?(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
  if (pickupMatch) {
    parsed.pickup_date = pickupMatch[1];
    parsed.pickup_time = pickupMatch[2];
  }

  // Extract delivery date and time from body
  const deliveryMatch = cleanText.match(/Delivery.*?(\d{1,2}\/\d{1,2}\/\d{4}).*?(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
  if (deliveryMatch) {
    parsed.delivery_date = deliveryMatch[1];
    parsed.delivery_time = deliveryMatch[2];
  }

  // Extract rate if available
  const rateMatch = cleanText.match(/(?:rate|pay).*?\$\s*([\d,]+(?:\.\d{2})?)/i);
  if (rateMatch) {
    parsed.rate = parseFloat(rateMatch[1].replace(/,/g, ''));
  }

  // Extract pieces
  const piecesMatch = cleanText.match(/(\d+)\s*(?:pieces|pcs|pallets)/i);
  if (piecesMatch) {
    parsed.pieces = parseInt(piecesMatch[1]);
  }

  // Extract dimensions
  const dimensionsMatch = cleanText.match(/dimensions?.*?(\d+[xX]\d+[xX]\d+)/i);
  if (dimensionsMatch) {
    parsed.dimensions = dimensionsMatch[1];
  }

  // Extract available footage
  const availMatch = cleanText.match(/(\d+)\s*(?:ft|feet).*?avail/i);
  if (availMatch) {
    parsed.avail_ft = availMatch[1];
  }

  return parsed;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Fetching Gmail emails...');

    // Get access token
    const accessToken = await getAccessToken('p.d@talbilogistics.com');
    console.log('Access token retrieved');

    // Fetch unread messages from inbox
    const messagesResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&q=is:unread&maxResults=50',
      {
        headers: { 'Authorization': `Bearer ${accessToken}` },
      }
    );

    const messagesData = await messagesResponse.json();
    console.log(`Found ${messagesData.messages?.length || 0} unread messages`);

    if (!messagesData.messages || messagesData.messages.length === 0) {
      return new Response(
        JSON.stringify({ message: 'No new emails found', count: 0 }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let processedCount = 0;

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

        const fullMessage = await messageResponse.json();
        
        // Extract headers
        const headers = fullMessage.payload?.headers || [];
        const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from');
        const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject');
        const dateHeader = headers.find((h: any) => h.name.toLowerCase() === 'date');

        const fromEmail = fromHeader?.value || 'unknown@example.com';
        const fromName = fromEmail.split('<')[0].trim();
        const subject = subjectHeader?.value || '(No Subject)';
        const receivedDate = dateHeader?.value ? new Date(dateHeader.value) : new Date();

        // Extract body
        let bodyText = '';
        if (fullMessage.payload?.body?.data) {
          bodyText = atob(fullMessage.payload.body.data.replace(/-/g, '+').replace(/_/g, '/'));
        } else if (fullMessage.payload?.parts) {
          for (const part of fullMessage.payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              bodyText += atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
            }
          }
        }

        // Parse load data
        const parsedData = parseLoadEmail(subject, bodyText);

        // Check if email already exists
        const { data: existing } = await supabase
          .from('load_emails')
          .select('id')
          .eq('email_id', fullMessage.id)
          .maybeSingle();

        if (!existing) {
          // Insert into database
          const { error: insertError } = await supabase
            .from('load_emails')
            .insert({
              email_id: fullMessage.id,
              thread_id: fullMessage.threadId,
              from_email: fromEmail,
              from_name: fromName,
              subject: subject,
              body_html: bodyText, // Store full HTML content
              body_text: bodyText.substring(0, 5000), // Short text preview for parsing/search
              received_at: receivedDate.toISOString(),
              parsed_data: parsedData,
              status: 'new',
            });

          if (insertError) {
            console.error('Error inserting email:', insertError);
          } else {
            processedCount++;
            console.log(`Processed email: ${subject}`);
          }
        }
      } catch (error) {
        console.error('Error processing message:', error);
      }
    }

    console.log(`Successfully processed ${processedCount} new emails`);

    return new Response(
      JSON.stringify({ 
        message: 'Emails fetched successfully', 
        count: processedCount 
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );
  } catch (error) {
    console.error('Error in fetch-gmail-loads:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
