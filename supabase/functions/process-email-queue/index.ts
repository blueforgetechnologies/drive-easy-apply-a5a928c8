import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Parsing functions
function extractBrokerEmail(subject: string, bodyText: string): string | null {
  const subjectMatch = subject?.match(/[\w.-]+@[\w.-]+\.\w+/);
  if (subjectMatch) return subjectMatch[0];
  
  const bodyMatch = bodyText?.match(/[\w.-]+@[\w.-]+\.\w+/);
  return bodyMatch ? bodyMatch[0] : null;
}

function parseSylectusEmail(subject: string, bodyText: string): Record<string, any> {
  const data: Record<string, any> = {};
  
  // Extract broker email from subject
  data.broker_email = extractBrokerEmail(subject, bodyText);
  
  // Parse key fields
  const patterns: Record<string, RegExp> = {
    order_number: /Order\s*#?\s*:?\s*(\d+)/i,
    broker_name: /(?:Contact|Rep|Agent)[\s:]+([A-Za-z\s]+?)(?:\n|$)/i,
    broker_company: /(?:Company|Broker)[\s:]+([^\n]+)/i,
    broker_phone: /(?:Phone|Tel|Ph)[\s:]+([0-9\s\-\(\)\.]+)/i,
    origin_city: /(?:Origin|Pick\s*up|From)[\s:]+([A-Za-z\s]+),?\s*([A-Z]{2})/i,
    destination_city: /(?:Destination|Deliver|To)[\s:]+([A-Za-z\s]+),?\s*([A-Z]{2})/i,
    posted_amount: /Posted\s*Amount[\s:]*\$?([\d,]+(?:\.\d{2})?)/i,
    vehicle_type: /(?:Equipment|Vehicle|Truck)[\s:]+([^\n]+)/i,
    load_type: /(?:Load\s*Type|Type)[\s:]+([^\n]+)/i,
    pickup_date: /(?:Pick\s*up|Ready)[\s:]+(\d{1,2}\/\d{1,2}\/\d{2,4})/i,
  };

  for (const [key, pattern] of Object.entries(patterns)) {
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

  // Extract vehicle type for matching
  const vehicleTypes = ['CARGO VAN', 'SPRINTER', 'SMALL STRAIGHT', 'LARGE STRAIGHT', 'FLATBED', 'TRACTOR', 'VAN'];
  for (const vt of vehicleTypes) {
    if (bodyText?.toUpperCase().includes(vt)) {
      data.vehicle_type = vt;
      break;
    }
  }

  return data;
}

async function geocodeLocation(city: string, state: string): Promise<{lat: number, lng: number} | null> {
  const mapboxToken = Deno.env.get('VITE_MAPBOX_TOKEN');
  if (!mapboxToken || !city || !state) return null;

  try {
    const query = encodeURIComponent(`${city}, ${state}, USA`);
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxToken}&limit=1`
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data.features?.[0]?.center) {
        return { lng: data.features[0].center[0], lat: data.features[0].center[1] };
      }
    }
  } catch (e) {
    console.error('Geocoding error:', e);
  }
  return null;
}

// Improved parsing from subject line (like old gmail-webhook)
function parseSubjectLine(subject: string): Record<string, any> {
  const data: Record<string, any> = {};
  
  // Extract vehicle type, origin, destination from subject
  const subjectMatch = subject.match(/^([A-Z\s]+(?:VAN|STRAIGHT|SPRINTER|TRACTOR|FLATBED|REEFER)[A-Z\s]*)\s+(?:from|-)\s+([^,]+),\s*([A-Z]{2})\s+to\s+([^,]+),\s*([A-Z]{2})/i);
  if (subjectMatch) {
    data.vehicle_type = subjectMatch[1].trim().toUpperCase();
    data.origin_city = subjectMatch[2].trim();
    data.origin_state = subjectMatch[3].trim();
    data.destination_city = subjectMatch[4].trim();
    data.destination_state = subjectMatch[5].trim();
  }
  
  // Extract broker email from subject (in parentheses)
  const brokerEmailMatch = subject.match(/\(([a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,})\)/);
  if (brokerEmailMatch) {
    data.broker_email = brokerEmailMatch[1];
  }
  
  // Extract miles
  const milesMatch = subject.match(/:\s*(\d+)\s*miles/i);
  if (milesMatch) {
    data.loaded_miles = parseInt(milesMatch[1], 10);
  }
  
  // Extract weight
  const weightMatch = subject.match(/(\d+)\s*lbs/i);
  if (weightMatch) {
    data.weight = weightMatch[1];
  }
  
  // Extract customer/broker name
  const customerMatch = subject.match(/Posted by ([^(]+)\s*\(/);
  if (customerMatch) {
    data.customer = customerMatch[1].trim();
    data.broker_company = customerMatch[1].trim();
  }
  
  return data;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const startTime = Date.now();
  let processed = 0;
  let errors = 0;

  try {
    // Get pending queue items - limit to 5 for controlled processing
    const { data: queueItems, error: queueError } = await supabase
      .from('email_queue')
      .select('*')
      .eq('status', 'pending')
      .order('queued_at', { ascending: true })
      .limit(5);

    if (queueError) {
      console.error('Queue fetch error:', queueError);
      return new Response(JSON.stringify({ error: 'Queue fetch failed' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!queueItems?.length) {
      return new Response(JSON.stringify({ processed: 0, message: 'Queue empty' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    console.log(`📧 Processing ${queueItems.length} queued emails`);

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

    // Process each queued item sequentially (controlled rate)
    for (const item of queueItems) {
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
          // Already processed, mark complete
          await supabase
            .from('email_queue')
            .update({ status: 'completed', processed_at: new Date().toISOString() })
            .eq('id', item.id);
          processed++;
          continue;
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
        const dateHeader = getHeader('Date');
        const receivedAt = dateHeader ? new Date(dateHeader) : new Date();

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
        
        // Merge: prefer subject data, fill gaps from body
        const parsedData = { ...bodyData, ...subjectData };

        // Geocode if we have origin location
        if (parsedData.origin_city && parsedData.origin_state) {
          const coords = await geocodeLocation(parsedData.origin_city, parsedData.origin_state);
          if (coords) {
            parsedData.pickup_coordinates = coords;
          }
        }

        // Check for issues
        const hasIssues = !parsedData.broker_email || !parsedData.origin_city || !parsedData.vehicle_type;
        const issueNotes = [];
        if (!parsedData.broker_email) issueNotes.push('Missing broker email');
        if (!parsedData.origin_city) issueNotes.push('Missing origin location');
        if (!parsedData.vehicle_type) issueNotes.push('Missing vehicle type');

        // Extract sender info
        const fromMatch = from.match(/^(.+?)\s*<(.+?)>$/);
        const fromName = fromMatch ? fromMatch[1].trim() : from;
        const fromEmail = fromMatch ? fromMatch[2] : from;

        // Insert into load_emails - let database trigger generate load_id
        const { error: insertError } = await supabase
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
            status: 'new',
            has_issues: hasIssues,
            issue_notes: issueNotes.length > 0 ? issueNotes.join('; ') : null,
          }, { onConflict: 'email_id' });

        if (insertError) {
          throw insertError;
        }

        // Mark queue item as completed
        await supabase
          .from('email_queue')
          .update({ status: 'completed', processed_at: new Date().toISOString() })
          .eq('id', item.id);

        processed++;
        console.log(`✅ Processed: ${subject.substring(0, 50)}`);

      } catch (error) {
        console.error(`Error processing ${item.gmail_message_id}:`, error);
        errors++;
        
        // Mark as failed if too many attempts
        const newStatus = item.attempts >= 3 ? 'failed' : 'pending';
        await supabase
          .from('email_queue')
          .update({ 
            status: newStatus, 
            last_error: String(error),
          })
          .eq('id', item.id);
      }
    }

    const elapsed = Date.now() - startTime;
    console.log(`✅ Processed ${processed}, errors ${errors}, elapsed ${elapsed}ms`);

    return new Response(JSON.stringify({ processed, errors, elapsed }), {
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
