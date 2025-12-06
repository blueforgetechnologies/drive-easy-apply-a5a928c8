import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface HighwayCarrierData {
  dot_number: string;
  mc_number?: string;
  legal_name?: string;
  dba_name?: string;
  contact_name?: string;
  contact_email?: string;
  contact_phone?: string;
  compliance_status?: string;
  onboarding_status?: string;
  rightful_owner_validated?: boolean;
  dispatch_service_detected?: boolean;
  insurance_valid?: boolean;
  fleet_size?: number;
  terminal_locations?: string[];
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { dot_number, mc_number } = await req.json();

    if (!dot_number && !mc_number) {
      return new Response(
        JSON.stringify({ error: 'DOT or MC number is required' }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 400 
        }
      );
    }

    const highwayApiKey = Deno.env.get('HIGHWAY_API_KEY');
    
    // If no API key configured, return a "not configured" response
    if (!highwayApiKey) {
      console.log('Highway API key not configured - returning placeholder response');
      return new Response(
        JSON.stringify({ 
          configured: false,
          message: 'Highway integration not configured. Add HIGHWAY_API_KEY to enable.',
          data: null
        }),
        { 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          status: 200 
        }
      );
    }

    // Build the Highway API URL
    // Highway API endpoint format: https://api.highway.com/v1/carriers/{dot_number}
    const identifier = dot_number || mc_number;
    const searchParam = dot_number ? 'dot' : 'mc';
    const highwayUrl = `https://api.highway.com/v1/carriers?${searchParam}=${identifier}`;
    
    console.log('Fetching from Highway API:', highwayUrl);
    
    const response = await fetch(highwayUrl, {
      headers: {
        'Authorization': `Bearer ${highwayApiKey}`,
        'Content-Type': 'application/json',
      },
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Highway API error:', response.status, errorText);
      
      if (response.status === 401) {
        return new Response(
          JSON.stringify({ 
            configured: true,
            error: 'Invalid Highway API key',
            data: null
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        );
      }
      
      if (response.status === 404) {
        return new Response(
          JSON.stringify({ 
            configured: true,
            found: false,
            message: 'Carrier not found in Highway database',
            data: null
          }),
          { 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200 
          }
        );
      }

      throw new Error(`Highway API error: ${response.status}`);
    }

    const highwayData = await response.json();
    console.log('Highway API response:', JSON.stringify(highwayData));

    // Map Highway response to our carrier data structure
    const carrierData: HighwayCarrierData = {
      dot_number: highwayData.dot_number || dot_number,
      mc_number: highwayData.mc_number,
      legal_name: highwayData.legal_name,
      dba_name: highwayData.dba_name,
      contact_name: highwayData.contact?.name,
      contact_email: highwayData.contact?.email,
      contact_phone: highwayData.contact?.phone,
      compliance_status: highwayData.compliance_status,
      onboarding_status: highwayData.onboarding_status,
      rightful_owner_validated: highwayData.rightful_owner_validated,
      dispatch_service_detected: highwayData.dispatch_service_detected,
      insurance_valid: highwayData.insurance?.valid,
      fleet_size: highwayData.fleet?.size,
      terminal_locations: highwayData.terminal_locations,
    };

    return new Response(
      JSON.stringify({ 
        configured: true,
        found: true,
        data: carrierData
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200 
      }
    );

  } catch (error) {
    console.error('Error fetching Highway data:', error);
    return new Response(
      JSON.stringify({ 
        configured: true,
        error: error instanceof Error ? error.message : 'Unknown error',
        data: null
      }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500 
      }
    );
  }
});
