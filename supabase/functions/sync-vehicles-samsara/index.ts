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

    // Validate and trim API key
    const trimmedKey = SAMSARA_API_KEY.trim();
    console.log('Starting Samsara sync with API key length:', trimmedKey.length);

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
    const samsaraVehicles = samsaraData.data || [];
    console.log(`Found ${samsaraVehicles.length} vehicles in Samsara`);

    // Create VIN to Samsara vehicle map for quick lookup
    const samsaraByVin = new Map();
    samsaraVehicles.forEach((v: any) => {
      const vin = v.externalIds?.["samsara.vin"];
      if (vin) {
        samsaraByVin.set(vin, v);
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

      // Extract odometer from obdOdometerMeters array (convert meters to miles)
      if (samsaraVehicle.obdOdometerMeters?.[0]?.value) {
        updateData.odometer = Math.round(samsaraVehicle.obdOdometerMeters[0].value / 1609.34);
      }

      // Extract speed from GPS array (round to integer)
      if (samsaraVehicle.gps?.[0]?.speedMilesPerHour !== undefined) {
        updateData.speed = Math.round(samsaraVehicle.gps[0].speedMilesPerHour);
        updateData.stopped_status = samsaraVehicle.gps[0].speedMilesPerHour === 0 ? 'Stopped' : 'Moving';
      }

      // Extract location from GPS array - always store coordinates for map
      if (samsaraVehicle.gps?.[0]?.latitude && samsaraVehicle.gps?.[0]?.longitude) {
        const lat = samsaraVehicle.gps[0].latitude;
        const lng = samsaraVehicle.gps[0].longitude;
        // Store coordinates in parseable format for map: "lat, lng"
        updateData.last_location = `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
      }

      // Store Samsara provider info
      updateData.provider = 'Samsara';
      updateData.provider_id = samsaraVehicle.id;

      // Try to fetch the latest camera image
      try {
        const now = new Date();
        const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
        
        const cameraResponse = await fetch(
          `https://api.samsara.com/fleet/vehicles/${samsaraVehicle.id}/cameras/media/history?startTime=${oneHourAgo.toISOString()}&endTime=${now.toISOString()}`,
          {
            headers: {
              'Authorization': `Bearer ${trimmedKey}`,
              'Accept': 'application/json',
            },
          }
        );

        if (cameraResponse.ok) {
          const cameraData = await cameraResponse.json();
          // Get the most recent front-facing camera image
          if (cameraData.data?.cameras?.[0]?.images?.length > 0) {
            const images = cameraData.data.cameras[0].images;
            const frontFacingImage = images.find((img: any) => 
              img.imageData?.some((data: any) => data.cameraView === 'frontFacing')
            );
            if (frontFacingImage?.imageData?.[0]?.url) {
              updateData.camera_image_url = frontFacingImage.imageData[0].url;
            }
          }
        }
      } catch (cameraError) {
        console.log(`Could not fetch camera image for vehicle ${dbVehicle.vin}:`, cameraError);
        // Continue without camera image
      }

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
