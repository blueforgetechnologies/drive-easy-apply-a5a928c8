import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { vehicleId } = await req.json();
    
    if (!vehicleId) {
      return new Response(
        JSON.stringify({ error: 'Vehicle ID is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get Samsara API key
    const SAMSARA_API_KEY = Deno.env.get("SAMSARA_API_KEY");
    if (!SAMSARA_API_KEY) {
      console.error('SAMSARA_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Samsara API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get vehicle from database to check if it has a Samsara provider_id
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: vehicle, error: dbError } = await supabase
      .from('vehicles')
      .select('provider_id, vin')
      .eq('id', vehicleId)
      .single();

    if (dbError || !vehicle) {
      console.error('Vehicle not found:', dbError);
      return new Response(
        JSON.stringify({ error: 'Vehicle not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Use provider_id as Samsara vehicle ID if available
    const samsaraVehicleId = vehicle.provider_id;
    
    if (!samsaraVehicleId) {
      return new Response(
        JSON.stringify({ 
          error: 'No Samsara vehicle ID configured',
          message: 'Please set the Provider ID field to the Samsara vehicle ID'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch vehicle stats from Samsara
    console.log('Fetching Samsara data for vehicle:', samsaraVehicleId);
    
    const samsaraResponse = await fetch(
      `https://api.samsara.com/fleet/vehicles/${samsaraVehicleId}/stats`,
      {
        headers: {
          'Authorization': `Bearer ${SAMSARA_API_KEY}`,
          'Accept': 'application/json',
        },
      }
    );

    if (!samsaraResponse.ok) {
      const errorText = await samsaraResponse.text();
      console.error('Samsara API error:', samsaraResponse.status, errorText);
      return new Response(
        JSON.stringify({ 
          error: 'Failed to fetch Samsara data',
          status: samsaraResponse.status,
          details: errorText
        }),
        { status: samsaraResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const samsaraData = await samsaraResponse.json();
    console.log('Samsara data received:', samsaraData);

    // Extract relevant fields
    const stats = {
      odometer: samsaraData.engineStates?.[0]?.odometerMeters 
        ? (samsaraData.engineStates[0].odometerMeters / 1609.34).toFixed(1) // Convert meters to miles
        : null,
      speed: samsaraData.gps?.speedMilesPerHour || 0,
      stoppedStatus: samsaraData.gps?.speedMilesPerHour === 0 ? 'Stopped' : 'Moving',
      location: samsaraData.gps?.reverseGeo?.formattedLocation || 
                `${samsaraData.gps?.latitude?.toFixed(4)}, ${samsaraData.gps?.longitude?.toFixed(4)}`,
      lastUpdated: samsaraData.gps?.time || samsaraData.time,
      latitude: samsaraData.gps?.latitude,
      longitude: samsaraData.gps?.longitude,
      engineHours: samsaraData.engineStates?.[0]?.engineHours,
      fuelPercent: samsaraData.fuelPercents?.[0]?.fuelPercent,
    };

    return new Response(
      JSON.stringify(stats),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in get-vehicle-stats:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
