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

Important extraction guidelines:
- Extract dates in YYYY-MM-DD format
- Extract times in HH:MM format (24-hour)
- Extract rates/amounts as numbers without currency symbols
- For addresses, extract each component separately (street, city, state, zip)
- If a field is not found, leave it as null
- Look for the customer/broker's load ID - this may be called Pro#, Order#, Load#, Reference#, Confirmation#, Trip#, or similar
- Extract the customer/broker company name, address, and MC number if available
- Look for commodity/cargo descriptions, weight, pieces/pallets, and dimensions
- Extract total miles for the trip`;

    const userPrompt = `Extract all load information from this rate confirmation document. The document is named "${fileName}".

IMPORTANT: The customer's load ID is critical - look for any identifier they use like Pro#, Order#, Load#, Reference#, Confirmation#, Trip#, Shipment#, etc.

Return the extracted data in the following JSON structure:
{
  "customer_load_id": "the customer/broker's load ID (Pro#, Order#, Reference#, Confirmation#, etc.)",
  "rate": numeric rate amount,
  "customer_name": "customer/broker company name who is paying for this load",
  "customer_address": "customer/broker street address",
  "customer_city": "customer/broker city",
  "customer_state": "customer/broker state abbreviation",
  "customer_zip": "customer/broker zip code",
  "customer_mc_number": "customer/broker MC# or DOT# if available",
  "customer_email": "customer/broker contact email",
  "customer_phone": "customer/broker contact phone",
  "customer_contact": "customer/broker contact person name",
  "reference_number": "PO number or secondary reference",
  "shipper_name": "shipper/pickup company name",
  "shipper_address": "pickup street address",
  "shipper_city": "pickup city",
  "shipper_state": "pickup state abbreviation",
  "shipper_zip": "pickup zip code",
  "shipper_contact": "pickup contact name",
  "shipper_phone": "pickup phone",
  "shipper_email": "pickup email",
  "pickup_date": "YYYY-MM-DD",
  "pickup_time": "HH:MM",
  "receiver_name": "delivery/receiver company name",
  "receiver_address": "delivery street address",
  "receiver_city": "delivery city",
  "receiver_state": "delivery state abbreviation",
  "receiver_zip": "delivery zip code",
  "receiver_contact": "delivery contact name",
  "receiver_phone": "delivery phone",
  "receiver_email": "delivery email",
  "delivery_date": "YYYY-MM-DD",
  "delivery_time": "HH:MM",
  "cargo_description": "commodity or cargo description",
  "cargo_weight": numeric weight in pounds,
  "cargo_pieces": numeric piece/pallet count,
  "equipment_type": "trailer type (e.g., Van, Reefer, Flatbed)",
  "estimated_miles": numeric total trip miles,
  "special_instructions": "any special instructions or notes"
}`;

    // Build the message content based on mime type
    let messageContent: any[];
    
    if (mimeType.startsWith('image/')) {
      // For images, use vision capabilities
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
      // For PDFs, we'll need to inform the user we can parse images
      // The frontend should convert PDF pages to images
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
                  customer_load_id: { type: 'string', description: 'Customer/broker load ID (Pro#, Order#, Reference#, etc.)' },
                  rate: { type: 'number', description: 'Rate amount in dollars' },
                  customer_name: { type: 'string', description: 'Customer/broker company name' },
                  customer_address: { type: 'string', description: 'Customer/broker street address' },
                  customer_city: { type: 'string', description: 'Customer/broker city' },
                  customer_state: { type: 'string', description: 'Customer/broker state' },
                  customer_zip: { type: 'string', description: 'Customer/broker zip code' },
                  customer_mc_number: { type: 'string', description: 'Customer/broker MC# or DOT#' },
                  customer_email: { type: 'string', description: 'Customer contact email' },
                  customer_phone: { type: 'string', description: 'Customer contact phone' },
                  customer_contact: { type: 'string', description: 'Customer contact person name' },
                  reference_number: { type: 'string', description: 'PO number or secondary reference' },
                  shipper_name: { type: 'string', description: 'Shipper company name' },
                  shipper_address: { type: 'string', description: 'Pickup street address' },
                  shipper_city: { type: 'string', description: 'Pickup city' },
                  shipper_state: { type: 'string', description: 'Pickup state' },
                  shipper_zip: { type: 'string', description: 'Pickup zip code' },
                  shipper_contact: { type: 'string', description: 'Pickup contact name' },
                  shipper_phone: { type: 'string', description: 'Pickup phone' },
                  shipper_email: { type: 'string', description: 'Pickup email' },
                  pickup_date: { type: 'string', description: 'Pickup date in YYYY-MM-DD format' },
                  pickup_time: { type: 'string', description: 'Pickup time in HH:MM format' },
                  receiver_name: { type: 'string', description: 'Receiver company name' },
                  receiver_address: { type: 'string', description: 'Delivery street address' },
                  receiver_city: { type: 'string', description: 'Delivery city' },
                  receiver_state: { type: 'string', description: 'Delivery state' },
                  receiver_zip: { type: 'string', description: 'Delivery zip code' },
                  receiver_contact: { type: 'string', description: 'Delivery contact name' },
                  receiver_phone: { type: 'string', description: 'Delivery phone' },
                  receiver_email: { type: 'string', description: 'Delivery email' },
                  delivery_date: { type: 'string', description: 'Delivery date in YYYY-MM-DD format' },
                  delivery_time: { type: 'string', description: 'Delivery time in HH:MM format' },
                  cargo_description: { type: 'string', description: 'Cargo/commodity description' },
                  cargo_weight: { type: 'number', description: 'Weight in pounds' },
                  cargo_pieces: { type: 'number', description: 'Number of pieces/pallets' },
                  equipment_type: { type: 'string', description: 'Trailer/equipment type' },
                  estimated_miles: { type: 'number', description: 'Total trip miles' },
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
    console.log('Extracted data:', extractedData);

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
