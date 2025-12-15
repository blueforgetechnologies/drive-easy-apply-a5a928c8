import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Parse Full Circle TMS email format
function parseFullCircleTMSEmail(subject: string, bodyText: string): Record<string, any> {
  const data: Record<string, any> = {};
  
  // First, parse origin/destination from subject line as reliable fallback
  // Subject format: "Sprinter Van from Whitehall, MI to Greer, SC - Expedite / Hot-Shot"
  const subjectRouteMatch = subject?.match(/from\s+([A-Za-z\s]+),\s*([A-Z]{2})\s+to\s+([A-Za-z\s]+),\s*([A-Z]{2})/i);
  if (subjectRouteMatch) {
    data.origin_city = subjectRouteMatch[1].trim();
    data.origin_state = subjectRouteMatch[2];
    data.destination_city = subjectRouteMatch[3].trim();
    data.destination_state = subjectRouteMatch[4];
    console.log(`📍 FCTMS: Parsed route from subject: ${data.origin_city}, ${data.origin_state} -> ${data.destination_city}, ${data.destination_state}`);
  }
  
  // Parse vehicle type from subject
  const vehicleSubjectMatch = subject?.match(/^([A-Za-z\s]+)\s+from\s+/i);
  if (vehicleSubjectMatch) {
    data.vehicle_type = vehicleSubjectMatch[1].trim();
  }
  
  // Order numbers - Full Circle uses format: ORDER NUMBER: 265637 or 4720340
  const orderMatch = bodyText?.match(/ORDER\s*NUMBER:?\s*(\d+)(?:\s+or\s+(\d+))?/i);
  if (orderMatch) {
    data.order_number = orderMatch[1];
    if (orderMatch[2]) {
      data.order_number_secondary = orderMatch[2];
    }
  }
  
  // Also check for "please reference" format
  if (!data.order_number) {
    const refMatch = bodyText?.match(/reference our ORDER NUMBER:?\s*(\d+)(?:\s+or\s+(\d+))?/i);
    if (refMatch) {
      data.order_number = refMatch[1];
      if (refMatch[2]) {
        data.order_number_secondary = refMatch[2];
      }
    }
  }
  
  // Extract stops from HTML table - Full Circle uses <td> tags
  const htmlStopsPattern = /<td[^>]*>(\d+)<\/td>\s*<td[^>]*>(Pick Up|Delivery)<\/td>\s*<td[^>]*>([^<]+)<\/td>\s*<td[^>]*>([A-Z]{2})<\/td>\s*<td[^>]*>(\d{5})<\/td>\s*<td[^>]*>USA<\/td>\s*<td[^>]*>(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?<\/td>/gi;
  const stops: Array<{type: string, city: string, state: string, zip: string, datetime: string, tz: string, sequence: number}> = [];
  let match;
  while ((match = htmlStopsPattern.exec(bodyText)) !== null) {
    stops.push({
      sequence: parseInt(match[1]),
      type: match[2].toLowerCase(),
      city: match[3].trim(),
      state: match[4],
      zip: match[5],
      datetime: match[6],
      tz: match[7] || 'EST'
    });
  }
  
  // Also try plain text format as fallback
  if (stops.length === 0) {
    const plainStopsPattern = /(\d+)\s+(Pick Up|Delivery)\s+([A-Za-z\s]+)\s+([A-Z]{2})\s+(\d{5})\s+USA\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s+(EST|CST|MST|PST|EDT|CDT|MDT|PDT)/gi;
    while ((match = plainStopsPattern.exec(bodyText)) !== null) {
      stops.push({
        sequence: parseInt(match[1]),
        type: match[2].toLowerCase(),
        city: match[3].trim(),
        state: match[4],
        zip: match[5],
        datetime: match[6],
        tz: match[7]
      });
    }
  }
  
  // Set origin from first pickup (overrides subject if found)
  const firstPickup = stops.find(s => s.type === 'pick up');
  if (firstPickup) {
    data.origin_city = firstPickup.city;
    data.origin_state = firstPickup.state;
    data.origin_zip = firstPickup.zip;
    data.pickup_date = firstPickup.datetime.split(' ')[0];
    data.pickup_time = firstPickup.datetime.split(' ')[1] + ' ' + firstPickup.tz;
  }
  
  // Set destination from first delivery (overrides subject if found)
  const firstDelivery = stops.find(s => s.type === 'delivery');
  if (firstDelivery) {
    data.destination_city = firstDelivery.city;
    data.destination_state = firstDelivery.state;
    data.destination_zip = firstDelivery.zip;
    data.delivery_date = firstDelivery.datetime.split(' ')[0];
    data.delivery_time = firstDelivery.datetime.split(' ')[1] + ' ' + firstDelivery.tz;
  }
  
  // Store all stops for multi-stop loads
  if (stops.length > 0) {
    data.stops = stops;
    data.stop_count = stops.length;
    data.has_multiple_stops = stops.length > 2;
    console.log(`📍 FCTMS: Parsed ${stops.length} stops from HTML table`);
  }
  
  // Parse expiration - format: 2025-12-14 10:51 EST (UTC-0500) or just 2025-12-14 10:51 EST
  const expiresMatch = bodyText?.match(/This posting expires:\s*(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2})\s+(EST|CST|MST|PST|EDT|CDT|MDT|PDT)(?:\s*\(UTC([+-]\d{4})\))?/i);
  if (expiresMatch) {
    const dateStr = expiresMatch[1];
    const timeStr = expiresMatch[2];
    const timezone = expiresMatch[3];
    
    data.expires_datetime = `${dateStr} ${timeStr} ${timezone}`;
    
    // Convert to ISO - timezone offsets
    try {
      const tzOffsets: Record<string, number> = {
        'EST': -5, 'EDT': -4, 'CST': -6, 'CDT': -5,
        'MST': -7, 'MDT': -6, 'PST': -8, 'PDT': -7
      };
      const offset = tzOffsets[timezone.toUpperCase()] || -5;
      
      const [year, month, day] = dateStr.split('-').map(Number);
      const [hours, minutes] = timeStr.split(':').map(Number);
      
      const expiresDate = new Date(Date.UTC(year, month - 1, day, hours - offset, minutes, 0));
      if (!isNaN(expiresDate.getTime())) {
        data.expires_at = expiresDate.toISOString();
        console.log(`📅 FCTMS expiration: ${data.expires_datetime} -> ${data.expires_at}`);
      }
    } catch (e) {
      console.error('Error parsing FCTMS expiration:', e);
    }
  }
  
  // Parse pieces and weight from notes - look for "Total Pieces: X" and "Total Weight: X"
  const notesMatch = bodyText?.match(/Notes:([^<]+)/i);
  if (notesMatch) {
    const notesText = notesMatch[1];
    const notesPiecesMatch = notesText.match(/Total Pieces:?\s*(\d+)/i);
    if (notesPiecesMatch) {
      data.pieces = parseInt(notesPiecesMatch[1]);
    }
    const notesWeightMatch = notesText.match(/Total Weight:?\s*([\d,]+)/i);
    if (notesWeightMatch) {
      data.weight = notesWeightMatch[1].replace(',', '');
    }
  }
  
  // Also try standalone patterns
  if (!data.pieces) {
    const totalPiecesMatch = bodyText?.match(/<b>Total Pieces:<\/b>\s*(\d+)|Total Pieces:?\s*(\d+)/i);
    if (totalPiecesMatch) {
      data.pieces = parseInt(totalPiecesMatch[1] || totalPiecesMatch[2]);
    }
  }
  
  if (!data.weight) {
    const totalWeightMatch = bodyText?.match(/<b>Total Weight:<\/b>\s*([\d,]+)|Total Weight:?\s*([\d,]+)\s*lbs?/i);
    if (totalWeightMatch) {
      data.weight = (totalWeightMatch[1] || totalWeightMatch[2]).replace(',', '');
    }
  }
  
  // Parse distance
  const distanceMatch = bodyText?.match(/<b>Distance:<\/b>\s*([\d,]+)\s*mi|Distance:?\s*([\d,]+)\s*mi/i);
  if (distanceMatch) {
    data.loaded_miles = parseInt((distanceMatch[1] || distanceMatch[2]).replace(',', ''));
  }
  
  // Parse vehicle type from body - "Requested Vehicle Class:" or "We call this vehicle class:"
  if (!data.vehicle_type) {
    const vehicleClassMatch = bodyText?.match(/(?:Requested Vehicle Class|We call this vehicle class):\s*([^<\n]+)/i);
    if (vehicleClassMatch) {
      data.vehicle_type = vehicleClassMatch[1].trim();
    }
  }
  
  // Parse dock level, hazmat, team requirements
  const dockLevelMatch = bodyText?.match(/Dock Level.*?:\s*(Yes|No)/i);
  if (dockLevelMatch) {
    data.dock_level = dockLevelMatch[1].toLowerCase() === 'yes';
  }
  
  const hazmatMatch = bodyText?.match(/Hazardous\??\s*:?\s*(Yes|No)/i);
  if (hazmatMatch) {
    data.hazmat = hazmatMatch[1].toLowerCase() === 'yes';
  }
  
  const teamMatch = bodyText?.match(/Driver TEAM.*?:\s*(Yes|No)/i);
  if (teamMatch) {
    data.team_required = teamMatch[1].toLowerCase() === 'yes';
  }
  
  // Parse broker company with MC# - look for it in the contact section
  const brokerCompanyMCMatch = bodyText?.match(/please contact:[\s\S]*?<b>([^<]+)<\/b>(?:\s*\(MC#\s*(\d+)\))?/i);
  if (brokerCompanyMCMatch) {
    data.broker_company = brokerCompanyMCMatch[1].trim();
    if (brokerCompanyMCMatch[2]) {
      data.mc_number = brokerCompanyMCMatch[2];
    }
  }
  
  // Also look for MC# in standalone format
  if (!data.mc_number) {
    const mcMatch = bodyText?.match(/\(MC#\s*(\d+)\)/i);
    if (mcMatch) {
      data.mc_number = mcMatch[1];
    }
  }
  
  // Parse company name from contact section if not found
  if (!data.broker_company) {
    const companyMatch = bodyText?.match(/please contact:[\s\S]*?<br\s*\/?>\s*([^<\n]+)/i);
    if (companyMatch) {
      data.broker_company = companyMatch[1].trim().replace(/\(MC#.*$/, '').trim();
    }
  }
  
  // Parse posted by / contact info
  const postedByMatch = bodyText?.match(/Load posted by:\s*([^<\n]+)/i);
  if (postedByMatch) {
    data.broker_name = postedByMatch[1].trim();
  }
  
  const phoneMatch = bodyText?.match(/Phone:\s*\(?([\d\-\(\)\s]+)/i);
  if (phoneMatch) {
    data.broker_phone = phoneMatch[1].trim();
  }
  
  const faxMatch = bodyText?.match(/Fax:\s*\(?([\d\-\(\)\s]+)/i);
  if (faxMatch) {
    data.broker_fax = faxMatch[1].trim();
  }
  
  // Parse dimensions from the dimensions table
  const dimensionsMatch = bodyText?.match(/(\d+)\s+to\s+\d+<\/td>\s*<td>(\d+)<\/td>\s*<td>([\d,]+)\s*lbs?<\/td>\s*<td>(\d+)\s*in<\/td>\s*<td>(\d+)\s*in<\/td>\s*<td>(\d+)\s*in<\/td>\s*<td>(Yes|No)/i);
  if (dimensionsMatch) {
    data.dimensions = `${dimensionsMatch[4]}x${dimensionsMatch[5]}x${dimensionsMatch[6]}`;
    data.stackable = dimensionsMatch[7].toLowerCase() === 'yes';
    // Use these as primary if not set
    if (!data.pieces) data.pieces = parseInt(dimensionsMatch[2]);
    if (!data.weight) data.weight = dimensionsMatch[3].replace(',', '');
  }
  
  // Fallback: parse subject for origin/destination - "Load Available: MI - PA"
  if (!data.origin_state || !data.destination_state) {
    const subjectStatesMatch = subject?.match(/Load Available:\s*([A-Z]{2})\s*-\s*([A-Z]{2})/i);
    if (subjectStatesMatch) {
      if (!data.origin_state) data.origin_state = subjectStatesMatch[1].toUpperCase();
      if (!data.destination_state) data.destination_state = subjectStatesMatch[2].toUpperCase();
    }
  }
  
  console.log(`📦 FCTMS parsed: Order ${data.order_number}${data.order_number_secondary ? '/' + data.order_number_secondary : ''}, ${data.origin_city || data.origin_state} -> ${data.destination_city || data.destination_state}, ${data.vehicle_type}, ${data.pieces} pcs, ${data.weight} lbs, expires ${data.expires_at}, MC# ${data.mc_number}`);
  
  return data;
}

// Geocode location using Mapbox with cache
async function geocodeLocation(city: string, state: string): Promise<{lat: number, lng: number} | null> {
  const mapboxToken = Deno.env.get('VITE_MAPBOX_TOKEN');
  if (!mapboxToken || !city || !state) return null;

  const locationKey = `${city.toLowerCase().trim()}, ${state.toLowerCase().trim()}`;

  try {
    // Check cache first
    const { data: cached } = await supabase
      .from('geocode_cache')
      .select('latitude, longitude, id, hit_count')
      .eq('location_key', locationKey)
      .maybeSingle();

    if (cached) {
      supabase
        .from('geocode_cache')
        .update({ hit_count: (cached.hit_count || 1) + 1 })
        .eq('id', cached.id)
        .then(() => {});
      
      console.log(`📍 Cache HIT: ${city}, ${state}`);
      return { lat: Number(cached.latitude), lng: Number(cached.longitude) };
    }

    // Cache miss - call Mapbox API
    const query = encodeURIComponent(`${city}, ${state}, USA`);
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${mapboxToken}&limit=1`
    );
    
    if (response.ok) {
      const data = await response.json();
      if (data.features?.[0]?.center) {
        const coords = { lng: data.features[0].center[0], lat: data.features[0].center[1] };
        
        // Store in cache
        const currentMonth = new Date().toISOString().slice(0, 7);
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

// Match load to active hunt plans
async function matchLoadToHunts(loadEmailId: string, parsedData: any) {
  const { data: enabledHunts } = await supabase
    .from('hunt_plans')
    .select('id, vehicle_id, hunt_coordinates, pickup_radius, vehicle_size')
    .eq('enabled', true);

  if (!enabledHunts?.length) return 0;

  const loadCoords = parsedData.pickup_coordinates;
  if (!loadCoords) return 0;
  
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

  let matchesCreated = 0;

  for (const hunt of enabledHunts) {
    const huntCoords = hunt.hunt_coordinates as { lat: number; lng: number } | null;
    if (!huntCoords?.lat || !huntCoords?.lng) continue;

    const distance = haversineDistance(loadCoords.lat, loadCoords.lng, huntCoords.lat, huntCoords.lng);
    if (distance > parseFloat(hunt.pickup_radius || '200')) continue;

    // Parse vehicle_sizes as JSON array
    let huntVehicleSizes: string[] = [];
    if (hunt.vehicle_size) {
      try {
        const parsed = JSON.parse(hunt.vehicle_size);
        huntVehicleSizes = Array.isArray(parsed) ? parsed : [hunt.vehicle_size];
      } catch {
        huntVehicleSizes = [hunt.vehicle_size];
      }
    }
    
    // Check vehicle type match
    if (huntVehicleSizes.length > 0 && loadVehicleType) {
      const loadTypeNormalized = loadVehicleType.toLowerCase().replace(/[^a-z-]/g, '');
      const vehicleMatches = huntVehicleSizes.some(huntSize => {
        const huntNormalized = huntSize.toLowerCase().replace(/[^a-z-]/g, '');
        return loadTypeNormalized === huntNormalized ||
          loadTypeNormalized.includes(huntNormalized) || 
          huntNormalized.includes(loadTypeNormalized) ||
          (loadTypeNormalized.includes('cargo') && huntNormalized.includes('cargo')) ||
          (loadTypeNormalized.includes('sprinter') && huntNormalized.includes('sprinter')) ||
          (loadTypeNormalized.includes('straight') && huntNormalized.includes('straight'));
      });
      if (!vehicleMatches) continue;
    }

    // Check if match already exists
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
    matchesCreated++;
  }
  
  return matchesCreated;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Find all Full Circle TMS emails that need geocoding (missing pickup_coordinates)
    const { data: emails, error: fetchError } = await supabase
      .from('load_emails')
      .select('id, subject, body_text, parsed_data, email_source')
      .eq('email_source', 'fullcircle')
      .limit(500);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${emails?.length || 0} Full Circle TMS emails to reparse`);

    let updated = 0;
    let geocoded = 0;
    let matchesCreated = 0;
    let customersCreated = 0;
    let customersUpdated = 0;

    for (const email of (emails || [])) {
      // Re-parse with updated FCTMS parser
      const parsedData = parseFullCircleTMSEmail(email.subject || '', email.body_text || '');
      
      // Check if we need to geocode
      const existingCoords = email.parsed_data?.pickup_coordinates;
      if (!existingCoords && parsedData.origin_city && parsedData.origin_state) {
        const coords = await geocodeLocation(parsedData.origin_city, parsedData.origin_state);
        if (coords) {
          parsedData.pickup_coordinates = coords;
          geocoded++;
          console.log(`📍 Geocoded: ${parsedData.origin_city}, ${parsedData.origin_state}`);
        }
      } else if (existingCoords) {
        parsedData.pickup_coordinates = existingCoords;
      }
      
      // Merge with existing parsed_data
      const mergedData = { ...(email.parsed_data || {}), ...parsedData };
      
      // Update email
      const { error: updateError } = await supabase
        .from('load_emails')
        .update({
          parsed_data: mergedData,
          email_source: 'fullcircle',
          expires_at: parsedData.expires_at || email.parsed_data?.expires_at || null,
        })
        .eq('id', email.id);

      if (updateError) {
        console.error(`Failed to update email ${email.id}:`, updateError);
        continue;
      }

      updated++;

      // Run hunt matching if we have coordinates
      if (parsedData.pickup_coordinates && parsedData.vehicle_type) {
        const matches = await matchLoadToHunts(email.id, parsedData);
        matchesCreated += matches;
      }

      // Create/update customer with MC# if broker_company is present
      if (parsedData.broker_company) {
        const customerName = parsedData.broker_company;
        
        const { data: existingCustomer } = await supabase
          .from('customers')
          .select('id, mc_number')
          .ilike('name', customerName)
          .maybeSingle();
        
        if (existingCustomer) {
          if (!existingCustomer.mc_number && parsedData.mc_number) {
            await supabase
              .from('customers')
              .update({ mc_number: parsedData.mc_number })
              .eq('id', existingCustomer.id);
            customersUpdated++;
          }
        } else {
          await supabase
            .from('customers')
            .insert({
              name: customerName,
              mc_number: parsedData.mc_number || null,
              contact_name: parsedData.broker_name || null,
              phone: parsedData.broker_phone || null,
            });
          customersCreated++;
        }
      }
    }

    return new Response(JSON.stringify({
      success: true,
      found: emails?.length || 0,
      updated,
      geocoded,
      matchesCreated,
      customersCreated,
      customersUpdated,
    }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Error:', error);
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
