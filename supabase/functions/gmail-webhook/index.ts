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

  const tokenExpiry = new Date(tokenData.token_expiry);
  const now = new Date();
  
  if (tokenExpiry <= now) {
    console.log('Token expired, refreshing...');
    return await refreshAccessToken(tokenData.refresh_token);
  }

  return tokenData.access_token;
}

// Full Sylectus email parser (same as fetch-gmail-loads)
function parseLoadEmail(subject: string, bodyText: string): any {
  const parsed: any = {};

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
    const posterName = postedByMatch[1].trim();
    parsed.customer = posterName;
    parsed.broker = posterName;
  }

  // Extract Order Number from body text
  const orderNumberMatch = bodyText.match(/Bid on Order #(\d+)/i);
  if (orderNumberMatch) {
    parsed.order_number = orderNumberMatch[1];
  }

  // Extract from HTML structure
  const piecesHtmlMatch = bodyText.match(/<strong>Pieces?:\s*<\/strong>\s*(\d+)/i);
  if (piecesHtmlMatch) {
    parsed.pieces = parseInt(piecesHtmlMatch[1]);
  }

  const dimsHtmlMatch = bodyText.match(/<strong>Dimensions?:\s*<\/strong>\s*(\d+)L?\s*[xX]\s*(\d+)W?\s*[xX]\s*(\d+)H?/i);
  if (dimsHtmlMatch) {
    parsed.dimensions = `${dimsHtmlMatch[1]}x${dimsHtmlMatch[2]}x${dimsHtmlMatch[3]}`;
  }

  // Expires datetime with timezone handling
  const expiresHtmlMatch = bodyText.match(/<strong>Expires?:\s*<\/strong>\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*([A-Z]{2,3}T?)/i);
  if (expiresHtmlMatch) {
    const dateStr = expiresHtmlMatch[1];
    const timeStr = expiresHtmlMatch[2];
    const timezone = expiresHtmlMatch[3];
    parsed.expires_datetime = `${dateStr} ${timeStr} ${timezone}`;
    
    try {
      const dateParts = dateStr.split('/');
      const month = dateParts[0].padStart(2, '0');
      const day = dateParts[1].padStart(2, '0');
      let year = dateParts[2];
      
      if (year.length === 2) {
        year = '20' + year;
      }
      
      const timeParts = timeStr.split(':');
      const hour = timeParts[0].padStart(2, '0');
      const minute = timeParts[1].padStart(2, '0');
      
      const timezoneOffsets: { [key: string]: string } = {
        'EST': '-05:00', 'EDT': '-04:00',
        'CST': '-06:00', 'CDT': '-05:00',
        'MST': '-07:00', 'MDT': '-06:00',
        'PST': '-08:00', 'PDT': '-07:00',
        'CEN': '-06:00', 'CENT': '-06:00',
      };
      
      const offset = timezoneOffsets[timezone.toUpperCase()] || '-05:00';
      const isoString = `${year}-${month}-${day}T${hour}:${minute}:00${offset}`;
      const expiresDate = new Date(isoString);
      
      if (!isNaN(expiresDate.getTime())) {
        parsed.expires_at = expiresDate.toISOString();
      }
    } catch (e) {
      console.error('Error parsing expires date:', e);
    }
  }

  // Clean HTML for text-based parsing
  let cleanText = bodyText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  // Extract pickup date/time from HTML structure
  const pickupBoxMatch = bodyText.match(/<div class=['"]pickup-box['"]>[\s\S]*?<div class=['"]leginfo['"]>([\s\S]*?)<\/div>/i);
  if (pickupBoxMatch) {
    const leginfoContent = pickupBoxMatch[1];
    const pTags = leginfoContent.match(/<p[^>]*>(.*?)<\/p>/gi);
    if (pTags && pTags.length >= 2) {
      const secondP = pTags[1].replace(/<[^>]*>/g, '').trim();
      const dateTimeMatch = secondP.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})/i);
      if (dateTimeMatch) {
        parsed.pickup_date = dateTimeMatch[1];
        parsed.pickup_time = dateTimeMatch[2];
      } else {
        const isLocationFragment = /\b[A-Z]{2}$/.test(secondP);
        if (!isLocationFragment && secondP.length > 0 && secondP.length < 50) {
          parsed.pickup_time = secondP;
        }
      }
    }
  }
  
  if (!parsed.pickup_date && !parsed.pickup_time) {
    const pickupMatch = cleanText.match(/Pick.*?Up.*?(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})/i);
    if (pickupMatch) {
      parsed.pickup_date = pickupMatch[1];
      parsed.pickup_time = pickupMatch[2];
    }
  }

  // Extract delivery date/time from HTML structure
  const deliveryBoxMatch = bodyText.match(/<div class=['"]delivery-box['"]>[\s\S]*?<div class=['"]leginfo['"]>([\s\S]*?)<\/div>/i);
  if (deliveryBoxMatch) {
    const leginfoContent = deliveryBoxMatch[1];
    const pTags = leginfoContent.match(/<p[^>]*>(.*?)<\/p>/gi);
    if (pTags && pTags.length >= 2) {
      const secondP = pTags[1].replace(/<[^>]*>/g, '').trim();
      const dateTimeMatch = secondP.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})/i);
      if (dateTimeMatch) {
        parsed.delivery_date = dateTimeMatch[1];
        parsed.delivery_time = dateTimeMatch[2];
      } else {
        const isLocationFragment = /\b[A-Z]{2}$/.test(secondP);
        if (!isLocationFragment && secondP.length > 0 && secondP.length < 50) {
          parsed.delivery_time = secondP;
        }
      }
    }
  }
  
  if (!parsed.delivery_date && !parsed.delivery_time) {
    const deliveryMatch = cleanText.match(/Delivery.*?(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})/i);
    if (deliveryMatch) {
      parsed.delivery_date = deliveryMatch[1];
      parsed.delivery_time = deliveryMatch[2];
    }
  }

  // Fallback pieces extraction
  if (!parsed.pieces) {
    const piecesMatch = cleanText.match(/(\d+)\s*(?:pieces?|pcs?|pallets?|plts?|plt|skids?)/i);
    if (piecesMatch) {
      parsed.pieces = parseInt(piecesMatch[1]);
    }
  }

  // Fallback dimensions extraction
  if (!parsed.dimensions) {
    const dimsSectionMatch = cleanText.match(/dimensions?[:\s-]*([0-9"' xX]+)/i);
    if (dimsSectionMatch) {
      const dimsInner = dimsSectionMatch[1];
      const dimsPattern = /(\d+)\s*[xX]\s*(\d+)\s*[xX]\s*(\d+)/;
      const innerMatch = dimsInner.match(dimsPattern);
      if (innerMatch) {
        parsed.dimensions = `${innerMatch[1]}x${innerMatch[2]}x${innerMatch[3]}`;
      }
    }
  }

  // Extract notes
  const notesMatch = bodyText.match(/<div[^>]*class=['"]notes-section['"][^>]*>([\s\S]*?)<\/div>/i);
  if (notesMatch) {
    const notesContent = notesMatch[1];
    const notesPTags = notesContent.match(/<p[^>]*>(.*?)<\/p>/gi);
    if (notesPTags && notesPTags.length > 0) {
      const notesText = notesPTags
        .map(tag => tag.replace(/<[^>]*>/g, '').trim())
        .filter(text => text.length > 0)
        .join(', ');
      if (notesText) {
        parsed.notes = notesText;
      }
    }
  }

  // Extract broker information
  const cleanedHtml = bodyText.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ');
  
  const postedAmountMatch = cleanedHtml.match(/<strong>Posted Amount:\s*<\/strong>\s*\$?\s*([\d,]+(?:\.\d{2})?)/i);
  if (postedAmountMatch) {
    parsed.rate = parseFloat(postedAmountMatch[1].replace(/,/g, ''));
  }
  
  const brokerNameMatch = cleanedHtml.match(/<strong>Broker Name:\s*<\/strong>\s*(?:<[^>]+>)?([^<]+)/i);
  if (brokerNameMatch) {
    parsed.broker_name = brokerNameMatch[1].trim();
  }

  const brokerCompanyMatch = cleanedHtml.match(/<strong>Broker Company:\s*<\/strong>\s*(?:<[^>]+>)?([^<]+)/i);
  if (brokerCompanyMatch) {
    parsed.broker_company = brokerCompanyMatch[1].trim();
  }

  const brokerPhoneMatch = cleanedHtml.match(/<strong>Broker Phone:\s*<\/strong>\s*(?:<[^>]+>)?([^<]+)/i);
  if (brokerPhoneMatch) {
    parsed.broker_phone = brokerPhoneMatch[1].trim();
  }

  let emailMatch1 = cleanedHtml.match(/<strong>Email:\s*<\/strong>\s*([^<]+)/i);
  if (emailMatch1 && emailMatch1[1].trim()) {
    parsed.email = emailMatch1[1].trim();
  }
  
  if (!parsed.email) {
    const emailInLinkMatch = cleanedHtml.match(/<strong>Email:\s*<\/strong>\s*<a[^>]*>([^<]+)<\/a>/i);
    if (emailInLinkMatch) {
      parsed.email = emailInLinkMatch[1].trim();
    }
  }
  
  const emailInSubject = subject.match(/\(([a-zA-Z0-9._-]+@[a-zA-Z0-9._-]+\.[a-zA-Z0-9_-]+)\)/);
  if (emailInSubject) {
    parsed.broker_email = emailInSubject[1].trim();
  }

  const loadTypeMatch = cleanedHtml.match(/<strong>Load Type:\s*<\/strong>\s*(?:<[^>]+>)?([^<]+)/i);
  if (loadTypeMatch) {
    parsed.load_type = loadTypeMatch[1].trim();
  }

  const dockLevelMatch = cleanedHtml.match(/<strong>Dock Level:\s*<\/strong>\s*(?:<[^>]+>)?([^<]+)/i);
  if (dockLevelMatch) {
    parsed.dock_level = dockLevelMatch[1].trim();
  }

  const hazmatMatch = cleanedHtml.match(/<strong>Hazmat:\s*<\/strong>\s*(?:<[^>]+>)?([^<]+)/i);
  if (hazmatMatch) {
    const hazmatValue = hazmatMatch[1].trim().toLowerCase();
    parsed.hazmat = hazmatValue === 'yes' || hazmatValue === 'true';
  }

  const stackableMatch = cleanedHtml.match(/<strong>Stackable:\s*<\/strong>\s*(?:<[^>]+>)?([^<]+)/i);
  if (stackableMatch) {
    const stackableValue = stackableMatch[1].trim().toLowerCase();
    parsed.stackable = stackableValue === 'yes' || stackableValue === 'true';
  }

  const twoStopsIndicator = cleanedHtml.match(/2\s+stops/i) || cleanedHtml.match(/two\s+stops/i);
  if (twoStopsIndicator) {
    parsed.has_multiple_stops = true;
    parsed.stop_count = 2;
  }

  return parsed;
}

async function ensureCustomerExists(parsedData: any): Promise<void> {
  const customerName = parsedData?.broker_company || parsedData?.customer;
  
  if (!customerName || 
      customerName === '- Alliance Posted Load' || 
      customerName.includes('Name: </strong>') ||
      customerName.trim() === '') {
    return;
  }

  try {
    const { data: existing, error: checkError } = await supabase
      .from('customers')
      .select('id')
      .ilike('name', customerName.trim())
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking customer:', checkError);
      return;
    }

    if (!existing) {
      const { error: insertError } = await supabase
        .from('customers')
        .insert({
          name: customerName.trim(),
          contact_name: parsedData?.broker_name || null,
          email: parsedData?.broker_email || null,
          phone: parsedData?.broker_phone || null,
          status: 'active',
          notes: 'Auto-imported from load email'
        });

      if (insertError) {
        console.error('Error creating customer:', insertError);
      } else {
        console.log(`Created new customer: ${customerName}`);
      }
    }
  } catch (error) {
    console.error('Error in ensureCustomerExists:', error);
  }
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('Gmail webhook received request');
    
    // Parse Pub/Sub message
    let pubsubMessage: PubSubMessage;
    try {
      pubsubMessage = await req.json();
      console.log('Pub/Sub message received:', JSON.stringify(pubsubMessage).substring(0, 200));
    } catch (parseError) {
      console.error('Failed to parse Pub/Sub message:', parseError);
      // Return 200 to acknowledge receipt (prevent retries for bad messages)
      return new Response(JSON.stringify({ error: 'Invalid message format' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }
    
    // Decode Pub/Sub message data
    let notification: any;
    try {
      const decodedData = atob(pubsubMessage.message.data);
      notification = JSON.parse(decodedData);
      console.log('Gmail notification decoded:', notification);
    } catch (decodeError) {
      console.error('Failed to decode notification:', decodeError);
      return new Response(JSON.stringify({ error: 'Invalid notification data' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Get the email address - default to configured email
    const userEmail = notification.emailAddress || 'p.d@talbilogistics.com';
    console.log('Processing notification for:', userEmail);

    // Get access token
    let accessToken: string;
    try {
      accessToken = await getAccessToken(userEmail);
      console.log('Access token retrieved successfully');
    } catch (tokenError) {
      console.error('Failed to get access token:', tokenError);
      return new Response(JSON.stringify({ error: 'Token retrieval failed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch unread messages
    const messagesResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&q=is:unread&maxResults=20',
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

    console.log(`Processing ${messagesData.messages.length} unread messages`);
    let processedCount = 0;

    // Process each message
    for (const message of messagesData.messages) {
      try {
        // Check if already processed (by email_id)
        const { data: existingEmail } = await supabase
          .from('load_emails')
          .select('id')
          .eq('email_id', message.id)
          .maybeSingle();

        if (existingEmail) {
          console.log(`Email ${message.id} already exists, skipping`);
          continue;
        }

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

        // Extract body (decode base64 as UTF-8)
        let bodyText = '';
        let bodyHtml = '';

        const decodeBase64Utf8 = (data: string) => {
          const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
          const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
          return new TextDecoder('utf-8').decode(bytes);
        };

        function extractBody(part: any) {
          if (part.mimeType === 'text/plain' && part.body?.data) {
            bodyText = decodeBase64Utf8(part.body.data);
          } else if (part.mimeType === 'text/html' && part.body?.data) {
            bodyHtml = decodeBase64Utf8(part.body.data);
          } else if (part.parts) {
            part.parts.forEach(extractBody);
          }
        }

        if (fullMessage.payload?.body?.data) {
          bodyHtml = decodeBase64Utf8(fullMessage.payload.body.data);
          bodyText = bodyHtml;
        } else if (fullMessage.payload?.parts) {
          fullMessage.payload.parts.forEach(extractBody);
        }

        // Use HTML for parsing (Sylectus emails are HTML-based)
        const contentForParsing = bodyHtml || bodyText;

        // Parse load data using comprehensive Sylectus parser
        const parsedData = parseLoadEmail(subject, contentForParsing);
        console.log('Parsed load data:', JSON.stringify(parsedData).substring(0, 300));

        // Ensure customer exists
        await ensureCustomerExists(parsedData);

        // Insert into database
        const { error: insertError } = await supabase
          .from('load_emails')
          .insert({
            email_id: fullMessage.id,
            thread_id: fullMessage.threadId,
            from_email: fromEmail,
            from_name: fromName,
            subject: subject,
            body_html: contentForParsing,
            body_text: contentForParsing.substring(0, 5000),
            received_at: receivedDate.toISOString(),
            parsed_data: parsedData,
            expires_at: parsedData.expires_at || null,
            status: 'new',
          });

        if (insertError) {
          console.error('Error storing email:', message.id, insertError);
        } else {
          processedCount++;
          console.log(`Successfully stored email: ${subject}`);
        }

        // Mark message as read in Gmail
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

      } catch (msgError) {
        console.error('Error processing message:', message.id, msgError);
      }
    }

    console.log(`Gmail webhook completed: processed ${processedCount} new emails`);

    return new Response(JSON.stringify({ success: true, processed: processedCount }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Gmail webhook error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    // Return 200 to prevent Pub/Sub retries on unexpected errors
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});