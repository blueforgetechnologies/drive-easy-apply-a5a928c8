import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { usdot } = await req.json();

    if (!usdot) {
      return new Response(
        JSON.stringify({ error: 'USDOT number is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    // Try the official FMCSA website first (free, no auth required)
    // This scrapes the public webpage since FMCSA doesn't provide a public API
    const fmcsaUrl = `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${usdot}`;
    
    const fmcsaResponse = await fetch(fmcsaUrl);
    const html = await fmcsaResponse.text();

    // Parse the HTML to extract carrier information
    const carrierData: any = {
      usdot: usdot,
      name: '',
      dba_name: '',
      physical_address: '',
      phone: '',
      mc_number: '',
      safer_status: '',
      safety_rating: '',
    };

    console.log('Fetched HTML length:', html.length);

    // Extract Legal Name - looking for the pattern after "Legal Name:" label
    const legalNameMatch = html.match(/Legal Name:<\/a><\/th>\s*<td[^>]*>(.*?)<\/td>/is);
    if (legalNameMatch) {
      carrierData.name = legalNameMatch[1].trim().replace(/&nbsp;/g, '').replace(/<[^>]*>/g, '').trim();
      console.log('Found Legal Name:', carrierData.name);
    }

    // Extract DBA Name
    const dbaNameMatch = html.match(/DBA Name:<\/a><\/th>\s*<td[^>]*>(.*?)<\/td>/is);
    if (dbaNameMatch) {
      const dbaText = dbaNameMatch[1].trim().replace(/&nbsp;/g, '').replace(/<[^>]*>/g, '').trim();
      if (dbaText) {
        carrierData.dba_name = dbaText;
        console.log('Found DBA Name:', carrierData.dba_name);
      }
    }

    // Extract Physical Address
    const physicalAddressMatch = html.match(/Physical Address:<\/a><\/th>\s*<td[^>]*id="physicaladdressvalue"[^>]*>(.*?)<\/td>/is);
    if (physicalAddressMatch) {
      carrierData.physical_address = physicalAddressMatch[1]
        .replace(/<br>/gi, ' ')
        .replace(/&nbsp;/g, '')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      console.log('Found Physical Address:', carrierData.physical_address);
    }

    // Extract Phone
    const phoneMatch = html.match(/Phone:<\/a><\/th>\s*<td[^>]*>(.*?)<\/td>/is);
    if (phoneMatch) {
      carrierData.phone = phoneMatch[1].trim().replace(/&nbsp;/g, '').replace(/<[^>]*>/g, '').trim();
      console.log('Found Phone:', carrierData.phone);
    }

    // Extract MC Number
    const mcNumberMatch = html.match(/MC-(\d+)/i);
    if (mcNumberMatch) {
      carrierData.mc_number = mcNumberMatch[1];
      console.log('Found MC Number:', carrierData.mc_number);
    }

    // Extract Safer Status
    const saferStatusMatch = html.match(/Entity Type:<\/a><\/th>\s*<td[^>]*>(.*?)<\/td>/is);
    if (saferStatusMatch) {
      carrierData.safer_status = saferStatusMatch[1].trim().replace(/&nbsp;/g, '').replace(/<[^>]*>/g, '').trim();
      console.log('Found Safer Status:', carrierData.safer_status);
    }

    // Extract Safety Rating
    const safetyRatingMatch = html.match(/Safety Rating:<\/a><\/th>\s*<td[^>]*>(.*?)<\/td>/is);
    if (safetyRatingMatch) {
      carrierData.safety_rating = safetyRatingMatch[1].trim().replace(/&nbsp;/g, '').replace(/<[^>]*>/g, '').trim();
      console.log('Found Safety Rating:', carrierData.safety_rating);
    }

    // Check if carrier was found - at least one field should be populated
    if (!carrierData.name && !carrierData.dba_name && !carrierData.physical_address) {
      console.log('No carrier data found in HTML');
      return new Response(
        JSON.stringify({ error: 'Carrier not found with this USDOT number' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      );
    }

    console.log('Successfully parsed carrier data:', carrierData);

    return new Response(
      JSON.stringify(carrierData),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error fetching carrier data:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: 'Failed to fetch carrier data', details: errorMessage }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
