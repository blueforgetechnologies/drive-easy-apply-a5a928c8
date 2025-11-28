import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface IntegrationStatus {
  id: string;
  name: string;
  description: string;
  status: "operational" | "degraded" | "down";
  error?: string;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const integrations: IntegrationStatus[] = [];

    // Check Samsara API
    try {
      const samsaraKey = Deno.env.get('SAMSARA_API_KEY');
      if (!samsaraKey) {
        integrations.push({
          id: "samsara",
          name: "Samsara API",
          description: "Vehicle telematics and fleet tracking",
          status: "down",
          error: "API key not configured",
        });
      } else {
        const response = await fetch('https://api.samsara.com/fleet/vehicles', {
          headers: {
            'Authorization': `Bearer ${samsaraKey}`,
            'Content-Type': 'application/json',
          },
        });
        
        integrations.push({
          id: "samsara",
          name: "Samsara API",
          description: "Vehicle telematics and fleet tracking",
          status: response.ok ? "operational" : "down",
          error: !response.ok ? `HTTP ${response.status}` : undefined,
        });
      }
    } catch (error) {
      integrations.push({
        id: "samsara",
        name: "Samsara API",
        description: "Vehicle telematics and fleet tracking",
        status: "down",
        error: error instanceof Error ? error.message : "Connection failed",
      });
    }

    // Check FMCSA SaferWeb
    try {
      const testDOT = "2350112"; // Example DOT number
      const response = await fetch(
        `https://mobile.fmcsa.dot.gov/qc/services/carriers/${testDOT}?webKey=1234567890abcdef1234567890abcdef12345678`
      );
      
      integrations.push({
        id: "fmcsa",
        name: "FMCSA/SaferWeb",
        description: "Carrier safety data and compliance",
        status: response.ok ? "operational" : "degraded",
        error: !response.ok ? `HTTP ${response.status}` : undefined,
      });
    } catch (error) {
      integrations.push({
        id: "fmcsa",
        name: "FMCSA/SaferWeb",
        description: "Carrier safety data and compliance",
        status: "down",
        error: error instanceof Error ? error.message : "Connection failed",
      });
    }

    // Check Weather API
    try {
      const weatherKey = Deno.env.get('WEATHER_API_KEY');
      if (!weatherKey) {
        integrations.push({
          id: "weather",
          name: "Weather API",
          description: "Real-time weather data for locations",
          status: "down",
          error: "API key not configured",
        });
      } else {
        const response = await fetch(
          `http://api.weatherapi.com/v1/current.json?key=${weatherKey}&q=40.7128,-74.0060&aqi=no`
        );
        
        integrations.push({
          id: "weather",
          name: "Weather API",
          description: "Real-time weather data for locations",
          status: response.ok ? "operational" : "down",
          error: !response.ok ? `HTTP ${response.status}` : undefined,
        });
      }
    } catch (error) {
      integrations.push({
        id: "weather",
        name: "Weather API",
        description: "Real-time weather data for locations",
        status: "down",
        error: error instanceof Error ? error.message : "Connection failed",
      });
    }

    // Check Resend (simplified check)
    try {
      const resendKey = Deno.env.get('RESEND_API_KEY');
      if (!resendKey) {
        integrations.push({
          id: "resend",
          name: "Resend Email",
          description: "Transactional email service",
          status: "down",
          error: "API key not configured",
        });
      } else {
        // Just check if the key exists and appears valid
        integrations.push({
          id: "resend",
          name: "Resend Email",
          description: "Transactional email service",
          status: resendKey.startsWith('re_') ? "operational" : "degraded",
          error: !resendKey.startsWith('re_') ? "Invalid API key format" : undefined,
        });
      }
    } catch (error) {
      integrations.push({
        id: "resend",
        name: "Resend Email",
        description: "Transactional email service",
        status: "down",
        error: error instanceof Error ? error.message : "Configuration error",
      });
    }

    // Check Mapbox (using token from edge function)
    try {
      const { data: tokenData, error: tokenError } = await (await fetch(
        `${Deno.env.get('SUPABASE_URL')}/functions/v1/get-mapbox-token`,
        {
          headers: {
            'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
          },
        }
      )).json();

      if (tokenError || !tokenData?.token) {
        integrations.push({
          id: "mapbox",
          name: "Mapbox",
          description: "Maps and geocoding services",
          status: "down",
          error: "Token not available",
        });
      } else {
        // Test the token with a simple API call
        const response = await fetch(
          `https://api.mapbox.com/geocoding/v5/mapbox.places/test.json?access_token=${tokenData.token}`
        );
        
        integrations.push({
          id: "mapbox",
          name: "Mapbox",
          description: "Maps and geocoding services",
          status: response.ok ? "operational" : "down",
          error: !response.ok ? `HTTP ${response.status}` : undefined,
        });
      }
    } catch (error) {
      integrations.push({
        id: "mapbox",
        name: "Mapbox",
        description: "Maps and geocoding services",
        status: "down",
        error: error instanceof Error ? error.message : "Connection failed",
      });
    }

    return new Response(
      JSON.stringify({ integrations }),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  } catch (error) {
    console.error('Error checking integrations:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
