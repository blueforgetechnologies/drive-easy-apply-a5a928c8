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

  // Parse expiration datetime from "Expiration" or "Expires" section
  const expirationMatch = bodyText?.match(/(?:Expiration|Expires?)[:\s]+(\d{1,2}\/\d{1,2}\/\d{2,4})\s+(\d{1,2}:\d{2})\s*(AM|PM)?\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/i);
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
      
      // Handle AM/PM
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

    // Get pending queue items - ONLY newer than checkpoint, limit to 20
    const { data: queueItems, error: queueError } = await supabase
      .from('email_queue')
      .select('*')
      .eq('status', 'pending')
      .gt('queued_at', checkpointReceivedAt) // Only items NEWER than checkpoint
      .order('queued_at', { ascending: true }) // Process oldest first (moving forward in time)
      .limit(20);

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

    // Process each queued item sequentially
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
          // Already processed, mark complete and update checkpoint
          await supabase
            .from('email_queue')
            .update({ status: 'completed', processed_at: new Date().toISOString() })
            .eq('id', item.id);
          processed++;
          lastProcessedReceivedAt = item.queued_at;
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
          .select('load_id, received_at')
          .single();

        if (insertError) {
          throw insertError;
        }

        // Mark queue item as completed
        await supabase
          .from('email_queue')
          .update({ status: 'completed', processed_at: new Date().toISOString() })
          .eq('id', item.id);

        processed++;
        lastProcessedReceivedAt = item.queued_at;
        if (insertedEmail?.load_id) {
          lastProcessedLoadId = insertedEmail.load_id;
        }
        
        console.log(`✅ Processed: ${subject.substring(0, 50)} -> ${lastProcessedLoadId}`);

      } catch (error) {
        console.error(`Error processing ${item.gmail_message_id}:`, error);
        errors++;
        
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
