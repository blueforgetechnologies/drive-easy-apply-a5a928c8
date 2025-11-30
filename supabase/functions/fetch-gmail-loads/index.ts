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

  // Extract customer/poster from subject (this is also the broker in Sylectus emails)
  const postedByMatch = subject.match(/Posted by\s+([^(]+)/i);
  if (postedByMatch) {
    const posterName = postedByMatch[1].trim();
    parsed.customer = posterName;
    parsed.broker = posterName; // Broker is the same as the poster in Sylectus
  }

  // Extract Order Number from body text (e.g., "Bid on Order #206389")
  const orderNumberMatch = bodyText.match(/Bid on Order #(\d+)/i);
  if (orderNumberMatch) {
    parsed.order_number = orderNumberMatch[1];
  }

  // Extract from HTML structure using <strong> tags
  // Pieces: <strong>Pieces: </strong>1</p>
  const piecesHtmlMatch = bodyText.match(/<strong>Pieces?:\s*<\/strong>\s*(\d+)/i);
  if (piecesHtmlMatch) {
    parsed.pieces = parseInt(piecesHtmlMatch[1]);
  }

  // Dimensions: <strong>Dimensions: </strong>48L x 40W x 72H</p>
  const dimsHtmlMatch = bodyText.match(/<strong>Dimensions?:\s*<\/strong>\s*(\d+)L?\s*[xX]\s*(\d+)W?\s*[xX]\s*(\d+)H?/i);
  if (dimsHtmlMatch) {
    parsed.dimensions = `${dimsHtmlMatch[1]}x${dimsHtmlMatch[2]}x${dimsHtmlMatch[3]}`;
  }

  // Expires: <strong>Expires: </strong>11/30/25 12:00 EST</p>
  const expiresHtmlMatch = bodyText.match(/<strong>Expires?:\s*<\/strong>\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*([A-Z]{2,3}T?)/i);
  if (expiresHtmlMatch) {
    const dateStr = expiresHtmlMatch[1];
    const timeStr = expiresHtmlMatch[2];
    const timezone = expiresHtmlMatch[3];
    parsed.expires_datetime = `${dateStr} ${timeStr} ${timezone}`;
    
    // Convert to ISO timestamp for expires_at column with proper timezone handling
    try {
      // Parse date (handle both MM/DD/YY and MM/DD/YYYY)
      const dateParts = dateStr.split('/');
      const month = dateParts[0].padStart(2, '0');
      const day = dateParts[1].padStart(2, '0');
      let year = dateParts[2];
      
      // Convert 2-digit year to 4-digit (25 -> 2025)
      if (year.length === 2) {
        year = '20' + year;
      }
      
      // Parse time (handle both 12h and 24h format)
      const timeParts = timeStr.split(':');
      const hour = timeParts[0].padStart(2, '0');
      const minute = timeParts[1].padStart(2, '0');
      
      // Map timezone abbreviations to UTC offsets
      const timezoneOffsets: { [key: string]: string } = {
        'EST': '-05:00',
        'EDT': '-04:00',
        'CST': '-06:00',
        'CDT': '-05:00',
        'MST': '-07:00',
        'MDT': '-06:00',
        'PST': '-08:00',
        'PDT': '-07:00',
        'CEN': '-06:00', // Central
        'CENT': '-06:00',
      };
      
      const offset = timezoneOffsets[timezone.toUpperCase()] || '-05:00'; // Default to EST
      
      // Construct ISO 8601 string: YYYY-MM-DDTHH:MM:SS-05:00
      const isoString = `${year}-${month}-${day}T${hour}:${minute}:00${offset}`;
      const expiresDate = new Date(isoString);
      
      if (!isNaN(expiresDate.getTime())) {
        parsed.expires_at = expiresDate.toISOString();
      }
    } catch (e) {
      console.error('Error parsing expires date:', e);
    }
  }

  // Clean HTML for text-based parsing (fallback for other fields)
  let cleanText = bodyText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  // Extract pickup date and time from HTML structure
  // Look for the second <p> tag inside leginfo within pickup-box
  const pickupBoxMatch = bodyText.match(/<div class=['"]pickup-box['"]>[\s\S]*?<div class=['"]leginfo['"]>([\s\S]*?)<\/div>/i);
  if (pickupBoxMatch) {
    const leginfoContent = pickupBoxMatch[1];
    // Extract all <p> tags from leginfo
    const pTags = leginfoContent.match(/<p[^>]*>(.*?)<\/p>/gi);
    if (pTags && pTags.length >= 2) {
      // Second <p> tag should contain the date/time or instruction
      const secondP = pTags[1].replace(/<[^>]*>/g, '').trim();
      
      // First, try to match date + time together (e.g., "11/30/25 10:00 EST")
      const dateTimeMatch = secondP.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})/i);
      if (dateTimeMatch) {
        // Found both date and time - use them
        parsed.pickup_date = dateTimeMatch[1];
        parsed.pickup_time = dateTimeMatch[2];
      } else {
        // No date/time found, check if it's a valid instruction text (not a location fragment)
        // Valid instructions: ASAP, Deliver Direct, or similar short phrases
        // Exclude if it looks like a location (contains state abbreviations at end)
        const isLocationFragment = /\b[A-Z]{2}$/.test(secondP); // Ends with state code like "IN", "OH"
        if (!isLocationFragment && secondP.length > 0 && secondP.length < 50) {
          // It's likely a timing instruction like "ASAP" or "Deliver Direct"
          parsed.pickup_time = secondP;
        }
      }
    }
  }
  
  // Fallback to text-based extraction if nothing found
  if (!parsed.pickup_date && !parsed.pickup_time) {
    const pickupMatch = cleanText.match(/Pick.*?Up.*?(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})/i);
    if (pickupMatch) {
      parsed.pickup_date = pickupMatch[1];
      parsed.pickup_time = pickupMatch[2];
    }
  }

  // Extract delivery date and time from HTML structure
  // Look for the second <p> tag inside leginfo within delivery-box
  const deliveryBoxMatch = bodyText.match(/<div class=['"]delivery-box['"]>[\s\S]*?<div class=['"]leginfo['"]>([\s\S]*?)<\/div>/i);
  if (deliveryBoxMatch) {
    const leginfoContent = deliveryBoxMatch[1];
    // Extract all <p> tags from leginfo
    const pTags = leginfoContent.match(/<p[^>]*>(.*?)<\/p>/gi);
    if (pTags && pTags.length >= 2) {
      // Second <p> tag should contain the date/time or instruction
      const secondP = pTags[1].replace(/<[^>]*>/g, '').trim();
      
      // First, try to match date + time together (e.g., "11/30/25 10:00 EST")
      const dateTimeMatch = secondP.match(/(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})/i);
      if (dateTimeMatch) {
        // Found both date and time - use them
        parsed.delivery_date = dateTimeMatch[1];
        parsed.delivery_time = dateTimeMatch[2];
      } else {
        // No date/time found, check if it's a valid instruction text (not a location fragment)
        // Valid instructions: ASAP, Deliver Direct, or similar short phrases
        // Exclude if it looks like a location (contains state abbreviations at end)
        const isLocationFragment = /\b[A-Z]{2}$/.test(secondP); // Ends with state code like "IN", "OH"
        if (!isLocationFragment && secondP.length > 0 && secondP.length < 50) {
          // It's likely a timing instruction like "ASAP" or "Deliver Direct"
          parsed.delivery_time = secondP;
        }
      }
    }
  }
  
  // Fallback to text-based extraction if nothing found
  if (!parsed.delivery_date && !parsed.delivery_time) {
    const deliveryMatch = cleanText.match(/Delivery.*?(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})/i);
    if (deliveryMatch) {
      parsed.delivery_date = deliveryMatch[1];
      parsed.delivery_time = deliveryMatch[2];
    }
  }

  // Extract rate if available
  const rateMatch = cleanText.match(/(?:rate|pay).*?\$\s*([\d,]+(?:\.\d{2})?)/i);
  if (rateMatch) {
    parsed.rate = parseFloat(rateMatch[1].replace(/,/g, ''));
  }

  // Fallback: Extract pieces from plain text if not found in HTML
  if (!parsed.pieces) {
    const piecesMatch = cleanText.match(/(\d+)\s*(?:pieces?|pcs?|pallets?|plts?|plt|skids?)/i);
    if (piecesMatch) {
      parsed.pieces = parseInt(piecesMatch[1]);
    }
  }

  // Fallback: Extract dimensions from plain text if not found in HTML
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

  // Extract notes from HTML structure (notes-section class)
  const notesMatch = bodyText.match(/<div[^>]*class=['"]notes-section['"][^>]*>([\s\S]*?)<\/div>/i);
  if (notesMatch) {
    const notesContent = notesMatch[1];
    // Extract text from <p> tags, join with comma
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

  // Extract broker information from HTML structure
  // Broker Name: <strong>Broker Name: </strong>VALUE
  const brokerNameMatch = bodyText.match(/<strong>Broker Name:\s*<\/strong>\s*([^<]+)/i);
  if (brokerNameMatch) {
    parsed.broker_name = brokerNameMatch[1].trim();
  }

  // Broker Company: <strong>Broker Company: </strong>VALUE
  const brokerCompanyMatch = bodyText.match(/<strong>Broker Company:\s*<\/strong>\s*([^<]+)/i);
  if (brokerCompanyMatch) {
    parsed.broker_company = brokerCompanyMatch[1].trim();
  }

  // Broker Phone: <strong>Broker Phone: </strong>VALUE
  const brokerPhoneMatch = bodyText.match(/<strong>Broker Phone:\s*<\/strong>\s*([^<]+)/i);
  if (brokerPhoneMatch) {
    parsed.broker_phone = brokerPhoneMatch[1].trim();
  }

  // Email: <strong>Email: </strong>VALUE
  const brokerEmailMatch = bodyText.match(/<strong>Email:\s*<\/strong>\s*([^<]+)/i);
  if (brokerEmailMatch) {
    parsed.broker_email = brokerEmailMatch[1].trim();
  }

  return parsed;
}

async function ensureCustomerExists(parsedData: any): Promise<void> {
  // Use broker_company as the customer name (broker company is the customer)
  const customerName = parsedData?.broker_company || parsedData?.customer;
  
  // Skip invalid customer names
  if (!customerName || 
      customerName === '- Alliance Posted Load' || 
      customerName.includes('Name: </strong>') ||
      customerName.trim() === '') {
    return;
  }

  try {
    // Check if customer already exists (case-insensitive)
    const { data: existing, error: checkError } = await supabase
      .from('customers')
      .select('id')
      .ilike('name', customerName.trim())
      .maybeSingle();

    if (checkError && checkError.code !== 'PGRST116') {
      console.error('Error checking customer:', checkError);
      return;
    }

    // If customer doesn't exist, create it
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

        // Extract body (decode base64 as UTF-8)
        let bodyText = '';

        const decodeBase64Utf8 = (data: string) => {
          const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
          const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
          return new TextDecoder('utf-8').decode(bytes);
        };

        if (fullMessage.payload?.body?.data) {
          bodyText = decodeBase64Utf8(fullMessage.payload.body.data);
        } else if (fullMessage.payload?.parts) {
          for (const part of fullMessage.payload.parts) {
            if (part.mimeType === 'text/plain' && part.body?.data) {
              bodyText += decodeBase64Utf8(part.body.data);
            }
          }
        }

        // Parse load data
        const parsedData = parseLoadEmail(subject, bodyText);

        // Check and create customer if needed
        await ensureCustomerExists(parsedData);

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
              expires_at: parsedData.expires_at || null,
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
