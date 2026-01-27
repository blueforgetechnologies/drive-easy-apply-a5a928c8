import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-cron-secret',
};

// Minimum distance in degrees to consider as "moved" (~111 meters per 0.001°)
const MIN_DISTANCE_THRESHOLD = 0.001;
// Maximum time between writes for parked vehicles (1 hour)
const MAX_PARKED_INTERVAL_MS = 60 * 60 * 1000;
// Speed threshold to consider vehicle as "moving"
const MOVING_SPEED_THRESHOLD = 2; // mph

// Calculate distance between two points (simple Euclidean for small distances)
function hasMovedSignificantly(
  lat1: number, lng1: number, 
  lat2: number, lng2: number
): boolean {
  const latDiff = Math.abs(lat1 - lat2);
  const lngDiff = Math.abs(lng1 - lng2);
  return latDiff > MIN_DISTANCE_THRESHOLD || lngDiff > MIN_DISTANCE_THRESHOLD;
}

// Validate request - accepts either CRON_SECRET header or valid JWT from pg_cron
function validateRequest(req: Request): boolean {
  const cronSecret = Deno.env.get('CRON_SECRET');
  const providedSecret = req.headers.get('x-cron-secret');
  if (cronSecret && providedSecret === cronSecret) {
    return true;
  }
  
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

    // ============================================================================
    // GUARD 1: Exit immediately if no vehicles with location data exist
    // ============================================================================
    const { count: vehicleCount } = await supabase
      .from('vehicles')
      .select('id', { count: 'exact', head: true })
      .not('last_location', 'is', null);

    if ((vehicleCount || 0) === 0) {
      console.log('[capture-vehicle-locations] ⚡ GUARD: No vehicles with location data, exiting early');
      return new Response(
        JSON.stringify({ guarded: true, message: 'No vehicles with location data' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============================================================================
    // GUARD 2: Get tenants with Samsara integration enabled, exit if none
    // ============================================================================
    const { data: samsaraTenants } = await supabase
      .from('tenant_integrations')
      .select('tenant_id')
      .eq('provider', 'samsara')
      .eq('is_enabled', true);

    const samsaraTenantIds = samsaraTenants?.map(t => t.tenant_id) || [];

    if (samsaraTenantIds.length === 0) {
      console.log('[capture-vehicle-locations] ⚡ GUARD: No tenants with Samsara enabled, exiting early');
      return new Response(
        JSON.stringify({ guarded: true, message: 'No Samsara integrations configured' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🚛 Starting vehicle location capture for ${samsaraTenantIds.length} Samsara-enabled tenant(s)...`);

    // Fetch vehicles with location data, SCOPED to Samsara-enabled tenants only
    const { data: vehicles, error: vehiclesError } = await supabase
      .from('vehicles')
      .select('id, vehicle_number, last_location, speed, odometer, vin, provider_id, tenant_id')
      .not('last_location', 'is', null)
      .in('tenant_id', samsaraTenantIds);

    if (vehiclesError) {
      console.error('Error fetching vehicles:', vehiclesError);
      throw vehiclesError;
    }

    const vehicleIds = vehicles?.map(v => v.id) || [];
    
    // Fetch the LAST recorded location for each vehicle to compare
    const { data: lastLocations, error: lastLocError } = await supabase
      .from('vehicle_location_history')
      .select('vehicle_id, latitude, longitude, speed, recorded_at')
      .in('vehicle_id', vehicleIds)
      .order('recorded_at', { ascending: false });

    if (lastLocError) {
      console.warn('Error fetching last locations:', lastLocError);
    }

    // Build a map of vehicle_id -> last location (most recent only)
    const lastLocationMap = new Map<string, {
      latitude: number;
      longitude: number;
      speed: number | null;
      recorded_at: string;
    }>();
    
    for (const loc of lastLocations || []) {
      if (!lastLocationMap.has(loc.vehicle_id)) {
        lastLocationMap.set(loc.vehicle_id, loc);
      }
    }

    console.log(`Found ${vehicles?.length || 0} vehicles, ${lastLocationMap.size} with history`);

    // If Samsara is available, fetch fresh data
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
          console.log(`📡 Fetched ${statsData.data?.length || 0} vehicles from Samsara`);
          
          for (const vehicle of statsData.data || []) {
            if (vehicle.vin) samsaraData[vehicle.vin] = vehicle;
            if (vehicle.id) samsaraData[vehicle.id] = vehicle;
          }
        }
      } catch (samsaraError) {
        console.warn('Samsara API temporarily unavailable:', samsaraError);
      }
    }

    const locationsToInsert: any[] = [];
    const skippedVehicles: string[] = [];
    const now = new Date();
    const nowISO = now.toISOString();

    for (const vehicle of vehicles || []) {
      let latitude: number | null = null;
      let longitude: number | null = null;
      let speed = vehicle.speed || 0;
      let odometer = vehicle.odometer;
      let formattedLocation: string | null = null;
      let heading: number | null = null;

      // Parse current location
      if (vehicle.last_location) {
        const [latStr, lngStr] = vehicle.last_location.split(',').map((s: string) => s.trim());
        latitude = parseFloat(latStr);
        longitude = parseFloat(lngStr);
      }

      // Check for fresh Samsara data
      const samsaraVehicle = samsaraData[vehicle.vin] || samsaraData[vehicle.provider_id];
      if (samsaraVehicle) {
        // Samsara returns gps as an array, use gps[0] for latest reading
        const gps = samsaraVehicle.gps?.[0];
        if (gps?.latitude && gps?.longitude) {
          latitude = gps.latitude;
          longitude = gps.longitude;
          speed = gps.speedMilesPerHour || speed;
          // Get reverse-geocoded location from Samsara (free with GPS data)
          formattedLocation = gps.reverseGeo?.formattedLocation || null;
          // Get heading/bearing from Samsara (0-360 degrees)
          heading = gps.headingDegrees !== undefined ? Math.round(gps.headingDegrees) : null;
        }
        if (samsaraVehicle.obdOdometerMeters?.value) {
          odometer = samsaraVehicle.obdOdometerMeters.value * 0.000621371;
        }
      }

      if (!latitude || !longitude || isNaN(latitude) || isNaN(longitude)) {
        continue;
      }

      // SMART FILTERING: Decide whether to write
      const lastLoc = lastLocationMap.get(vehicle.id);
      let shouldWrite = true;
      let reason = 'new_vehicle';

      if (lastLoc) {
        const timeSinceLastWrite = now.getTime() - new Date(lastLoc.recorded_at).getTime();
        const hasMoved = hasMovedSignificantly(latitude, longitude, lastLoc.latitude, lastLoc.longitude);
        const isMoving = speed > MOVING_SPEED_THRESHOLD;
        const wasMoving = (lastLoc.speed || 0) > MOVING_SPEED_THRESHOLD;
        const statusChanged = isMoving !== wasMoving;

        if (hasMoved) {
          reason = 'moved';
        } else if (statusChanged) {
          reason = 'status_change';
        } else if (timeSinceLastWrite > MAX_PARKED_INTERVAL_MS) {
          reason = 'max_interval';
        } else {
          // Vehicle hasn't moved, status same, and within interval - SKIP
          shouldWrite = false;
          skippedVehicles.push(vehicle.vehicle_number);
        }
      }

      if (shouldWrite) {
        locationsToInsert.push({
          vehicle_id: vehicle.id,
          latitude,
          longitude,
          speed,
          odometer,
          heading,
          recorded_at: nowISO,
          formatted_location: formattedLocation,
        });
      }
    }

    console.log(`✅ Writing ${locationsToInsert.length} locations, ⏭️ skipped ${skippedVehicles.length} (parked/unchanged)`);
    if (skippedVehicles.length > 0) {
      console.log(`   Skipped vehicles: ${skippedVehicles.join(', ')}`);
    }

    if (locationsToInsert.length > 0) {
      const { error: insertError } = await supabase
        .from('vehicle_location_history')
        .insert(locationsToInsert);

      if (insertError) {
        console.error('Error inserting locations:', insertError);
        throw insertError;
      }
    }

    // Clean up old data (keep 8 days)
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
        skipped: skippedVehicles.length,
        total_vehicles: vehicles?.length || 0,
        timestamp: nowISO,
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
