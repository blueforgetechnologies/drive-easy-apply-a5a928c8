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
    const { usdot, mc } = await req.json();

    if (!usdot && !mc) {
      return new Response(
        JSON.stringify({ error: 'USDOT or MC number is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    let fmcsaUrl: string;
    let queryValue: string;

    if (usdot) {
      // Search by USDOT
      queryValue = usdot;
      fmcsaUrl = `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=USDOT&query_string=${usdot}`;
    } else {
      // Search by MC number - clean the MC number (remove MC- prefix if present)
      queryValue = mc.replace(/^MC-?/i, '').trim();
      fmcsaUrl = `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=MC_MX&query_string=${queryValue}`;
    }
    
    console.log('Fetching from:', fmcsaUrl);
    
    const fmcsaResponse = await fetch(fmcsaUrl);
    const html = await fmcsaResponse.text();

    // Parse the HTML to extract carrier information
    const carrierData: any = {
      usdot: '',
      name: '',
      dba_name: '',
      physical_address: '',
      phone: '',
      mc_number: '',
      safer_status: null,
      safety_rating: null,
    };

    console.log('Fetched HTML length:', html.length);

    // Extract USDOT Number
    const usdotMatch = html.match(/USDOT Number:<\/a><\/th>\s*<td[^>]*>(.*?)<\/td>/is);
    if (usdotMatch) {
      carrierData.usdot = usdotMatch[1].trim().replace(/&nbsp;/g, '').replace(/<[^>]*>/g, '').trim();
      console.log('Found USDOT:', carrierData.usdot);
    } else if (usdot) {
      carrierData.usdot = usdot;
    }

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

    // Extract Operating Authority Status (Safer Status)
    // The pattern is: Operating Authority Status:</a></th>...<td>...<b>STATUS_HERE</b>
    const operatingStatusMatch = html.match(/Operating\s+Authority\s+Status:<\/a><\/th>[\s\S]{0,300}?<b>(.*?)<\/b>/i);
    if (operatingStatusMatch) {
      carrierData.safer_status = operatingStatusMatch[1].trim().replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
      console.log('Found Operating Authority Status (Safer Status):', carrierData.safer_status);
    } else {
      console.log('Operating Authority Status pattern did not match');
    }

    // Extract Safety Rating
    // The pattern is in a table: Rating:</th>...<td>...RATING_TEXT...
    const safetyRatingMatch = html.match(/Rating:<\/[^>]+>[\s\S]{0,200}?<td[^>]*>[\s\S]{0,100}?([^<\n]+)/i);
    if (safetyRatingMatch) {
      const rating = safetyRatingMatch[1].trim().replace(/&nbsp;/g, ' ').replace(/\|/g, '').replace(/\s+/g, ' ').trim();
      if (rating && rating.length > 0 && rating !== '') {
        carrierData.safety_rating = rating;
        console.log('Found Safety Rating:', carrierData.safety_rating);
      }
    } else {
      console.log('Safety Rating pattern did not match');
    }

    // Check if carrier was found - at least one field should be populated
    if (!carrierData.name && !carrierData.dba_name && !carrierData.physical_address) {
      console.log('No carrier data found in HTML');
      return new Response(
        JSON.stringify({ 
          error: mc ? 'Carrier not found with this MC number' : 'Carrier not found with this USDOT number',
          found: false
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
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
