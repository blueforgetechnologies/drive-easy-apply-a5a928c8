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

    // Validate API key format
    const trimmedKey = SAMSARA_API_KEY.trim();
    console.log('API key length:', trimmedKey.length);
    console.log('API key starts with:', trimmedKey.substring(0, 12));

    // Get vehicle from database to get VIN
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: vehicle, error: dbError } = await supabase
      .from('vehicles')
      .select('vin')
      .eq('id', vehicleId)
      .single();

    if (dbError || !vehicle) {
      console.error('Vehicle not found:', dbError);
      return new Response(
        JSON.stringify({ error: 'Vehicle not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!vehicle.vin) {
      return new Response(
        JSON.stringify({ 
          error: 'No VIN configured',
          message: 'Vehicle must have a VIN to fetch Samsara data'
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Fetching Samsara vehicles for VIN:', vehicle.vin);
    
    // Fetch vehicle stats from Samsara with required types parameter including odometer
    const samsaraResponse = await fetch(
      'https://api.samsara.com/fleet/vehicles/stats/feed?types=gps,obdOdometerMeters,fuelPercents',
      {
        headers: {
          'Authorization': `Bearer ${trimmedKey}`,
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
    console.log('Samsara vehicles count:', samsaraData.data?.length || 0);
    
    // Find vehicle by VIN in externalIds
    const samsaraVehicle = samsaraData.data?.find((v: any) => 
      v.externalIds?.["samsara.vin"] === vehicle.vin
    );
    
    console.log('Looking for VIN:', vehicle.vin);
    console.log('Vehicle found:', samsaraVehicle ? 'Yes' : 'No');

    if (!samsaraVehicle) {
      console.log('Vehicle not found in Samsara by VIN:', vehicle.vin);
      // Return a successful response with a notFound flag instead of 404
      return new Response(
        JSON.stringify({ 
          notFound: true,
          error: null,
          message: `No vehicle with VIN ${vehicle.vin} found in your Samsara fleet`
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Found Samsara vehicle:', samsaraVehicle.name);

    // Extract relevant fields from feed data
    const stats = {
      // Get odometer from obdOdometerMeters array (convert meters to miles)
      odometer: samsaraVehicle.obdOdometerMeters?.[0]?.value 
        ? (samsaraVehicle.obdOdometerMeters[0].value / 1609.34).toFixed(1)
        : null,
      speed: samsaraVehicle.gps?.[0]?.speedMilesPerHour || 0,
      stoppedStatus: (samsaraVehicle.gps?.[0]?.speedMilesPerHour || 0) === 0 ? 'Stopped' : 'Moving',
      location: samsaraVehicle.gps?.[0]?.reverseGeo?.formattedLocation || 
                (samsaraVehicle.gps?.[0]?.latitude && samsaraVehicle.gps?.[0]?.longitude
                  ? `${samsaraVehicle.gps[0].latitude.toFixed(4)}, ${samsaraVehicle.gps[0].longitude.toFixed(4)}`
                  : null),
      lastUpdated: samsaraVehicle.gps?.[0]?.time || samsaraVehicle.obdOdometerMeters?.[0]?.time,
      latitude: samsaraVehicle.gps?.[0]?.latitude,
      longitude: samsaraVehicle.gps?.[0]?.longitude,
      fuelPercent: samsaraVehicle.fuelPercents?.[0]?.value,
      samsaraId: samsaraVehicle.id,
      samsaraName: samsaraVehicle.name,
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
