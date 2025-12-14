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
  
  // Extract stops from HTML table
  const stopsPattern = /<td>(\d+)<\/td>\s*<td>(Pick Up|Delivery)<\/td>\s*<td>([^<]+)<\/td>\s*<td>([A-Z]{2})<\/td>\s*<td>(\d{5})<\/td>\s*<td>USA<\/td>\s*<td>(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2})\s*(EST|CST|MST|PST|EDT|CDT|MDT|PDT)?/gi;
  const stops: Array<{type: string, city: string, state: string, zip: string, datetime: string, tz: string, sequence: number}> = [];
  let match;
  while ((match = stopsPattern.exec(bodyText)) !== null) {
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
  
  // Set origin from first pickup
  const firstPickup = stops.find(s => s.type === 'pick up');
  if (firstPickup) {
    data.origin_city = firstPickup.city;
    data.origin_state = firstPickup.state;
    data.origin_zip = firstPickup.zip;
    data.pickup_date = firstPickup.datetime.split(' ')[0];
    data.pickup_time = firstPickup.datetime.split(' ')[1] + ' ' + firstPickup.tz;
  }
  
  // Set destination from first delivery
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
  
  // Parse vehicle type - "Requested Vehicle Class:" or "We call this vehicle class:"
  const vehicleClassMatch = bodyText?.match(/(?:Requested Vehicle Class|We call this vehicle class):\s*([^<\n]+)/i);
  if (vehicleClassMatch) {
    data.vehicle_type = vehicleClassMatch[1].trim().toUpperCase();
  }
  
  // Also check from subject
  if (!data.vehicle_type) {
    const subjectVehicle = subject?.match(/^([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)\s+from/);
    if (subjectVehicle) {
      data.vehicle_type = subjectVehicle[1].toUpperCase();
    }
  }
  
  // Normalize common vehicle names
  if (data.vehicle_type) {
    const vehicleNormMap: Record<string, string> = {
      'SPRINTER VAN': 'SPRINTER',
      'CARGO VAN': 'CARGO VAN',
      'SMALL STRAIGHT TRUCK': 'SMALL STRAIGHT',
      'LARGE STRAIGHT TRUCK': 'LARGE STRAIGHT',
    };
    for (const [key, value] of Object.entries(vehicleNormMap)) {
      if (data.vehicle_type.includes(key)) {
        data.vehicle_type = value;
        break;
      }
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

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    // Find all emails that look like Full Circle TMS but are marked as sylectus
    const { data: emails, error: fetchError } = await supabase
      .from('load_emails')
      .select('id, subject, body_text, parsed_data, email_source')
      .or('body_text.ilike.%fullcircletms%,body_text.ilike.%Bid YES to this load%')
      .limit(100);

    if (fetchError) {
      throw fetchError;
    }

    console.log(`Found ${emails?.length || 0} potential Full Circle TMS emails to reparse`);

    let updated = 0;
    let customersCreated = 0;
    let customersUpdated = 0;

    for (const email of (emails || [])) {
      // Parse with FCTMS parser
      const parsedData = parseFullCircleTMSEmail(email.subject || '', email.body_text || '');
      
      // Update email with new parsed data and correct source
      const { error: updateError } = await supabase
        .from('load_emails')
        .update({
          parsed_data: { ...(email.parsed_data || {}), ...parsedData },
          email_source: 'fullcircle',
          expires_at: parsedData.expires_at || null,
        })
        .eq('id', email.id);

      if (updateError) {
        console.error(`Failed to update email ${email.id}:`, updateError);
        continue;
      }

      updated++;

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
