import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function parseLoadEmail(subject: string, bodyText: string): any {
  const parsed: any = {};

  // Parse Sylectus email subject format
  const vehicleTypeMatch = subject.match(/^([A-Z\s]+)\s+from/i);
  if (vehicleTypeMatch) {
    parsed.vehicle_type = vehicleTypeMatch[1].trim();
  }

  const routeMatch = subject.match(/from\s+([^,]+),\s*([A-Z]{2})\s+to\s+([^,]+),\s*([A-Z]{2})/i);
  if (routeMatch) {
    parsed.origin_city = routeMatch[1].trim();
    parsed.origin_state = routeMatch[2].trim();
    parsed.destination_city = routeMatch[3].trim();
    parsed.destination_state = routeMatch[4].trim();
  }

  const milesMatch = subject.match(/:\s*(\d+)\s*miles/i);
  if (milesMatch) {
    parsed.loaded_miles = parseInt(milesMatch[1]);
  }

  const weightMatch = subject.match(/(\d+)\s*lbs/i);
  if (weightMatch) {
    parsed.weight = weightMatch[1];
  }

  const postedByMatch = subject.match(/Posted by\s+([^(]+)/i);
  if (postedByMatch) {
    parsed.customer = postedByMatch[1].trim();
  }

  // Clean HTML if present in body
  let cleanText = bodyText.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ');

  const pickupMatch = cleanText.match(/Pick.*?Up.*?(\d{1,2}\/\d{1,2}\/\d{4}).*?(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
  if (pickupMatch) {
    parsed.pickup_date = pickupMatch[1];
    parsed.pickup_time = pickupMatch[2];
  }

  const deliveryMatch = cleanText.match(/Delivery.*?(\d{1,2}\/\d{1,2}\/\d{4}).*?(\d{1,2}:\d{2}\s*(?:AM|PM)?)/i);
  if (deliveryMatch) {
    parsed.delivery_date = deliveryMatch[1];
    parsed.delivery_time = deliveryMatch[2];
  }

  const rateMatch = cleanText.match(/(?:rate|pay).*?\$\s*([\d,]+(?:\.\d{2})?)/i);
  if (rateMatch) {
    parsed.rate = parseFloat(rateMatch[1].replace(/,/g, ''));
  }

  // Extract pieces
  const piecesMatch = cleanText.match(/(\d+)\s*(?:pieces|pcs|pallets)/i);
  if (piecesMatch) {
    parsed.pieces = parseInt(piecesMatch[1]);
  }

  // Extract dimensions
  const dimensionsMatch = cleanText.match(/dimensions?.*?(\d+[xX]\d+[xX]\d+)/i);
  if (dimensionsMatch) {
    parsed.dimensions = dimensionsMatch[1];
  }

  const availMatch = cleanText.match(/(\d+)\s*(?:ft|feet).*?avail/i);
  if (availMatch) {
    parsed.avail_ft = availMatch[1];
  }

  // Extract expiration time from body
  const expiresMatch = cleanText.match(/expires?.*?(\d{1,2}\/\d{1,2}\/\d{4}).*?(\d{1,2}:\d{2}\s*(?:AM|PM)?\s*[A-Z]{2,3}T?)/i);
  if (expiresMatch) {
    parsed.expires_datetime = `${expiresMatch[1]} ${expiresMatch[2]}`;
    // Convert to ISO timestamp for expires_at column
    try {
      const expiresDate = new Date(`${expiresMatch[1]} ${expiresMatch[2]}`);
      if (!isNaN(expiresDate.getTime())) {
        parsed.expires_at = expiresDate.toISOString();
      }
    } catch (e) {
      console.error('Error parsing expires date:', e);
    }
  }

  return parsed;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting reprocessing of all load emails...');

    // Fetch all load emails
    const { data: loadEmails, error: fetchError } = await supabase
      .from('load_emails')
      .select('*')
      .order('received_at', { ascending: false });

    if (fetchError) {
      console.error('Error fetching load emails:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${loadEmails?.length || 0} load emails to reprocess`);

    let updatedCount = 0;

    for (const email of loadEmails || []) {
      try {
        // Re-parse the email
        const parsedData = parseLoadEmail(
          email.subject || '',
          email.body_html || email.body_text || ''
        );

        // Update the record with new parsed data
        const { error: updateError } = await supabase
          .from('load_emails')
          .update({
            parsed_data: parsedData,
            expires_at: parsedData.expires_at || null,
          })
          .eq('id', email.id);

        if (updateError) {
          console.error(`Error updating email ${email.id}:`, updateError);
        } else {
          updatedCount++;
          console.log(`Updated ${email.id}: pieces=${parsedData.pieces}, dims=${parsedData.dimensions}, expires=${parsedData.expires_datetime}`);
        }
      } catch (error) {
        console.error(`Error processing email ${email.id}:`, error);
      }
    }

    console.log(`Successfully reprocessed ${updatedCount} load emails`);

    return new Response(
      JSON.stringify({
        message: 'Load emails reprocessed successfully',
        total: loadEmails?.length || 0,
        updated: updatedCount,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in reprocess-load-emails function:', error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
