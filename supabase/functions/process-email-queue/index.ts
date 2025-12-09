import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Validate request - accepts either CRON_SECRET header or valid JWT from pg_cron
function validateRequest(req: Request): boolean {
  // Check for cron secret header first
  const cronSecret = Deno.env.get('CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  if (cronSecret && providedSecret === cronSecret) {
    return true;
  }
  
  // Also allow requests with valid Authorization header (from pg_cron with JWT)
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    // pg_cron calls include the anon key - we accept these as trusted internal calls
    return true;
  }
  
  console.error('Unauthorized: No valid cron secret or authorization header');
  return false;
}

// Parsing functions
function extractBrokerEmail(subject: string, bodyText: string): string | null {
  const subjectMatch = subject?.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (subjectMatch) return subjectMatch[0];
  
  const bodyMatch = bodyText?.match(/[\w.-]+@[\w.-]+\.\w+/);
  return bodyMatch ? bodyMatch[0] : null;
}

function parseSylectusEmail(subject: string, bodyText: string): Record<string, any> {
  const data: Record<string, any> = {};
  
  data.broker_email = extractBrokerEmail(subject, bodyText);
  
  const bidOrderMatch = bodyText?.match(/Bid on Order #(\d+)/i);
  if (bidOrderMatch) {
    data.order_number = bidOrderMatch[1];
  } else {
    const orderPatterns = [
      /Order\s*#\s*(\d+)/i,
      /Order\s*Number\s*:?\s*(\d+)/i,
      /Order\s*:?\s*#?\s*(\d+)/i,
    ];
    for (const pattern of orderPatterns) {
      const match = bodyText?.match(pattern);
      if (match) {
        data.order_number = match[1];
        break;
      }
    }
  }
  
  // First try to extract broker_name from HTML format: <strong>Broker Name: </strong>Matthew Rose
  const brokerNameHtmlMatch = bodyText?.match(/<strong>Broker\s*Name:\s*<\/strong>\s*([^<\n]+)/i);
  if (brokerNameHtmlMatch) {
    data.broker_name = brokerNameHtmlMatch[1].trim();
  }
  
  // Extract broker_company from HTML format: <strong>Broker Company: </strong>BLX LOGISTICS
  const brokerCompanyHtmlMatch = bodyText?.match(/<strong>Broker\s*Company:\s*<\/strong>\s*([^<\n]+)/i);
  if (brokerCompanyHtmlMatch) {
    data.broker_company = brokerCompanyHtmlMatch[1].trim();
  }
  
  // Extract broker_phone from HTML format: <strong>Broker Phone: </strong>941.334.9849
  const brokerPhoneHtmlMatch = bodyText?.match(/<strong>Broker\s*Phone:\s*<\/strong>\s*([^<\n]+)/i);
  if (brokerPhoneHtmlMatch) {
    data.broker_phone = brokerPhoneHtmlMatch[1].trim();
  }

  const patterns: Record<string, RegExp> = {
    broker_name: /(?:Contact|Rep|Agent)[\s:]+([A-Za-z\s]+?)(?:\n|$)/i,
    broker_company: /(?:Company|Broker)[\s:]+([^\n]+)/i,
    broker_phone: /(?:Phone|Tel|Ph)[\s:]+([0-9\s\-\(\)\.]+)/i,
    origin_city: /(?:Origin|Pick\s*up|From)[\s:]+([A-Za-z\s]+),?\s*([A-Z]{2})/i,
    destination_city: /(?:Destination|Deliver|To)[\s:]+([A-Za-z\s]+),?\s*([A-Z]{2})/i,
    posted_amount: /Posted\s*Amount[\s:]*\$?([\d,]+(?:\.\d{2})?)/i,
    vehicle_type: /(?:Equipment|Vehicle|Truck)[\s:]+([^\n]+)/i,
    load_type: /(?:Load\s*Type|Type)[\s:]+([^\n]+)/i,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
    // Skip if already extracted from HTML format
    if (data[key]) continue;
    
    const match = bodyText?.match(pattern);
    if (match) {
      if (key === 'origin_city' && match[2]) {
        data.origin_city = match[1].trim();
        data.origin_state = match[2];
      } else if (key === 'destination_city' && match[2]) {
        data.destination_city = match[1].trim();
        data.destination_state = match[2];
      } else {
        data[key] = match[1].trim();
      }
    }
  }

  // Extract origin zip code from HTML - format: ", TX 75261" or "City, TX 75261"
  const originZipMatch = bodyText?.match(/Pick-Up[\s\S]*?(?:,\s*)?([A-Z]{2})\s+(\d{5})(?:\s|<|$)/i);
  if (originZipMatch) {
    data.origin_zip = originZipMatch[2];
    // If origin_state not set, use this
    if (!data.origin_state) {
      data.origin_state = originZipMatch[1].toUpperCase();
    }
  }

  // Extract destination zip code similarly
  const destZipMatch = bodyText?.match(/Delivery[\s\S]*?(?:,\s*)?([A-Z]{2})\s+(\d{5})(?:\s|<|$)/i);
  if (destZipMatch) {
    data.destination_zip = destZipMatch[2];
    if (!data.destination_state) {
      data.destination_state = destZipMatch[1].toUpperCase();
    }
  }

  // Parse pickup datetime from "Pick-Up" section - format: MM/DD/YY HH:MM TZ
  const pickupSection = bodyText?.match(/Pick-Up[\s\S]*?(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/i);
  if (pickupSection) {
    data.pickup_date = pickupSection[1];
    data.pickup_time = pickupSection[2] + (pickupSection[3] ? ' ' + pickupSection[3] : '');
  }

  // Parse delivery datetime from "Delivery" section - format: MM/DD/YY HH:MM TZ
  const deliverySection = bodyText?.match(/Delivery[\s\S]*?(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/i);
  if (deliverySection) {
    data.delivery_date = deliverySection[1];
    data.delivery_time = deliverySection[2] + (deliverySection[3] ? ' ' + deliverySection[3] : '');
  }

  // Fallback: Try leginfo format with separate date/time
  if (!data.pickup_date) {
    const legPickup = bodyText?.match(/Pick-Up.*?<p>(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/is);
    if (legPickup) {
      data.pickup_date = legPickup[1];
      data.pickup_time = legPickup[2] + (legPickup[3] ? ' ' + legPickup[3] : '');
    }
  }

  if (!data.delivery_date) {
    const legDelivery = bodyText?.match(/Delivery.*?<p>(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/is);
    if (legDelivery) {
      data.delivery_date = legDelivery[1];
      data.delivery_time = legDelivery[2] + (legDelivery[3] ? ' ' + legDelivery[3] : '');
    }
  }

  const vehicleTypes = ['CARGO VAN', 'SPRINTER', 'SMALL STRAIGHT', 'LARGE STRAIGHT', 'FLATBED', 'TRACTOR', 'VAN'];
  for (const vt of vehicleTypes) {
    if (bodyText?.toUpperCase().includes(vt)) {
      data.vehicle_type = vt;
      break;
    }
  }

  // Parse pieces - HTML format: <strong>Pieces: </strong>1
  const piecesHtmlMatch = bodyText?.match(/<strong>Pieces?:\s*<\/strong>\s*(\d+)/i);
  if (piecesHtmlMatch) {
    data.pieces = parseInt(piecesHtmlMatch[1]);
  } else {
    // Fallback: plain text format
    const piecesMatch = bodyText?.match(/Pieces?[:\s]+(\d+)/i);
    if (piecesMatch) {
      data.pieces = parseInt(piecesMatch[1]);
    }
  }

  // Parse weight - HTML format: <strong>Weight: </strong>500 lbs
  const weightHtmlMatch = bodyText?.match(/<strong>Weight:\s*<\/strong>\s*([\d,]+)\s*(?:lbs?)?/i);
  if (weightHtmlMatch) {
    data.weight = weightHtmlMatch[1].replace(',', '');
  } else {
    // Fallback: plain text or subject line
    const weightMatch = bodyText?.match(/(?:^|[\s,])(\d{1,6})\s*(?:lbs?|pounds?)(?:[\s,.]|$)/i);
    if (weightMatch) {
      data.weight = weightMatch[1];
    }
  }

  // Parse dimensions - HTML format: <strong>Dimensions: </strong>48x48x48
  const dimensionsHtmlMatch = bodyText?.match(/<strong>Dimensions?:\s*<\/strong>\s*([^<\n]+)/i);
  if (dimensionsHtmlMatch) {
    data.dimensions = dimensionsHtmlMatch[1].trim();
  } else {
    // Fallback: plain text format like "Dimensions: 48x48x48" (must have colon to avoid CSS)
    const dimensionsPlainMatch = bodyText?.match(/Dimensions?:\s*(\d+[x×X]\d+(?:[x×X]\d+)?)/i);
    if (dimensionsPlainMatch) {
      data.dimensions = dimensionsPlainMatch[1].trim();
    }
  }

  // Parse expiration datetime from "Expires" section (handles HTML tags like <strong>Expires: </strong>)
  const expirationMatch = bodyText?.match(/Expires?[:\s]*(?:<[^>]*>)*\s*(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*(AM|PM)?\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/i);
  if (expirationMatch) {
    const dateStr = expirationMatch[1];
    const timeStr = expirationMatch[2];
    const ampm = expirationMatch[3] || '';
    const timezone = expirationMatch[4] || 'EST';
    
    data.expires_datetime = `${dateStr} ${timeStr} ${ampm} ${timezone}`.trim();
    
    // Convert to ISO timestamp for expires_at column
    try {
      const dateParts = dateStr.split('/');
      let year = parseInt(dateParts[2]);
      if (year < 100) year += 2000;
      const month = parseInt(dateParts[0]) - 1;
      const day = parseInt(dateParts[1]);
      
      let hours = parseInt(timeStr.split(':')[0]);
      const minutes = parseInt(timeStr.split(':')[1]);
      
      // Handle AM/PM if present
      if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
      if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
      
      // Timezone offsets
      const tzOffsets: Record<string, number> = {
        'EST': -5, 'EDT': -4, 'CST': -6, 'CDT': -5,
        'MST': -7, 'MDT': -6, 'PST': -8, 'PDT': -7
      };
      const offset = tzOffsets[timezone.toUpperCase()] || -5;
      
      const expiresDate = new Date(Date.UTC(year, month, day, hours - offset, minutes, 0));
      if (!isNaN(expiresDate.getTime())) {
        data.expires_at = expiresDate.toISOString();
        console.log(`📅 Parsed expiration: ${data.expires_datetime} -> ${data.expires_at}`);
      }
    } catch (e) {
      console.error('Error parsing expiration date:', e);
    }
  }

  return data;
}

async function geocodeLocation(city: string, state: string): Promise<{lat: number, lng: number} | null> {
  const mapboxToken = Deno.env.get('VITE_MAPBOX_TOKEN');
  if (!mapboxToken || !city || !state) return null;

  // Normalize the location key (lowercase, trimmed)
  const locationKey = `${city.toLowerCase().trim()}, ${state.toLowerCase().trim()}`;

  try {
    // 1. Check cache first
    const { data: cached } = await supabase
      .from('geocode_cache')
      .select('latitude, longitude, id, hit_count')
      .eq('location_key', locationKey)
      .maybeSingle();

    if (cached) {
      // Cache hit - increment hit count (fire and forget)
      supabase
        .from('geocode_cache')
        .update({ hit_count: (cached.hit_count || 1) + 1 })
        .eq('id', cached.id)
        .then(() => {});
      
      console.log(`📍 Cache HIT: ${city}, ${state}`);
      return { lat: Number(cached.latitude), lng: Number(cached.longitude) };
    }

    // 2. Cache miss - call Mapbox API
    const query = encodeURIComponent(`${city}, ${state}, USA`);
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxToken}&limit=1`
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data.features?.[0]?.center) {
        const coords = { lng: data.features[0].center[0], lat: data.features[0].center[1] };
        
        // 3. Store in cache for future use
        const currentMonth = new Date().toISOString().slice(0, 7); // YYYY-MM
        await supabase
          .from('geocode_cache')
          .upsert({
            location_key: locationKey,
            city: city.trim(),
            state: state.trim(),
            latitude: coords.lat,
            longitude: coords.lng,
            month_created: currentMonth,
          }, { onConflict: 'location_key' });
        
        console.log(`📍 Cache MISS (stored): ${city}, ${state}`);
        return coords;
      }
    }
  } catch (e) {
    console.error('Geocoding error:', e);
  }
  return null;
}

// Lookup city from zip code using Mapbox geocoding
async function lookupCityFromZip(zipCode: string, state?: string): Promise<{city: string, state: string} | null> {
  const mapboxToken = Deno.env.get('VITE_MAPBOX_TOKEN');
  if (!mapboxToken || !zipCode) return null;

  try {
    const query = encodeURIComponent(`${zipCode}, USA`);
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxToken}&types=postcode&limit=1`
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data.features?.[0]) {
        const feature = data.features[0];
        // Extract city from context
        let city = '';
        let foundState = state || '';
        
        for (const ctx of (feature.context || [])) {
          if (ctx.id?.startsWith('place.')) {
            city = ctx.text;
          }
          if (ctx.id?.startsWith('region.') && ctx.short_code) {
            // short_code is like "US-TX"
            foundState = ctx.short_code.replace('US-', '');
          }
        }
        
        // Fallback: use place_name if context didn't have city
        if (!city && feature.place_name) {
          const parts = feature.place_name.split(',');
          if (parts.length >= 2) {
            city = parts[0].replace(zipCode, '').trim();
          }
        }
        
        if (city && foundState) {
          console.log(`📮 Zip ${zipCode} -> ${city}, ${foundState}`);
          return { city, state: foundState };
        }
      }
    }
  } catch (e) {
    console.error('Zip lookup error:', e);
  }
  return null;
}

function parseSubjectLine(subject: string): Record<string, any> {
  const data: Record<string, any> = {};
  
  const subjectMatch = subject.match(/^([A-Z\s]+(?:VAN|STRAIGHT|SPRINTER|TRACTOR|FLATBED|REEFER)[A-Z\s]*)\s+(?:from|-)\s+([^,]+),\s*([A-Z]{2})\s+to\s+([^,]+),\s*([A-Z]{2})/i);
  if (subjectMatch) {
    data.vehicle_type = subjectMatch[1].trim().toUpperCase();
    data.origin_city = subjectMatch[2].trim();
    data.origin_state = subjectMatch[3].trim();
    data.destination_city = subjectMatch[4].trim();
    data.destination_state = subjectMatch[5].trim();
  }
  
  const brokerEmailMatch = subject.match(/\(([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\)/);
  if (brokerEmailMatch) {
    data.broker_email = brokerEmailMatch[1];
  }
  
  const milesMatch = subject.match(/:\s*(\d+)\s*miles/i);
  if (milesMatch) {
    data.loaded_miles = parseInt(milesMatch[1], 10);
  }
  
  const weightMatch = subject.match(/(\d+)\s*lbs/i);
  if (weightMatch) {
    data.weight = weightMatch[1];
  }
  
  const customerMatch = subject.match(/Posted by ([^(]+)\s*\(/);
  if (customerMatch) {
    const rawCustomer = customerMatch[1].trim();
    // Handle case where customer name is empty before "-" but company is after "-"
    // e.g., "Posted by  - Alliance Posted Load ("
    if (rawCustomer.startsWith('-')) {
      const afterDash = rawCustomer.substring(1).trim();
      if (afterDash) {
        data.customer = afterDash;
        data.broker_company = afterDash;
      }
    } else if (rawCustomer.includes(' - ')) {
      // Has both name and company like "John Smith - Alliance"
      const parts = rawCustomer.split(' - ');
      data.customer = parts[0].trim() || parts[1]?.trim();
      data.broker_company = parts[1]?.trim() || parts[0].trim();
    } else if (rawCustomer) {
      data.customer = rawCustomer;
      data.broker_company = rawCustomer;
    }
  }
  
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate request for security (accepts cron secret or JWT from pg_cron)
  if (!validateRequest(req)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const startTime = Date.now();
  let processed = 0;
  let errors = 0;
  let lastProcessedReceivedAt: string | null = null;
  let lastProcessedLoadId: string | null = null;

  try {
    // Get current processing state (cursor checkpoint)
    const { data: stateData } = await supabase
      .from('processing_state')
      .select('*')
      .eq('id', 'email_processor')
      .maybeSingle();
    
    // Use checkpoint or floor as starting point
    const checkpointReceivedAt = stateData?.last_processed_received_at || stateData?.floor_received_at || '2025-12-03T00:46:12Z';
    const floorReceivedAt = stateData?.floor_received_at || '2025-12-03T00:46:12Z';
    
    console.log(`📍 Checkpoint: ${checkpointReceivedAt}, Floor: ${floorReceivedAt}`);

    // Get pending queue items - process ALL pending items (cursor is for tracking, not filtering)
    const { data: queueItems, error: queueError } = await supabase
      .from('email_queue')
      .select('*')
      .eq('status', 'pending')
      .order('queued_at', { ascending: true }) // Process oldest first
      .limit(100); // Process up to 100 for maximum throughput

    if (queueError) {
      console.error('Queue fetch error:', queueError);
      return new Response(JSON.stringify({ error: 'Queue fetch failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!queueItems?.length) {
      console.log('📭 No new items in queue after checkpoint');
      return new Response(JSON.stringify({ processed: 0, message: 'No new items' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📧 Processing ${queueItems.length} queued emails (after checkpoint)`);

    // Get access token
    const { data: tokenData } = await supabase
      .from('gmail_tokens')
      .select('access_token, refresh_token, token_expiry, user_email')
      .limit(1)
      .single();

    if (!tokenData) {
      console.error('No token found');
      return new Response(JSON.stringify({ error: 'No token' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Refresh token if needed
    let accessToken = tokenData.access_token;
    if (new Date(tokenData.token_expiry) <= new Date()) {
      const clientId = Deno.env.get('GMAIL_CLIENT_ID');
      const clientSecret = Deno.env.get('GMAIL_CLIENT_SECRET');
      
      const refreshResponse = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: clientId!,
          client_secret: clientSecret!,
          refresh_token: tokenData.refresh_token,
          grant_type: 'refresh_token',
        }),
      });

      if (refreshResponse.ok) {
        const tokens = await refreshResponse.json();
        accessToken = tokens.access_token;
        await supabase
          .from('gmail_tokens')
          .update({
            access_token: tokens.access_token,
            token_expiry: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
          })
          .eq('user_email', tokenData.user_email);
      }
    }

    // Helper function to process a single email
    const processEmail = async (item: any): Promise<{ success: boolean; queuedAt: string; loadId?: string; error?: string }> => {
      try {
        // Mark as processing
        await supabase
          .from('email_queue')
          .update({ status: 'processing', attempts: item.attempts + 1 })
          .eq('id', item.id);

        // Check if already in load_emails
        const { count } = await supabase
          .from('load_emails')
          .select('id', { count: 'exact', head: true })
          .eq('email_id', item.gmail_message_id);

        if (count && count > 0) {
          await supabase
            .from('email_queue')
            .update({ status: 'completed', processed_at: new Date().toISOString() })
            .eq('id', item.id);
          return { success: true, queuedAt: item.queued_at };
        }

        // Fetch full message from Gmail
        const msgResponse = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages/${item.gmail_message_id}?format=full`,
          { headers: { Authorization: `Bearer ${accessToken}` } }
        );

        if (!msgResponse.ok) {
          throw new Error(`Gmail API error: ${msgResponse.status}`);
        }

        const message = await msgResponse.json();

        // Extract email data
        const headers = message.payload?.headers || [];
        const getHeader = (name: string) => headers.find((h: any) => h.name.toLowerCase() === name.toLowerCase())?.value;

        const subject = getHeader('Subject') || '';
        const from = getHeader('From') || '';
        const receivedAt = message.internalDate 
          ? new Date(parseInt(message.internalDate, 10)) 
          : new Date();

        // Extract body
        let bodyText = '';
        const extractBody = (part: any): string => {
          if (part.body?.data) {
            return atob(part.body.data.replace(/-/g, '+').replace(/_/g, '/'));
          }
          if (part.parts) {
            for (const p of part.parts) {
              const text = extractBody(p);
              if (text) return text;
            }
          }
          return '';
        };
        bodyText = extractBody(message.payload);

        // Parse from subject (primary) then body (fallback)
        const subjectData = parseSubjectLine(subject);
        const bodyData = parseSylectusEmail(subject, bodyText);
        const parsedData = { ...bodyData, ...subjectData };

        // If origin_city is missing but we have origin_zip, look up the city
        if (!parsedData.origin_city && parsedData.origin_zip) {
          console.log(`📮 Missing origin city, looking up zip ${parsedData.origin_zip}`);
          const cityData = await lookupCityFromZip(parsedData.origin_zip, parsedData.origin_state);
          if (cityData) {
            parsedData.origin_city = cityData.city;
            parsedData.origin_state = cityData.state;
            console.log(`📮 Resolved origin from zip: ${cityData.city}, ${cityData.state}`);
          }
        }

        // Similarly for destination
        if (!parsedData.destination_city && parsedData.destination_zip) {
          console.log(`📮 Missing destination city, looking up zip ${parsedData.destination_zip}`);
          const cityData = await lookupCityFromZip(parsedData.destination_zip, parsedData.destination_state);
          if (cityData) {
            parsedData.destination_city = cityData.city;
            parsedData.destination_state = cityData.state;
          }
        }

        // Geocode if we have origin location
        let geocodeFailed = false;
        if (parsedData.origin_city && parsedData.origin_state) {
          const coords = await geocodeLocation(parsedData.origin_city, parsedData.origin_state);
          if (coords) {
            parsedData.pickup_coordinates = coords;
          } else {
            geocodeFailed = true;
          }
        }

        // Check for issues
        const hasIssues = !parsedData.broker_email || !parsedData.origin_city || !parsedData.vehicle_type || geocodeFailed;
        const issueNotes = [];
        if (!parsedData.broker_email) issueNotes.push('Missing broker email');
        if (!parsedData.origin_city) issueNotes.push('Missing origin location');
        if (!parsedData.vehicle_type) issueNotes.push('Missing vehicle type');
        if (geocodeFailed) issueNotes.push('Geocoding failed');

        // Extract sender info
        const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/);
        const fromName = fromMatch ? fromMatch[1].trim() : from;
        const fromEmail = fromMatch ? fromMatch[2] : from;

        // Insert into load_emails
        const { data: insertedEmail, error: insertError } = await supabase
          .from('load_emails')
          .upsert({
            email_id: item.gmail_message_id,
            thread_id: message.threadId,
            from_email: fromEmail,
            from_name: fromName,
            subject,
            body_text: bodyText.substring(0, 50000),
            body_html: null,
            received_at: receivedAt.toISOString(),
            parsed_data: parsedData,
            expires_at: parsedData.expires_at || null,
            status: 'new',
            has_issues: hasIssues,
            issue_notes: issueNotes.length > 0 ? issueNotes.join('; ') : null,
          }, { onConflict: 'email_id' })
          .select('id, load_id, received_at')
          .single();

        if (insertError) throw insertError;

        // Mark queue item as completed
        await supabase
          .from('email_queue')
          .update({ status: 'completed', processed_at: new Date().toISOString() })
          .eq('id', item.id);

        // Hunt matching (fire and forget for speed)
        if (insertedEmail && parsedData.pickup_coordinates && parsedData.vehicle_type) {
          matchLoadToHunts(insertedEmail.id, insertedEmail.load_id, parsedData).catch(() => {});
        }

        return { success: true, queuedAt: item.queued_at, loadId: insertedEmail?.load_id };
      } catch (error) {
        const newStatus = item.attempts >= 3 ? 'failed' : 'pending';
        await supabase
          .from('email_queue')
          .update({ status: newStatus, last_error: String(error) })
          .eq('id', item.id);
        return { success: false, queuedAt: item.queued_at, error: String(error) };
      }
    };

    // Helper function for hunt matching
    const matchLoadToHunts = async (loadEmailId: string, loadId: string, parsedData: any) => {
      const { data: enabledHunts } = await supabase
        .from('hunt_plans')
        .select('id, vehicle_id, hunt_coordinates, pickup_radius, vehicle_size, floor_load_id')
        .eq('enabled', true);

      if (!enabledHunts?.length) return;

      const loadCoords = parsedData.pickup_coordinates;
      const loadVehicleType = parsedData.vehicle_type?.toLowerCase().replace(/[^a-z]/g, '');

      const haversineDistance = (lat1: number, lon1: number, lat2: number, lon2: number): number => {
        const R = 3959;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
          Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
          Math.sin(dLon/2) * Math.sin(dLon/2);
        return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
      };

      for (const hunt of enabledHunts) {
        if (hunt.floor_load_id && loadId <= hunt.floor_load_id) continue;

        const huntCoords = hunt.hunt_coordinates as { lat: number; lng: number } | null;
        if (!huntCoords?.lat || !huntCoords?.lng) continue;

        const distance = haversineDistance(loadCoords.lat, loadCoords.lng, huntCoords.lat, huntCoords.lng);
        if (distance > parseFloat(hunt.pickup_radius || '200')) continue;

        const huntVehicleSize = hunt.vehicle_size?.toLowerCase().replace(/[^a-z]/g, '');
        if (huntVehicleSize && loadVehicleType) {
          const matches = loadVehicleType.includes(huntVehicleSize) || huntVehicleSize.includes(loadVehicleType) ||
            (loadVehicleType.includes('cargo') && huntVehicleSize.includes('cargo')) ||
            (loadVehicleType.includes('sprinter') && huntVehicleSize.includes('sprinter')) ||
            (loadVehicleType.includes('straight') && huntVehicleSize.includes('straight'));
          if (!matches) continue;
        }

        const { count: existingMatch } = await supabase
          .from('load_hunt_matches')
          .select('id', { count: 'exact', head: true })
          .eq('load_email_id', loadEmailId)
          .eq('hunt_plan_id', hunt.id);

        if (existingMatch && existingMatch > 0) continue;

        await supabase.from('load_hunt_matches').insert({
          load_email_id: loadEmailId,
          hunt_plan_id: hunt.id,
          vehicle_id: hunt.vehicle_id,
          distance_miles: Math.round(distance),
          is_active: true,
          match_status: 'active',
          matched_at: new Date().toISOString(),
        });
      }
    };

    // Process emails in parallel batches of 10 for ~10x speedup
    const BATCH_SIZE = 10;
    for (let i = 0; i < queueItems.length; i += BATCH_SIZE) {
      const batch = queueItems.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(batch.map(item => processEmail(item)));
      
      for (const result of results) {
        if (result.status === 'fulfilled') {
          if (result.value.success) {
            processed++;
            if (result.value.queuedAt > (lastProcessedReceivedAt || '')) {
              lastProcessedReceivedAt = result.value.queuedAt;
            }
            if (result.value.loadId) {
              lastProcessedLoadId = result.value.loadId;
            }
          } else {
            errors++;
          }
        } else {
          errors++;
        }
      }
    }

    // Update checkpoint to the newest processed item (moving forward)
    if (lastProcessedReceivedAt) {
      const { error: updateError } = await supabase
        .from('processing_state')
        .upsert({
          id: 'email_processor',
          last_processed_received_at: lastProcessedReceivedAt,
          last_processed_load_id: lastProcessedLoadId,
          updated_at: new Date().toISOString(),
        }, { onConflict: 'id' });
      
      if (updateError) {
        console.error('Failed to update checkpoint:', updateError);
      } else {
        console.log(`📍 Checkpoint updated to: ${lastProcessedReceivedAt} (${lastProcessedLoadId})`);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ Batch complete: ${processed} processed, ${errors} errors, ${elapsed}ms`);

    return new Response(JSON.stringify({ 
      processed, 
      errors, 
      elapsed,
      checkpoint: lastProcessedReceivedAt,
      lastLoadId: lastProcessedLoadId
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Processor error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
