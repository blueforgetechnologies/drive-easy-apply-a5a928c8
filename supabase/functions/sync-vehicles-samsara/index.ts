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
    // Get Samsara API key
    const SAMSARA_API_KEY = Deno.env.get("SAMSARA_API_KEY");
    if (!SAMSARA_API_KEY) {
      console.error('SAMSARA_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'Samsara API key not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch all vehicles from database
    const { data: dbVehicles, error: dbError } = await supabase
      .from('vehicles')
      .select('id, vin, vehicle_number')
      .not('vin', 'is', null);

    if (dbError) {
      console.error('Error fetching vehicles from database:', dbError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch vehicles from database' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Found ${dbVehicles?.length || 0} vehicles with VINs in database`);

    // Fetch all vehicles from Samsara
    const samsaraResponse = await fetch(
      'https://api.samsara.com/fleet/vehicles/stats',
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
    const samsaraVehicles = samsaraData.data || [];
    console.log(`Found ${samsaraVehicles.length} vehicles in Samsara`);

    // Create VIN to Samsara vehicle map for quick lookup
    const samsaraByVin = new Map();
    samsaraVehicles.forEach((v: any) => {
      if (v.vin) {
        samsaraByVin.set(v.vin, v);
      }
    });

    // Sync each vehicle
    const results = {
      total: dbVehicles?.length || 0,
      matched: 0,
      updated: 0,
      notFound: [] as string[],
      errors: [] as any[],
    };

    for (const dbVehicle of dbVehicles || []) {
      const samsaraVehicle = samsaraByVin.get(dbVehicle.vin);
      
      if (!samsaraVehicle) {
        results.notFound.push(dbVehicle.vin);
        console.log(`Vehicle not found in Samsara: ${dbVehicle.vin}`);
        continue;
      }

      results.matched++;

      // Prepare update data
      const updateData: any = {
        last_updated: new Date().toISOString(),
      };

      // Extract odometer (convert meters to miles)
      if (samsaraVehicle.engineStates?.[0]?.odometerMeters) {
        updateData.odometer = Math.round(samsaraVehicle.engineStates[0].odometerMeters / 1609.34);
      }

      // Extract speed
      if (samsaraVehicle.gps?.speedMilesPerHour !== undefined) {
        updateData.speed = samsaraVehicle.gps.speedMilesPerHour;
        updateData.stopped_status = samsaraVehicle.gps.speedMilesPerHour === 0 ? 'Stopped' : 'Moving';
      }

      // Extract location
      if (samsaraVehicle.gps?.reverseGeo?.formattedLocation) {
        updateData.last_location = samsaraVehicle.gps.reverseGeo.formattedLocation;
      } else if (samsaraVehicle.gps?.latitude && samsaraVehicle.gps?.longitude) {
        updateData.last_location = `${samsaraVehicle.gps.latitude.toFixed(4)}, ${samsaraVehicle.gps.longitude.toFixed(4)}`;
      }

      // Store Samsara provider info
      updateData.provider = 'Samsara';
      updateData.provider_id = samsaraVehicle.id;

      // Update vehicle in database
      const { error: updateError } = await supabase
        .from('vehicles')
        .update(updateData)
        .eq('id', dbVehicle.id);

      if (updateError) {
        console.error(`Error updating vehicle ${dbVehicle.vin}:`, updateError);
        results.errors.push({
          vin: dbVehicle.vin,
          error: updateError.message
        });
      } else {
        results.updated++;
        console.log(`Updated vehicle ${dbVehicle.vin} (${dbVehicle.vehicle_number || 'no unit ID'})`);
      }
    }

    console.log('Sync completed:', results);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Successfully synced ${results.updated} of ${results.total} vehicles`,
        results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Error in sync-vehicles-samsara:', error);
    return new Response(
      JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown error occurred'
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
