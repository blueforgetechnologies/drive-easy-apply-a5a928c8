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
    
    // Fetch vehicle stats from Samsara with required types parameter
    const samsaraResponse = await fetch(
      'https://api.samsara.com/fleet/vehicles/stats/feed?types=gps,engineStates,fuelPercents',
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
    if (samsaraData.data && samsaraData.data.length > 0) {
      console.log('Sample Samsara vehicle:', JSON.stringify(samsaraData.data[0], null, 2));
    }
    
    // Log all available VINs for debugging
    const availableVins = samsaraData.data?.map((v: any) => v.vin).filter(Boolean) || [];
    console.log('Available VINs in Samsara:', availableVins);
    console.log('Looking for VIN:', vehicle.vin);

    // Find vehicle by VIN
    const samsaraVehicle = samsaraData.data?.find((v: any) => v.vin === vehicle.vin);

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

    // Extract relevant fields
    const stats = {
      odometer: samsaraVehicle.engineStates?.[0]?.odometerMeters 
        ? (samsaraVehicle.engineStates[0].odometerMeters / 1609.34).toFixed(1) // Convert meters to miles
        : null,
      speed: samsaraVehicle.gps?.speedMilesPerHour || 0,
      stoppedStatus: samsaraVehicle.gps?.speedMilesPerHour === 0 ? 'Stopped' : 'Moving',
      location: samsaraVehicle.gps?.reverseGeo?.formattedLocation || 
                (samsaraVehicle.gps?.latitude && samsaraVehicle.gps?.longitude
                  ? `${samsaraVehicle.gps.latitude.toFixed(4)}, ${samsaraVehicle.gps.longitude.toFixed(4)}`
                  : null),
      lastUpdated: samsaraVehicle.gps?.time || samsaraVehicle.time,
      latitude: samsaraVehicle.gps?.latitude,
      longitude: samsaraVehicle.gps?.longitude,
      engineHours: samsaraVehicle.engineStates?.[0]?.engineHours,
      fuelPercent: samsaraVehicle.fuelPercents?.[0]?.fuelPercent,
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
