import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentBase64, fileName, mimeType } = await req.json();

    if (!documentBase64) {
      return new Response(
        JSON.stringify({ success: false, error: 'Document content is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Parsing rate confirmation:', fileName, mimeType);

    const systemPrompt = `You are an expert at extracting structured data from rate confirmation documents used in freight and trucking.

Extract ALL available information from the document. Be thorough and extract every field you can find.

CRITICAL - UNDERSTANDING BROKER vs BILLING PARTY:
1. BROKER/CUSTOMER (customer_* fields): The company that arranged/brokered the load. This is typically:
   - The company whose letterhead/logo appears on the rate confirmation
   - The company with MC#/DOT# at the top of the document
   - The company listed as "Broker" or whose name appears prominently in header
   - Example: "Saturn Freight Systems" if they issued the rate confirmation

2. BILLING PARTY (billing_party_* fields): The company to whom we send invoices/bills for payment. This may be:
   - Explicitly labeled as "Bill To", "Billing Party", "Remit To", "Payment Contact"
   - Sometimes the same as the broker if not separately specified
   - A third-party factoring company or payment processor
   - Example: "Allstates WorldCargo" if they are listed as billing party

EXTRACTION RULES:
- ALWAYS extract the broker info into customer_* fields (the company that issued/arranged the load)
- Look for explicit "Bill To" or "Billing Party" section for billing_party_* fields
- If NO separate billing party is specified, leave billing_party_* fields null (the frontend will default to customer)

IMPORTANT FIELD MAPPINGS:
- "Shipper" = Origin/Pickup location  
- "Receiver" or "Consignee" = Destination/Delivery location

CRITICAL - CUSTOMER LOAD ID EXTRACTION:
- The customer_load_id is the MOST IMPORTANT identifier - look for it PROMINENTLY in the document
- IT OFTEN APPEARS IN THE DOCUMENT TITLE like "Carrier Confirmation C539792" or "Rate Confirmation #12345"
- The number right after the title IS the customer_load_id (e.g., "C539792" from "Carrier Confirmation C539792")
- Other common labels: "PRO #", "Pro#", "Order #", "Order#", "Reference #", "Ref#", "Load #", "Confirmation #", "BOL #", "PO #", "Trip #", "Shipment #", "PROBILL #"

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

CRITICAL DISTINCTION - Read carefully:
1. BROKER/CUSTOMER: The company that ISSUED this rate confirmation (their letterhead, MC#, logo at top). Extract into customer_* fields.
2. BILLING PARTY: Look for explicit "Bill To", "Billing Party", "Remit To" section. If found, extract into billing_party_* fields. If NOT found, leave billing_party_* fields empty.

Include:
1. Broker/Customer company info (who issued this document) → customer_* fields
2. Billing party info (if explicitly specified as separate from broker) → billing_party_* fields
3. Load identification numbers (their reference #, Pro#, Order#, etc.)
4. Rate and any additional charges
5. Miles (loaded miles)
6. Pieces/pallets count  
7. ALL pickup stops (origins/shippers) with full address, contact, dates/times
8. ALL delivery stops (destinations/receivers/consignees) with full address, contact, dates/times
9. Vehicle/equipment type and size requirements
10. Cargo description, weight, dimensions
11. Any special instructions or notes

CRITICAL: If there are multiple pickups or deliveries, capture EACH as a separate stop in the stops array.`;

    let messageContent: any[];
    
    if (mimeType.startsWith('image/') || mimeType === 'application/pdf') {
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
                  // Customer/Broker info (the company that issued the rate confirmation)
                  customer_load_id: { type: 'string', description: 'Customer/broker load ID (Pro#, Order#, Reference#, etc.)' },
                  rate: { type: 'number', description: 'Rate amount in dollars' },
                  customer_name: { type: 'string', description: 'Broker company name (who issued this rate confirmation)' },
                  customer_address: { type: 'string', description: 'Broker street address' },
                  customer_city: { type: 'string', description: 'Broker city' },
                  customer_state: { type: 'string', description: 'Broker state' },
                  customer_zip: { type: 'string', description: 'Broker zip code' },
                  customer_mc_number: { type: 'string', description: 'Broker MC#' },
                  customer_dot_number: { type: 'string', description: 'Broker DOT#' },
                  customer_email: { type: 'string', description: 'Broker contact email' },
                  customer_phone: { type: 'string', description: 'Broker contact phone' },
                  customer_contact: { type: 'string', description: 'Broker contact person name' },
                  reference_number: { type: 'string', description: 'PO number or secondary reference' },
                  
                  // Billing Party info (who we bill/invoice - may be different from broker)
                  billing_party_name: { type: 'string', description: 'Billing party company name (if explicitly specified as "Bill To" or "Billing Party")' },
                  billing_party_address: { type: 'string', description: 'Billing party street address' },
                  billing_party_city: { type: 'string', description: 'Billing party city' },
                  billing_party_state: { type: 'string', description: 'Billing party state' },
                  billing_party_zip: { type: 'string', description: 'Billing party zip code' },
                  billing_party_contact: { type: 'string', description: 'Billing party contact person' },
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

    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    if (!toolCall || toolCall.function.name !== 'extract_load_data') {
      throw new Error('No valid extraction result from AI');
    }

    const extractedData = JSON.parse(toolCall.function.arguments);
    
    // Ensure stops array exists and populate from legacy fields if needed
    if (!extractedData.stops || extractedData.stops.length === 0) {
      extractedData.stops = [];
      
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

    // Sort stops by sequence and assign sequences if missing
    if (extractedData.stops && extractedData.stops.length > 0) {
      extractedData.stops.sort((a: any, b: any) => (a.stop_sequence || 0) - (b.stop_sequence || 0));
      extractedData.stops.forEach((stop: any, index: number) => {
        if (!stop.stop_sequence) stop.stop_sequence = index + 1;
      });
      
      // Populate legacy shipper/receiver fields from stops array for backwards compatibility
      const firstPickup = extractedData.stops.find((s: any) => s.stop_type === 'pickup');
      const lastDelivery = [...extractedData.stops].reverse().find((s: any) => s.stop_type === 'delivery');
      
      if (firstPickup) {
        extractedData.shipper_name = extractedData.shipper_name || firstPickup.location_name;
        extractedData.shipper_address = extractedData.shipper_address || firstPickup.location_address;
        extractedData.shipper_city = extractedData.shipper_city || firstPickup.location_city;
        extractedData.shipper_state = extractedData.shipper_state || firstPickup.location_state;
        extractedData.shipper_zip = extractedData.shipper_zip || firstPickup.location_zip;
        extractedData.shipper_contact = extractedData.shipper_contact || firstPickup.contact_name;
        extractedData.shipper_phone = extractedData.shipper_phone || firstPickup.contact_phone;
        extractedData.shipper_email = extractedData.shipper_email || firstPickup.contact_email;
        extractedData.pickup_date = extractedData.pickup_date || firstPickup.scheduled_date;
        extractedData.pickup_time = extractedData.pickup_time || firstPickup.scheduled_time;
      }
      
      if (lastDelivery) {
        extractedData.receiver_name = extractedData.receiver_name || lastDelivery.location_name;
        extractedData.receiver_address = extractedData.receiver_address || lastDelivery.location_address;
        extractedData.receiver_city = extractedData.receiver_city || lastDelivery.location_city;
        extractedData.receiver_state = extractedData.receiver_state || lastDelivery.location_state;
        extractedData.receiver_zip = extractedData.receiver_zip || lastDelivery.location_zip;
        extractedData.receiver_contact = extractedData.receiver_contact || lastDelivery.contact_name;
        extractedData.receiver_phone = extractedData.receiver_phone || lastDelivery.contact_phone;
        extractedData.receiver_email = extractedData.receiver_email || lastDelivery.contact_email;
        extractedData.delivery_date = extractedData.delivery_date || lastDelivery.scheduled_date;
        extractedData.delivery_time = extractedData.delivery_time || lastDelivery.scheduled_time;
      }
    }

    console.log('Extracted data:', JSON.stringify(extractedData, null, 2));

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error parsing rate confirmation:', error);
    return new Response(
      JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Failed to parse document' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
