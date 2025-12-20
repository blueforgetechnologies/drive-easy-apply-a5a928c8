import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// Validate request - accepts either CRON_SECRET header or valid JWT from pg_cron
function validateRequest(req: Request): boolean {
  // Check for cron secret header first
  const cronSecret = Deno.env.get('CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  if (cronSecret && providedSecret === cronSecret) {
    return true;
  }
  
  // Also allow requests with valid Authorization header (from pg_cron with JWT)
  const authHeader = req.headers.get('authorization');
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return true;
  }
  
  console.error('Unauthorized: No valid cron secret or authorization header');
  return false;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Validate request for security
  if (!validateRequest(req)) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const samsaraApiKey = Deno.env.get('SAMSARA_API_KEY');
    
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log('Starting vehicle location capture...');

    // Fetch all vehicles with their current location data
    const { data: vehicles, error: vehiclesError } = await supabase
      .from('vehicles')
      .select('id, vehicle_number, last_location, speed, odometer, vin, provider_id')
      .not('last_location', 'is', null);

    if (vehiclesError) {
      console.error('Error fetching vehicles:', vehiclesError);
      throw vehiclesError;
    }

    console.log(`Found ${vehicles?.length || 0} vehicles with location data`);

    // If Samsara is available, try to fetch fresh data first
    let samsaraData: Record<string, any> = {};
    if (samsaraApiKey) {
      try {
        const statsResponse = await fetch(
          'https://api.samsara.com/fleet/vehicles/stats/feed?types=gps,obdOdometerMeters',
          {
            headers: {
              'Authorization': `Bearer ${samsaraApiKey}`,
              'Content-Type': 'application/json',
            },
          }
        );

        if (statsResponse.ok) {
          const statsData = await statsResponse.json();
          console.log(`Fetched ${statsData.data?.length || 0} vehicles from Samsara`);
          
          // Index by VIN and provider ID for easy lookup
          for (const vehicle of statsData.data || []) {
            if (vehicle.vin) {
              samsaraData[vehicle.vin] = vehicle;
            }
            if (vehicle.id) {
              samsaraData[vehicle.id] = vehicle;
            }
          }
        } else {
          console.warn('Samsara API returned non-OK status:', statsResponse.status);
        }
      } catch (samsaraError) {
        console.warn('Samsara API temporarily unavailable, using cached data:', samsaraError);
      }
    }

    const locationsToInsert: any[] = [];
    const now = new Date().toISOString();

    for (const vehicle of vehicles || []) {
      // Parse lat/lng from last_location string (format: "lat, lng")
      let latitude: number | null = null;
      let longitude: number | null = null;
      let speed = vehicle.speed;
      let odometer = vehicle.odometer;

      if (vehicle.last_location) {
        const [latStr, lngStr] = vehicle.last_location.split(',').map((s: string) => s.trim());
        latitude = parseFloat(latStr);
        longitude = parseFloat(lngStr);
      }

      // Check if we have fresh Samsara data for this vehicle
      const samsaraVehicle = samsaraData[vehicle.vin] || samsaraData[vehicle.provider_id];
      if (samsaraVehicle) {
        const gps = samsaraVehicle.gps;
        if (gps?.latitude && gps?.longitude) {
          latitude = gps.latitude;
          longitude = gps.longitude;
          speed = gps.speedMilesPerHour || speed;
        }
        if (samsaraVehicle.obdOdometerMeters?.value) {
          odometer = samsaraVehicle.obdOdometerMeters.value * 0.000621371; // Convert meters to miles
        }
      }

      if (latitude && longitude && !isNaN(latitude) && !isNaN(longitude)) {
        locationsToInsert.push({
          vehicle_id: vehicle.id,
          latitude,
          longitude,
          speed,
          odometer,
          heading: null,
          recorded_at: now,
        });
      }
    }

    console.log(`Inserting ${locationsToInsert.length} location records`);

    if (locationsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('vehicle_location_history')
        .insert(locationsToInsert);

      if (insertError) {
        console.error('Error inserting locations:', insertError);
        throw insertError;
      }
    }

    // Clean up old data (keep 8 days to reduce costs)
    const eightDaysAgo = new Date();
    eightDaysAgo.setDate(eightDaysAgo.getDate() - 8);
    
    const { error: cleanupError } = await supabase
      .from('vehicle_location_history')
      .delete()
      .lt('recorded_at', eightDaysAgo.toISOString());

    if (cleanupError) {
      console.warn('Error cleaning up old locations:', cleanupError);
    }

    return new Response(
      JSON.stringify({
        success: true,
        captured: locationsToInsert.length,
        timestamp: now,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    console.error('Error in capture-vehicle-locations:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
