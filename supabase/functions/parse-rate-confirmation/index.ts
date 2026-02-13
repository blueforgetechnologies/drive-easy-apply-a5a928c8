import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { assertFeatureEnabled } from '../_shared/assertFeatureEnabled.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    
    // Feature gate FIRST - derive tenant from auth, check ai_parsing_enabled
    const gateResult = await assertFeatureEnabled({
      flag_key: 'ai_parsing_enabled',
      authHeader,
    });
    
    if (!gateResult.allowed) {
      console.log(`[parse-rate-confirmation] Feature disabled: ${gateResult.reason}`);
      return gateResult.response!;
    }

    // Parse request body after gate passes
    const { documentBase64, fileName, mimeType } = await req.json();

    if (!documentBase64) {
      return new Response(
        JSON.stringify({ success: false, error: 'Document content is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[parse-rate-confirmation] Processing for tenant ${gateResult.tenant_id}, user ${gateResult.user_id}`);

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Parsing rate confirmation:', fileName, mimeType);

    const systemPrompt = `You are an expert at extracting structured data from rate confirmation documents used in freight and trucking.

Extract ALL available information from the document. Be thorough and extract every field you can find.

IMPORTANT FIELD MAPPINGS:
- "Shipper" = Origin/Pickup location  
- "Receiver" or "Consignee" = Destination/Delivery location

CRITICAL - BROKER/CUSTOMER vs CARRIER DISTINCTION (READ THIS CAREFULLY):
There are TWO separate entities in a rate confirmation:
1. BROKER/CUSTOMER = The company hiring you to haul freight (e.g., "WORLDWIDE EXPRESS", "GlobalTranz")
   - Usually at the TOP of the document
   - Has fields like "Arranged by", "Broker Contact", or just a company header with contact info
   - Their MC# and DOT# go in customer_mc_number and customer_dot_number
   
2. CARRIER = YOUR trucking company doing the hauling (e.g., "TALBI LOGISTICS LLC")
   - Usually in a section labeled "CARRIER" or "CARRIER INFORMATION"
   - Has fields like "Carrier MC#", "Carrier DOT#", "Carrier Name"
   - DO NOT extract carrier MC# or DOT# for customer fields - they belong to a DIFFERENT company!

CRITICAL RULE: If an MC# or DOT# appears next to the word "CARRIER" or in a "CARRIER" section, it belongs to the trucking company, NOT the broker/customer. Leave customer_mc_number and customer_dot_number as NULL if you only find MC/DOT in the carrier section.

Example: If document shows "CARRIER: TALBI LOGISTICS LLC, MC# 827893" - this is the carrier's MC, NOT customer_mc_number. Set customer_mc_number = null.

- "Arranged by" or "Broker Contact" = This is the CUSTOMER/BROKER contact person - extract as customer_contact
- Look for email addresses near "Arranged by" or "E-Mail" labels - extract as customer_email

CRITICAL - BILLING PARTY EXTRACTION:
- Look for a separate "Bill To", "Billing Party", "Invoice To", "Remit To", or "Payment" section
- This is who should receive the invoice - may be different from the broker/customer
- If no explicit billing party is found, the billing party fields should be left null (the system will default to using broker info)
- Common labels: "Bill To:", "Invoice To:", "Billing Address:", "Payment Address:", "Remit To:"
- The billing party may have different address/contact than the broker

CRITICAL - CUSTOMER LOAD ID EXTRACTION:
- The customer_load_id is the MOST IMPORTANT identifier - look for it PROMINENTLY in the document
- IT OFTEN APPEARS IN THE DOCUMENT TITLE like "Carrier Confirmation C539792" or "Rate Confirmation #12345"
- The number right after the title IS the customer_load_id (e.g., "C539792" from "Carrier Confirmation C539792")
- Other common labels: "PRO #", "Pro#", "Order #", "Order#", "Reference #", "Ref#", "Load #", "Confirmation #", "BOL #", "PO #", "Trip #", "Shipment #", "PROBILL #"
- May appear multiple times - prioritize the one in the document title/header
- Examples: 
  - "Carrier Confirmation C539792" → customer_load_id = "C539792"
  - "PRO # 1134288" → customer_load_id = "1134288"
  - "Rate Confirmation #RC-45678" → customer_load_id = "RC-45678"
- PROBILL # is often a secondary reference number - capture as reference_number if different from customer_load_id
- Miles may appear as: loaded miles, estimated miles, trip miles, total miles
- Pieces may appear as: pieces, pallets, skids, units, qty

MULTI-STOP HANDLING:
- Look for multiple pickup locations (origins, shippers) - may be numbered stops like Stop 1, Stop 2
- Look for multiple delivery locations (destinations, receivers, consignees)
- Each stop should capture: name, address, city, state, zip, contact info, date, time, reference numbers

VEHICLE REQUIREMENTS:
- Extract equipment/vehicle type: dry van, reefer, flatbed, step deck, box truck, sprinter, conestoga, lowboy, etc.
- Extract vehicle size if mentioned: 53', 48', 26', or dimensions like length/height requirements
- Note any special requirements: team required, hazmat, temperature control, tarps, chains, etc.

Extraction format guidelines:
- Extract dates in YYYY-MM-DD format
- Extract times in HH:MM format (24-hour)
- Extract rates/amounts as numbers without currency symbols
- For addresses, extract each component separately (street, city, state, zip)
- If a field is not found, leave it as null`;

    const userPrompt = `Extract all load information from this rate confirmation document. The document is named "${fileName}".

Include:
1. Customer/broker company name, address, MC#, DOT#, contact info
2. Load identification numbers (their reference #, Pro#, Order#, etc.)
3. Rate and any additional charges
4. Miles (loaded miles)
5. Pieces/pallets count  
6. ALL pickup stops (origins/shippers) with full address, contact, dates/times
7. ALL delivery stops (destinations/receivers/consignees) with full address, contact, dates/times
8. Vehicle/equipment type and size requirements
9. Cargo description, weight, dimensions
10. Any special instructions or notes

CRITICAL: If there are multiple pickups or deliveries, capture EACH as a separate stop in the stops array.`;

    // Build the message content based on mime type
    let messageContent: any[];
    
    if (mimeType.startsWith('image/')) {
      messageContent = [
        { type: 'text', text: userPrompt },
        { 
          type: 'image_url', 
          image_url: { 
            url: `data:${mimeType};base64,${documentBase64}` 
          } 
        }
      ];
    } else if (mimeType === 'application/pdf') {
      messageContent = [
        { type: 'text', text: userPrompt },
        { 
          type: 'image_url', 
          image_url: { 
            url: `data:${mimeType};base64,${documentBase64}` 
          } 
        }
      ];
    } else {
      messageContent = [{ type: 'text', text: userPrompt }];
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: messageContent }
        ],
        tools: [
          {
            type: 'function',
            function: {
              name: 'extract_load_data',
              description: 'Extract structured load data from a rate confirmation document',
              parameters: {
                type: 'object',
                properties: {
                  // Customer/Broker info
                  customer_load_id: { type: 'string', description: 'Customer/broker load ID (Pro#, Order#, Reference#, etc.)' },
                  rate: { type: 'number', description: 'Rate amount in dollars' },
                  customer_name: { type: 'string', description: 'Customer/broker company name' },
                  customer_address: { type: 'string', description: 'Customer/broker street address' },
                  customer_city: { type: 'string', description: 'Customer/broker city' },
                  customer_state: { type: 'string', description: 'Customer/broker state' },
                  customer_zip: { type: 'string', description: 'Customer/broker zip code' },
                  customer_mc_number: { type: 'string', description: 'Customer/broker MC#' },
                  customer_dot_number: { type: 'string', description: 'Customer/broker DOT#' },
                  customer_email: { type: 'string', description: 'Customer contact email' },
                  customer_phone: { type: 'string', description: 'Customer contact phone' },
                  customer_contact: { type: 'string', description: 'Customer contact person name' },
                  reference_number: { type: 'string', description: 'PO number or secondary reference' },
                  
                  // Billing Party info (who to invoice - may be different from broker)
                  billing_party_name: { type: 'string', description: 'Billing party company name (from Bill To or Invoice To section)' },
                  billing_party_address: { type: 'string', description: 'Billing party street address' },
                  billing_party_city: { type: 'string', description: 'Billing party city' },
                  billing_party_state: { type: 'string', description: 'Billing party state' },
                  billing_party_zip: { type: 'string', description: 'Billing party zip code' },
                  billing_party_contact: { type: 'string', description: 'Billing party contact person name' },
                  billing_party_phone: { type: 'string', description: 'Billing party phone' },
                  billing_party_email: { type: 'string', description: 'Billing party email' },
                  
                  // Cargo info
                  cargo_description: { type: 'string', description: 'Cargo/commodity description' },
                  cargo_weight: { type: 'number', description: 'Weight in pounds' },
                  cargo_pieces: { type: 'number', description: 'Number of pieces/pallets' },
                  cargo_dimensions: { type: 'string', description: 'Cargo dimensions (L x W x H)' },
                  estimated_miles: { type: 'number', description: 'Total trip miles' },
                  
                  // Vehicle requirements
                  equipment_type: { type: 'string', description: 'Equipment type: dry_van, reefer, flatbed, step_deck, box_truck, sprinter, etc.' },
                  vehicle_size: { type: 'string', description: 'Vehicle size: 53ft, 48ft, 26ft, etc.' },
                  temperature_required: { type: 'string', description: 'Required temperature if reefer load' },
                  team_required: { type: 'boolean', description: 'Whether team drivers are required' },
                  hazmat: { type: 'boolean', description: 'Whether this is a hazmat load' },
                  
                  // Multi-stop array
                  stops: {
                    type: 'array',
                    description: 'Array of all pickup and delivery stops in order',
                    items: {
                      type: 'object',
                      properties: {
                        stop_type: { type: 'string', enum: ['pickup', 'delivery'], description: 'Whether this is a pickup or delivery stop' },
                        stop_sequence: { type: 'number', description: 'Order of this stop (1, 2, 3...)' },
                        location_name: { type: 'string', description: 'Company/facility name at this stop' },
                        location_address: { type: 'string', description: 'Street address' },
                        location_city: { type: 'string', description: 'City' },
                        location_state: { type: 'string', description: 'State (2-letter)' },
                        location_zip: { type: 'string', description: 'ZIP code' },
                        contact_name: { type: 'string', description: 'Contact person at this stop' },
                        contact_phone: { type: 'string', description: 'Contact phone number' },
                        contact_email: { type: 'string', description: 'Contact email' },
                        scheduled_date: { type: 'string', description: 'Scheduled date (YYYY-MM-DD format)' },
                        scheduled_time: { type: 'string', description: 'Scheduled time or time window' },
                        reference_numbers: { type: 'string', description: 'Reference/PO numbers for this stop' },
                        notes: { type: 'string', description: 'Special instructions for this stop' }
                      },
                      required: ['stop_type', 'stop_sequence']
                    }
                  },
                  
                  // Legacy single stop fields (backwards compatibility)
                  shipper_name: { type: 'string', description: 'Primary shipper company name' },
                  shipper_address: { type: 'string', description: 'Primary pickup street address' },
                  shipper_city: { type: 'string', description: 'Primary pickup city' },
                  shipper_state: { type: 'string', description: 'Primary pickup state' },
                  shipper_zip: { type: 'string', description: 'Primary pickup zip code' },
                  shipper_contact: { type: 'string', description: 'Primary pickup contact name' },
                  shipper_phone: { type: 'string', description: 'Primary pickup phone' },
                  shipper_email: { type: 'string', description: 'Primary pickup email' },
                  pickup_date: { type: 'string', description: 'Primary pickup date in YYYY-MM-DD format' },
                  pickup_time: { type: 'string', description: 'Primary pickup time in HH:MM format' },
                  receiver_name: { type: 'string', description: 'Primary receiver company name' },
                  receiver_address: { type: 'string', description: 'Primary delivery street address' },
                  receiver_city: { type: 'string', description: 'Primary delivery city' },
                  receiver_state: { type: 'string', description: 'Primary delivery state' },
                  receiver_zip: { type: 'string', description: 'Primary delivery zip code' },
                  receiver_contact: { type: 'string', description: 'Primary delivery contact name' },
                  receiver_phone: { type: 'string', description: 'Primary delivery phone' },
                  receiver_email: { type: 'string', description: 'Primary delivery email' },
                  delivery_date: { type: 'string', description: 'Primary delivery date in YYYY-MM-DD format' },
                  delivery_time: { type: 'string', description: 'Primary delivery time in HH:MM format' },
                  
                  special_instructions: { type: 'string', description: 'Special instructions or notes' }
                },
                required: []
              }
            }
          }
        ],
        tool_choice: { type: 'function', function: { name: 'extract_load_data' } }
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI gateway error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ success: false, error: 'Rate limit exceeded. Please try again in a moment.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ success: false, error: 'AI credits exhausted. Please add funds to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const data = await response.json();
    console.log('AI response received');

    // Extract the tool call result
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'extract_load_data') {
      throw new Error('No valid extraction result from AI');
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    
    // Log full extraction for debugging
    console.log('Raw extraction result:', JSON.stringify({
      customer_name: extractedData.customer_name,
      customer_contact: extractedData.customer_contact,
      customer_phone: extractedData.customer_phone,
      customer_email: extractedData.customer_email,
      billing_party_name: extractedData.billing_party_name,
      billing_party_contact: extractedData.billing_party_contact,
      billing_party_phone: extractedData.billing_party_phone,
      billing_party_email: extractedData.billing_party_email,
    }));
    
    // FALLBACK: If customer/broker fields are empty but billing party has data,
    // use billing party as the customer (common pattern in rate confirmations)
    if (!extractedData.customer_name && extractedData.billing_party_name) {
      console.log('Using billing party as customer (no separate customer found)');
      extractedData.customer_name = extractedData.billing_party_name;
      extractedData.customer_contact = extractedData.customer_contact || extractedData.billing_party_contact;
      extractedData.customer_phone = extractedData.customer_phone || extractedData.billing_party_phone;
      extractedData.customer_email = extractedData.customer_email || extractedData.billing_party_email;
      extractedData.customer_address = extractedData.customer_address || extractedData.billing_party_address;
      extractedData.customer_city = extractedData.customer_city || extractedData.billing_party_city;
      extractedData.customer_state = extractedData.customer_state || extractedData.billing_party_state;
      extractedData.customer_zip = extractedData.customer_zip || extractedData.billing_party_zip;
    }
    
    // Normalize equipment_type to match select options
    if (extractedData.equipment_type) {
      const eqMap: Record<string, string> = {
        'dry van': 'dry_van', 'dryvan': 'dry_van', 'van': 'dry_van', 'd-st': 'dry_van', 'dry_van': 'dry_van',
        'reefer': 'reefer', 'refrigerated': 'reefer', 'temp_control': 'reefer',
        'flatbed': 'flatbed', 'flat bed': 'flatbed', 'flat': 'flatbed',
        'step deck': 'step_deck', 'stepdeck': 'step_deck', 'step_deck': 'step_deck',
        'box truck': 'box_truck', 'boxtruck': 'box_truck', 'box_truck': 'box_truck', 'straight truck': 'box_truck',
        'sprinter': 'sprinter', 'cargo van': 'sprinter',
        'conestoga': 'conestoga',
        'lowboy': 'lowboy', 'low boy': 'lowboy',
      };
      const normalized = eqMap[extractedData.equipment_type.toLowerCase().trim()];
      if (normalized) {
        extractedData.equipment_type = normalized;
      }
    }
    
    // Ensure stops array exists and populate from legacy fields if needed
    if (!extractedData.stops || extractedData.stops.length === 0) {
      extractedData.stops = [];
      
      // Create pickup stop from legacy shipper fields
      if (extractedData.shipper_name || extractedData.shipper_city) {
        extractedData.stops.push({
          stop_type: 'pickup',
          stop_sequence: 1,
          location_name: extractedData.shipper_name,
          location_address: extractedData.shipper_address,
          location_city: extractedData.shipper_city,
          location_state: extractedData.shipper_state,
          location_zip: extractedData.shipper_zip,
          contact_name: extractedData.shipper_contact,
          contact_phone: extractedData.shipper_phone,
          contact_email: extractedData.shipper_email,
          scheduled_date: extractedData.pickup_date,
          scheduled_time: extractedData.pickup_time
        });
      }
      
      // Create delivery stop from legacy receiver fields
      if (extractedData.receiver_name || extractedData.receiver_city) {
        extractedData.stops.push({
          stop_type: 'delivery',
          stop_sequence: 2,
          location_name: extractedData.receiver_name,
          location_address: extractedData.receiver_address,
          location_city: extractedData.receiver_city,
          location_state: extractedData.receiver_state,
          location_zip: extractedData.receiver_zip,
          contact_name: extractedData.receiver_contact,
          contact_phone: extractedData.receiver_phone,
          contact_email: extractedData.receiver_email,
          scheduled_date: extractedData.delivery_date,
          scheduled_time: extractedData.delivery_time
        });
      }
    }
    
    // Also populate legacy fields from stops for backwards compatibility
    if (extractedData.stops && extractedData.stops.length > 0) {
      const pickupStop = extractedData.stops.find((s: any) => s.stop_type === 'pickup');
      const deliveryStop = extractedData.stops.find((s: any) => s.stop_type === 'delivery');
      
      if (pickupStop) {
        extractedData.shipper_name = extractedData.shipper_name || pickupStop.location_name;
        extractedData.shipper_address = extractedData.shipper_address || pickupStop.location_address;
        extractedData.shipper_city = extractedData.shipper_city || pickupStop.location_city;
        extractedData.shipper_state = extractedData.shipper_state || pickupStop.location_state;
        extractedData.shipper_zip = extractedData.shipper_zip || pickupStop.location_zip;
        extractedData.pickup_date = extractedData.pickup_date || pickupStop.scheduled_date;
        extractedData.pickup_time = extractedData.pickup_time || pickupStop.scheduled_time;
      }
      
      if (deliveryStop) {
        extractedData.receiver_name = extractedData.receiver_name || deliveryStop.location_name;
        extractedData.receiver_address = extractedData.receiver_address || deliveryStop.location_address;
        extractedData.receiver_city = extractedData.receiver_city || deliveryStop.location_city;
        extractedData.receiver_state = extractedData.receiver_state || deliveryStop.location_state;
        extractedData.receiver_zip = extractedData.receiver_zip || deliveryStop.location_zip;
        extractedData.delivery_date = extractedData.delivery_date || deliveryStop.scheduled_date;
        extractedData.delivery_time = extractedData.delivery_time || deliveryStop.scheduled_time;
      }
    }

    // Track AI usage
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);
    
    const usage = data.usage || {};
    await supabase.from('ai_usage_tracking').insert({
      model: 'google/gemini-2.5-flash',
      feature: 'parse_rate_confirmation',
      prompt_tokens: usage.prompt_tokens || 0,
      completion_tokens: usage.completion_tokens || 0,
      total_tokens: usage.total_tokens || 0,
      user_id: gateResult.user_id,
    });

    console.log('Successfully extracted load data:', {
      customer_load_id: extractedData.customer_load_id,
      customer_name: extractedData.customer_name,
      rate: extractedData.rate,
      stops_count: extractedData.stops?.length || 0,
    });

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in parse-rate-confirmation:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
