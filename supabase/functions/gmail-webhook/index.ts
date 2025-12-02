import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

// Declare EdgeRuntime for Supabase Edge Functions
declare const EdgeRuntime: {
  waitUntil: (promise: Promise<any>) => void;
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const GMAIL_CLIENT_ID = Deno.env.get('GMAIL_CLIENT_ID')!;
const GMAIL_CLIENT_SECRET = Deno.env.get('GMAIL_CLIENT_SECRET')!;
const MAPBOX_TOKEN = Deno.env.get('VITE_MAPBOX_TOKEN')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  db: { schema: 'public' },
  auth: { persistSession: false }
});

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Refresh Gmail access token
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
    .select('access_token, refresh_token, token_expiry')
    .ilike('user_email', userEmail)
    .maybeSingle();

  if (error || !tokenData) {
    throw new Error('No token found for user');
  }

  const tokenExpiry = new Date(tokenData.token_expiry);
  if (tokenExpiry <= new Date()) {
    return await refreshAccessToken(tokenData.refresh_token);
  }

  return tokenData.access_token;
}

// Simplified email parser - extract only essential fields quickly
function parseLoadEmailFast(subject: string, bodyHtml: string): any {
  const parsed: any = {};
  
  // Extract from subject (fastest)
  const subjectMatch = subject.match(/^([A-Z\s]+(?:VAN|STRAIGHT|SPRINTER|TRACTOR|FLATBED|REEFER)[A-Z\s]*)\s+(?:from|-)\s+([^,]+),\s*([A-Z]{2})\s+to\s+([^,]+),\s*([A-Z]{2})/i);
  if (subjectMatch) {
    parsed.vehicle_type = subjectMatch[1].trim().toUpperCase();
    parsed.origin_city = subjectMatch[2].trim();
    parsed.origin_state = subjectMatch[3].trim();
    parsed.destination_city = subjectMatch[4].trim();
    parsed.destination_state = subjectMatch[5].trim();
  }
  
  // Extract broker email from subject
  const brokerEmailMatch = subject.match(/\(([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\)/);
  if (brokerEmailMatch) {
    parsed.broker_email = brokerEmailMatch[1];
  }
  
  // Extract miles from subject
  const milesMatch = subject.match(/:\s*(\d+)\s*miles/i);
  if (milesMatch) {
    parsed.loaded_miles = parseInt(milesMatch[1], 10);
  }
  
  // Extract weight from subject
  const weightMatch = subject.match(/(\d+)\s*lbs/i);
  if (weightMatch) {
    parsed.weight = weightMatch[1];
  }
  
  // Extract customer/broker name from subject
  const customerMatch = subject.match(/Posted by ([^(]+)\s*\(/);
  if (customerMatch) {
    parsed.customer = customerMatch[1].trim();
    parsed.broker_company = customerMatch[1].trim();
  }
  
  // Quick body parsing for additional fields if needed
  if (bodyHtml) {
    // Order number
    const orderMatch = bodyHtml.match(/Order(?:\s+Number)?[\s:#]*(\d+)/i);
    if (orderMatch) parsed.order_number = orderMatch[1];
    
    // Posted amount
    const rateMatch = bodyHtml.match(/Posted\s+Amount[:\s]*\$?([\d,]+(?:\.\d{2})?)/i);
    if (rateMatch) parsed.rate = parseFloat(rateMatch[1].replace(',', ''));
    
    // Expiration
    const expiresMatch = bodyHtml.match(/Expires[:\s]*(\d{1,2}\/\d{1,2}\/\d{2,4})\s*(\d{1,2}:\d{2})\s*(AM|PM)?\s*(EST|CST|PST|ET|CT|PT)?/i);
    if (expiresMatch) {
      try {
        const dateStr = expiresMatch[1];
        const timeStr = expiresMatch[2];
        const ampm = expiresMatch[3] || '';
        const parts = dateStr.split('/');
        let year = parseInt(parts[2], 10);
        if (year < 100) year += 2000;
        let hours = parseInt(timeStr.split(':')[0], 10);
        const minutes = parseInt(timeStr.split(':')[1], 10);
        if (ampm.toUpperCase() === 'PM' && hours < 12) hours += 12;
        if (ampm.toUpperCase() === 'AM' && hours === 12) hours = 0;
        const date = new Date(year, parseInt(parts[0], 10) - 1, parseInt(parts[1], 10), hours, minutes);
        parsed.expires_at = date.toISOString();
      } catch (e) {}
    }
  }
  
  return parsed;
}

// Fast geocoding with caching in memory
const geocodeCache = new Map<string, { lat: number; lng: number }>();

async function geocodeLocationFast(city: string, state: string): Promise<{ lat: number; lng: number } | null> {
  if (!city || !state || !MAPBOX_TOKEN) return null;
  
  const cacheKey = `${city.toLowerCase()},${state.toLowerCase()}`;
  if (geocodeCache.has(cacheKey)) {
    return geocodeCache.get(cacheKey)!;
  }
  
  try {
    const query = encodeURIComponent(`${city}, ${state}, USA`);
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&country=US&limit=1`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    if (data.features && data.features.length > 0) {
      const [lng, lat] = data.features[0].center;
      const result = { lat, lng };
      geocodeCache.set(cacheKey, result);
      return result;
    }
    return null;
  } catch {
    return null;
  }
}

// Calculate distance using Haversine formula
function calculateDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 3959;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLng/2) * Math.sin(dLng/2);
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

// Process a single email and return the record to insert
async function processEmail(message: any, accessToken: string): Promise<any | null> {
  try {
    const messageResponse = await fetch(
      `https://gmail.googleapis.com/gmail/v1/users/me/messages/${message.id}?format=full`,
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );
    
    if (!messageResponse.ok) return null;
    
    const fullMessage = await messageResponse.json();
    const headers = fullMessage.payload?.headers || [];
    const fromHeader = headers.find((h: any) => h.name.toLowerCase() === 'from');
    const subjectHeader = headers.find((h: any) => h.name.toLowerCase() === 'subject');
    const dateHeader = headers.find((h: any) => h.name.toLowerCase() === 'date');

    const fromEmail = fromHeader?.value || 'unknown@example.com';
    const fromName = fromEmail.split('<')[0].trim();
    const subject = subjectHeader?.value || '(No Subject)';
    const receivedDate = dateHeader?.value ? new Date(dateHeader.value) : new Date();

    // Extract body
    let bodyHtml = '';
    const decodeBase64Utf8 = (data: string) => {
      const binary = atob(data.replace(/-/g, '+').replace(/_/g, '/'));
      const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
      return new TextDecoder('utf-8').decode(bytes);
    };

    function extractBody(part: any) {
      if (part.mimeType === 'text/html' && part.body?.data) {
        bodyHtml = decodeBase64Utf8(part.body.data);
      } else if (part.parts) {
        part.parts.forEach(extractBody);
      }
    }

    if (fullMessage.payload?.body?.data) {
      bodyHtml = decodeBase64Utf8(fullMessage.payload.body.data);
    } else if (fullMessage.payload?.parts) {
      fullMessage.payload.parts.forEach(extractBody);
    }

    // Parse load data (fast version)
    const parsedData = parseLoadEmailFast(subject, bodyHtml);
    
    // Geocode pickup location
    if (parsedData.origin_city && parsedData.origin_state) {
      const coords = await geocodeLocationFast(parsedData.origin_city, parsedData.origin_state);
      if (coords) {
        parsedData.pickup_coordinates = coords;
      }
    }

    // Fix expires_at if before received_at
    let finalExpiresAt = parsedData.expires_at || null;
    if (finalExpiresAt) {
      const expiresDate = new Date(finalExpiresAt);
      if (expiresDate <= receivedDate) {
        finalExpiresAt = new Date(receivedDate.getTime() + 24 * 60 * 60 * 1000).toISOString();
      }
    }

    return {
      email_id: fullMessage.id,
      thread_id: fullMessage.threadId,
      from_email: fromEmail,
      from_name: fromName,
      subject: subject,
      body_html: bodyHtml.substring(0, 50000), // Limit size
      body_text: bodyHtml.substring(0, 5000),
      received_at: receivedDate.toISOString(),
      parsed_data: parsedData,
      expires_at: finalExpiresAt,
      status: 'new',
    };
  } catch (error) {
    console.error('Error processing message:', message.id, error);
    return null;
  }
}

// Background task to create hunt matches (runs after response is sent)
async function createMatchesBackground(emailRecords: any[]) {
  try {
    // Get all active hunt plans once
    const { data: huntPlans } = await supabase
      .from('hunt_plans')
      .select('id, vehicle_id, hunt_coordinates, pickup_radius, vehicle_size')
      .eq('enabled', true);

    if (!huntPlans?.length) return;

    const matchesToInsert: any[] = [];

    for (const record of emailRecords) {
      const parsedData = record.parsed_data;
      const pickupCoords = parsedData?.pickup_coordinates;
      
      if (!pickupCoords?.lat || !pickupCoords?.lng) continue;

      const loadVehicleType = (parsedData?.vehicle_type || '').toLowerCase();

      for (const plan of huntPlans) {
        const huntCoords = plan.hunt_coordinates as { lat: number; lng: number } | null;
        if (!huntCoords?.lat || !huntCoords?.lng) continue;

        const distance = calculateDistance(
          huntCoords.lat, huntCoords.lng,
          pickupCoords.lat, pickupCoords.lng
        );

        const radius = parseInt(plan.pickup_radius || '300', 10);
        if (distance > radius) continue;

        // Vehicle type matching
        let vehicleSizes: string[] = [];
        if (plan.vehicle_size) {
          try {
            vehicleSizes = typeof plan.vehicle_size === 'string' 
              ? JSON.parse(plan.vehicle_size) 
              : plan.vehicle_size;
          } catch {
            vehicleSizes = [plan.vehicle_size];
          }
        }

        const vehicleMatches = vehicleSizes.length === 0 || vehicleSizes.some((huntSize: string) => {
          const normalizedHuntSize = huntSize.toLowerCase().replace(/\s+/g, ' ');
          return loadVehicleType.includes(normalizedHuntSize) || 
                 normalizedHuntSize.includes(loadVehicleType.replace(/-/g, ' '));
        });

        if (!vehicleMatches) continue;

        // Get the load_email id from database
        const { data: loadEmail } = await supabase
          .from('load_emails')
          .select('id')
          .eq('email_id', record.email_id)
          .single();

        if (loadEmail) {
          matchesToInsert.push({
            load_email_id: loadEmail.id,
            hunt_plan_id: plan.id,
            vehicle_id: plan.vehicle_id,
            distance_miles: Math.round(distance),
            match_score: Math.max(0, 100 - (distance / radius) * 50),
            is_active: true
          });
        }
      }
    }

    // Batch insert matches
    if (matchesToInsert.length > 0) {
      const { error } = await supabase
        .from('load_hunt_matches')
        .upsert(matchesToInsert, { 
          onConflict: 'load_email_id,hunt_plan_id',
          ignoreDuplicates: true 
        });
      
      if (error) {
        console.error('Error inserting matches:', error);
      } else {
        console.log(`✅ Created ${matchesToInsert.length} hunt matches`);
      }
    }
  } catch (error) {
    console.error('Background match creation error:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  
  try {
    // Get access token - use the configured Gmail account
    let accessToken: string;
    try {
      // Get the first available Gmail token
      const { data: tokenRecord } = await supabase
        .from('gmail_tokens')
        .select('user_email')
        .limit(1)
        .single();
      
      if (!tokenRecord) {
        throw new Error('No Gmail tokens configured');
      }
      
      accessToken = await getAccessToken(tokenRecord.user_email);
    } catch (tokenError) {
      console.error('Token error:', tokenError);
      return new Response(JSON.stringify({ error: 'Token failed' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Fetch only 3 unread messages at a time for reliability
    const messagesResponse = await fetch(
      'https://gmail.googleapis.com/gmail/v1/users/me/messages?labelIds=INBOX&q=is:unread&maxResults=3',
      { headers: { 'Authorization': `Bearer ${accessToken}` } }
    );

    const messagesData = await messagesResponse.json();
    
    if (!messagesData.messages || messagesData.messages.length === 0) {
      console.log('No new messages');
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📧 Processing ${messagesData.messages.length} messages`);

    // Process emails in parallel
    const emailPromises = messagesData.messages.map((msg: any) => processEmail(msg, accessToken));
    const emailRecords = (await Promise.all(emailPromises)).filter(Boolean);

    if (emailRecords.length === 0) {
      return new Response(JSON.stringify({ success: true, processed: 0 }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Batch insert all emails at once (much faster than individual inserts)
    const { data: insertedEmails, error: insertError } = await supabase
      .from('load_emails')
      .upsert(emailRecords, { 
        onConflict: 'email_id',
        ignoreDuplicates: true 
      })
      .select('email_id');

    const processedCount = insertedEmails?.length || 0;

    if (insertError) {
      console.error('Insert error:', insertError);
    } else {
      console.log(`✅ Inserted ${processedCount} emails in ${Date.now() - startTime}ms`);
    }

    // Mark messages as read in parallel
    const markReadPromises = messagesData.messages.map((msg: any) =>
      fetch(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}/modify`,
        {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
        }
      ).catch(() => {}) // Ignore errors
    );
    
    // Don't wait for mark-as-read to complete
    Promise.all(markReadPromises);

    // Create hunt matches in background (after response is sent)
    if (processedCount > 0) {
      EdgeRuntime.waitUntil(createMatchesBackground(emailRecords));
    }

    return new Response(JSON.stringify({ 
      success: true, 
      processed: processedCount,
      duration_ms: Date.now() - startTime 
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Webhook error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
