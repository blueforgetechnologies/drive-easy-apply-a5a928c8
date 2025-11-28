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
    };

    // Extract Legal Name
    const legalNameMatch = html.match(/<th[^>]*>Legal Name:<\/th>\s*<td[^>]*>(.*?)<\/td>/i);
    if (legalNameMatch) {
      carrierData.name = legalNameMatch[1].trim().replace(/<[^>]*>/g, '');
    }

    // Extract DBA Name
    const dbaNameMatch = html.match(/<th[^>]*>DBA Name:<\/th>\s*<td[^>]*>(.*?)<\/td>/i);
    if (dbaNameMatch) {
      carrierData.dba_name = dbaNameMatch[1].trim().replace(/<[^>]*>/g, '');
    }

    // Extract Physical Address
    const physicalAddressMatch = html.match(/<th[^>]*>Physical Address:<\/th>\s*<td[^>]*>(.*?)<\/td>/is);
    if (physicalAddressMatch) {
      carrierData.physical_address = physicalAddressMatch[1].trim().replace(/<[^>]*>/g, '').replace(/\s+/g, ' ');
    }

    // Extract Phone
    const phoneMatch = html.match(/<th[^>]*>Phone:<\/th>\s*<td[^>]*>(.*?)<\/td>/i);
    if (phoneMatch) {
      carrierData.phone = phoneMatch[1].trim().replace(/<[^>]*>/g, '');
    }

    // Extract MC Number
    const mcNumberMatch = html.match(/MC-(\d+)/i);
    if (mcNumberMatch) {
      carrierData.mc_number = mcNumberMatch[1];
    }

    // Check if carrier was found
    if (!carrierData.name && !carrierData.dba_name) {
      return new Response(
        JSON.stringify({ error: 'Carrier not found with this USDOT number' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 404 
        }
      );
    }

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
