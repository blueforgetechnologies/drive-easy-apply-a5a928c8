import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface Stop {
  id: string;
  stop_sequence: number;
  stop_type: string;
  location_name: string;
  location_address: string;
  location_city: string;
  location_state: string;
  location_zip: string;
  scheduled_date: string | null;
  scheduled_time_start: string | null;
  scheduled_time_end: string | null;
  coordinates?: [number, number];
}

interface Break {
  location: string;
  coordinates: [number, number];
  afterStopIndex: number;
  duration: number; // minutes
  reason: string;
  cumulativeDriveTime: number;
}

interface FuelEmissionsData {
  estimatedFuelGallons: number;
  estimatedFuelCost: number;
  carbonEmissionsKg: number;
  carbonEmissionsLbs: number;
  fuelType: string;
  vehicleMpg: number;
}

interface OptimizationResult {
  optimizedSequence: Stop[];
  totalDistance: number;
  totalDuration: number;
  totalDriveTime: number;
  requiredBreaks: Break[];
  hosCompliant: boolean;
  isTeam: boolean;
  fuelEmissions?: FuelEmissionsData;
  savings: {
    distanceSaved: number;
    timeSaved: number;
  };
}

/**
 * SECURITY: Derive tenant_id from user's JWT to prevent cross-tenant data access
 */
async function deriveTenantFromAuth(authHeader: string | null): Promise<{ tenantId: string | null; userId: string | null; error?: Response }> {
  if (!authHeader) {
    return { tenantId: null, userId: null };
  }

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
  const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

  // Verify user with anon client
  const anonClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error: userError } = await anonClient.auth.getUser();
  if (userError || !user) {
    console.error('[optimize-route] Auth failed:', userError?.message);
    return {
      tenantId: null,
      userId: null,
      error: new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }),
    };
  }

  // Look up tenant membership
  const serviceClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
  const { data: membership } = await serviceClient
    .from('tenant_users')
    .select('tenant_id')
    .eq('user_id', user.id)
    .eq('status', 'active')
    .limit(1)
    .maybeSingle();

  return {
    tenantId: membership?.tenant_id ?? null,
    userId: user.id,
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { stops, isTeam = false, vehicleId } = await req.json();
    const MAPBOX_TOKEN = Deno.env.get('VITE_MAPBOX_TOKEN');
    const SUPABASE_URL = Deno.env.get('SUPABASE_URL');
    const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    
    if (!MAPBOX_TOKEN) {
      console.error('VITE_MAPBOX_TOKEN not configured');
      return new Response(
        JSON.stringify({ error: 'Mapbox token not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
      console.error('Supabase credentials not configured');
      return new Response(
        JSON.stringify({ error: 'Database not configured' }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!stops || stops.length < 2) {
      return new Response(
        JSON.stringify({ error: 'At least 2 stops required for optimization' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // SECURITY: Derive tenant from user's auth context for vehicle lookup
    const authHeader = req.headers.get('authorization');
    const { tenantId, userId, error: authError } = await deriveTenantFromAuth(authHeader);
    if (authError) {
      return authError;
    }

    console.log(`[optimize-route] User=${userId}, Tenant=${tenantId}, Stops=${stops.length}`);

    // Initialize Supabase client for cache access
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Helper function to normalize location keys for cache
    const normalizeLocationKey = (query: string): string => {
      return query
        .toUpperCase()
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[.,]/g, '')
        .replace(/\s+(USA|US|UNITED STATES)$/i, '');
    };

    // Helper function to geocode with cache
    const geocodeWithCache = async (query: string): Promise<[number, number] | null> => {
      const normalizedKey = normalizeLocationKey(query);
      
      // Check cache first
      const { data: cached } = await supabase
        .from('geocode_cache')
        .select('latitude, longitude, id, hit_count')
        .eq('location_key', normalizedKey)
        .maybeSingle();

      if (cached) {
        console.log(`📍 Cache HIT: ${normalizedKey}`);
        // Increment hit count (fire and forget)
        supabase
          .from('geocode_cache')
          .update({ hit_count: (cached.hit_count || 1) + 1 })
          .eq('id', cached.id)
          .then(() => {});
        return [cached.longitude, cached.latitude];
      }

      // Cache miss - call Mapbox API
      console.log(`🌐 Cache MISS - calling Mapbox: ${normalizedKey}`);
      const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query + ', USA')}.json?access_token=${MAPBOX_TOKEN}&country=US&limit=1`;
      const geocodeResponse = await fetch(geocodeUrl);
      const geocodeData = await geocodeResponse.json();
      
      if (geocodeData.features && geocodeData.features.length > 0) {
        const [lng, lat] = geocodeData.features[0].center;
        
        // Save to cache
        const currentMonth = new Date().toISOString().slice(0, 7);
        await supabase.from('geocode_cache').upsert({
          location_key: normalizedKey,
          latitude: lat,
          longitude: lng,
          month_created: currentMonth,
          hit_count: 1
        }, { onConflict: 'location_key' });
        
        console.log(`💾 Cached: ${normalizedKey}`);
        return [lng, lat];
      }
      
      return null;
    };

    // Step 1: Geocode all stops to get coordinates (using cache)
    const stopsWithCoords: Stop[] = [];
    let cacheHits = 0;
    let cacheMisses = 0;
    
    for (const stop of stops) {
      const query = `${stop.location_address || ''} ${stop.location_city || ''} ${stop.location_state || ''} ${stop.location_zip || ''}`.trim();
      
      if (!query) {
        console.warn(`Skipping stop ${stop.id} - no address information`);
        continue;
      }

      try {
        const coords = await geocodeWithCache(query);
        if (coords) {
          stopsWithCoords.push({
            ...stop,
            coordinates: coords as [number, number]
          });
        } else {
          console.warn(`Could not geocode stop ${stop.id}`);
        }
      } catch (error) {
        console.error(`Geocoding error for stop ${stop.id}:`, error);
      }
    }
    
    console.log(`📊 Geocoding: ${stopsWithCoords.length} stops resolved`);

    if (stopsWithCoords.length < 2) {
      return new Response(
        JSON.stringify({ error: 'Could not geocode enough stops for optimization' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Step 2: Separate pickups and deliveries
    const pickups = stopsWithCoords.filter(s => s.stop_type === 'pickup');
    const deliveries = stopsWithCoords.filter(s => s.stop_type === 'delivery');

    console.log(`Found ${pickups.length} pickups and ${deliveries.length} deliveries`);

    // Step 3: Optimize pickups first, then deliveries
    const optimizedPickups = await optimizeStopGroup(pickups, MAPBOX_TOKEN);
    const optimizedDeliveries = await optimizeStopGroup(deliveries, MAPBOX_TOKEN);

    // Step 4: Combine optimized sequences
    const optimizedSequence = [...optimizedPickups, ...optimizedDeliveries];

    // Reassign sequence numbers
    optimizedSequence.forEach((stop, index) => {
      stop.stop_sequence = index + 1;
    });

    // Step 5: Calculate total distance and duration for optimized route
    const optimizedMetrics = await calculateRouteMetrics(optimizedSequence, MAPBOX_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    
    // Step 6: Calculate HOS compliance and required breaks
    const hosAnalysis = calculateHOSCompliance(optimizedSequence, optimizedMetrics, isTeam);
    
    // Step 7: Calculate fuel costs and emissions if vehicle data is available
    // SECURITY: Only fetch vehicle if it belongs to user's tenant
    let fuelEmissions: FuelEmissionsData | undefined;
    if (vehicleId && tenantId) {
      try {
        // Use tenant-scoped query to prevent cross-tenant vehicle access
        const { data: vehicleData, error: vehicleError } = await supabase
          .from('vehicles')
          .select('fuel_type, fuel_efficiency_mpg, asset_type, tenant_id')
          .eq('id', vehicleId)
          .eq('tenant_id', tenantId) // SECURITY: Enforce tenant isolation
          .maybeSingle();
        
        if (vehicleError) {
          console.error('[optimize-route] Vehicle query error:', vehicleError);
        } else if (vehicleData) {
          console.log(`[optimize-route] Vehicle ${vehicleId} verified for tenant ${tenantId}`);
          fuelEmissions = calculateFuelEmissions(
            optimizedMetrics.distance,
            vehicleData.fuel_type || 'diesel',
            vehicleData.fuel_efficiency_mpg || 6.5,
            vehicleData.asset_type || 'truck'
          );
        } else {
          console.warn(`[optimize-route] Vehicle ${vehicleId} not found for tenant ${tenantId} - possible cross-tenant attempt`);
        }
      } catch (error) {
        console.error('Error fetching vehicle data:', error);
      }
    } else if (vehicleId && !tenantId) {
      console.warn(`[optimize-route] Vehicle lookup skipped - no tenant context for vehicleId=${vehicleId}`);
    }
    
    // Step 8: Calculate original route metrics for comparison
    const originalSequence = [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
    const originalStopsWithCoords = originalSequence
      .map(stop => stopsWithCoords.find(s => s.id === stop.id))
      .filter(s => s !== undefined) as Stop[];
    const originalMetrics = await calculateRouteMetrics(originalStopsWithCoords, MAPBOX_TOKEN, SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const result: OptimizationResult = {
      optimizedSequence,
      totalDistance: optimizedMetrics.distance,
      totalDuration: optimizedMetrics.duration,
      totalDriveTime: optimizedMetrics.duration,
      requiredBreaks: hosAnalysis.breaks,
      hosCompliant: hosAnalysis.compliant,
      isTeam,
      fuelEmissions,
      savings: {
        distanceSaved: Math.max(0, originalMetrics.distance - optimizedMetrics.distance),
        timeSaved: Math.max(0, originalMetrics.duration - optimizedMetrics.duration),
      }
    };

    console.log('Optimization complete:', {
      original: originalMetrics,
      optimized: optimizedMetrics,
      savings: result.savings
    });

    return new Response(
      JSON.stringify(result),
      { 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  } catch (error) {
    console.error('Error in optimize-route function:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});

async function optimizeStopGroup(stops: Stop[], mapboxToken: string): Promise<Stop[]> {
  if (stops.length <= 1) return stops;

  // Use nearest neighbor algorithm with time window constraints
  const unvisited = [...stops];
  const optimized: Stop[] = [];

  // Start with the stop that has the earliest time window
  let current = unvisited.reduce((earliest, stop) => {
    const earliestTime = parseTimeWindow(earliest.scheduled_date, earliest.scheduled_time_start);
    const stopTime = parseTimeWindow(stop.scheduled_date, stop.scheduled_time_start);
    return stopTime < earliestTime ? stop : earliest;
  });

  optimized.push(current);
  unvisited.splice(unvisited.indexOf(current), 1);

  // Greedily select nearest unvisited stop that respects time windows
  while (unvisited.length > 0) {
    let nearestStop: Stop | null = null;
    let shortestDistance = Infinity;

    for (const stop of unvisited) {
      const distance = calculateHaversineDistance(
        current.coordinates!,
        stop.coordinates!
      );

      // Consider time window feasibility
      const isTimeFeasible = checkTimeFeasibility(current, stop);

      if (distance < shortestDistance && isTimeFeasible) {
        shortestDistance = distance;
        nearestStop = stop;
      }
    }

    // If no time-feasible stop found, just pick the nearest one
    if (!nearestStop) {
      nearestStop = unvisited.reduce((nearest, stop) => {
        const nearestDist = calculateHaversineDistance(current.coordinates!, nearest.coordinates!);
        const stopDist = calculateHaversineDistance(current.coordinates!, stop.coordinates!);
        return stopDist < nearestDist ? stop : nearest;
      });
    }

    optimized.push(nearestStop);
    unvisited.splice(unvisited.indexOf(nearestStop), 1);
    current = nearestStop;
  }

  return optimized;
}

async function calculateRouteMetrics(
  stops: Stop[], 
  mapboxToken: string, 
  supabaseUrl?: string, 
  supabaseKey?: string
): Promise<{ distance: number; duration: number }> {
  if (stops.length < 2) return { distance: 0, duration: 0 };

  const coordinates = stops
    .map(s => s.coordinates)
    .filter(c => c !== undefined)
    .map(c => `${c![0]},${c![1]}`)
    .join(';');

  try {
    const directionsUrl = `https://api.mapbox.com/directions/v5/mapbox/driving/${coordinates}?access_token=${mapboxToken}&overview=full&geometries=geojson`;
    const response = await fetch(directionsUrl);
    const data = await response.json();

    // Track Directions API call
    if (supabaseUrl && supabaseKey) {
      try {
        const currentMonth = new Date().toISOString().slice(0, 7);
        await fetch(`${supabaseUrl}/rest/v1/directions_api_tracking`, {
          method: 'POST',
          headers: {
            'apikey': supabaseKey,
            'Authorization': `Bearer ${supabaseKey}`,
            'Content-Type': 'application/json',
            'Prefer': 'return=minimal'
          },
          body: JSON.stringify({
            month_year: currentMonth
          })
        });
      } catch (trackingError) {
        console.error('Failed to track Directions API call:', trackingError);
      }
    }

    if (data.routes && data.routes.length > 0) {
      return {
        distance: data.routes[0].distance / 1609.34, // Convert meters to miles
        duration: data.routes[0].duration / 60, // Convert seconds to minutes
      };
    }
  } catch (error) {
    console.error('Error calculating route metrics:', error);
  }

  return { distance: 0, duration: 0 };
}

function calculateHaversineDistance(coord1: [number, number], coord2: [number, number]): number {
  const R = 3959; // Earth's radius in miles
  const dLat = toRad(coord2[1] - coord1[1]);
  const dLon = toRad(coord2[0] - coord1[0]);
  const lat1 = toRad(coord1[1]);
  const lat2 = toRad(coord2[1]);

  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.sin(dLon / 2) * Math.sin(dLon / 2) * Math.cos(lat1) * Math.cos(lat2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function toRad(degrees: number): number {
  return degrees * (Math.PI / 180);
}

function parseTimeWindow(date: string | null, time: string | null): number {
  if (!date) return 0;
  const dateTime = time ? `${date}T${time}` : date;
  return new Date(dateTime).getTime();
}

function checkTimeFeasibility(current: Stop, next: Stop): boolean {
  // If no time constraints, always feasible
  if (!next.scheduled_date || !next.scheduled_time_start) return true;

  const nextStartTime = parseTimeWindow(next.scheduled_date, next.scheduled_time_start);
  
  // If current has no time info, assume feasible
  if (!current.scheduled_date) return true;

  const currentEndTime = current.scheduled_time_end
    ? parseTimeWindow(current.scheduled_date, current.scheduled_time_end)
    : parseTimeWindow(current.scheduled_date, current.scheduled_time_start);

  // Next stop should start after current stop ends (with some buffer for travel)
  // Assuming average 1 hour travel time between stops
  return nextStartTime >= currentEndTime + (60 * 60 * 1000);
}

function calculateFuelEmissions(
  distanceMiles: number,
  fuelType: string,
  mpg: number,
  assetType: string
): FuelEmissionsData {
  // Calculate fuel consumption
  const fuelGallons = distanceMiles / mpg;
  
  // Fuel prices (national average estimates)
  const fuelPrices: { [key: string]: number } = {
    'diesel': 3.85,
    'gasoline': 3.25,
    'electric': 0.13, // per kWh, converted later
    'hybrid': 3.50,
    'cng': 2.50,
    'lng': 2.25,
  };
  
  // Carbon emissions factors (kg CO2 per gallon)
  const emissionFactors: { [key: string]: number } = {
    'diesel': 10.21,  // kg CO2 per gallon
    'gasoline': 8.89,
    'electric': 0.0,   // Zero direct emissions (electricity generation emissions not counted here)
    'hybrid': 6.67,    // Average between gas and electric
    'cng': 6.37,
    'lng': 6.37,
  };
  
  const pricePerUnit = fuelPrices[fuelType.toLowerCase()] || fuelPrices['diesel'];
  const emissionFactor = emissionFactors[fuelType.toLowerCase()] || emissionFactors['diesel'];
  
  // For electric vehicles, calculate differently (kWh instead of gallons)
  let estimatedCost: number;
  let carbonKg: number;
  
  if (fuelType.toLowerCase() === 'electric') {
    // Assume 2 kWh per mile for electric trucks
    const kWh = distanceMiles * 2;
    estimatedCost = kWh * pricePerUnit;
    carbonKg = 0; // Direct emissions
  } else {
    estimatedCost = fuelGallons * pricePerUnit;
    carbonKg = fuelGallons * emissionFactor;
  }
  
  return {
    estimatedFuelGallons: fuelGallons,
    estimatedFuelCost: estimatedCost,
    carbonEmissionsKg: carbonKg,
    carbonEmissionsLbs: carbonKg * 2.20462, // Convert kg to lbs
    fuelType: fuelType,
    vehicleMpg: mpg,
  };
}

interface HOSAnalysis {
  compliant: boolean;
  breaks: Break[];
  totalDriveTime: number;
  violations: string[];
}

function calculateHOSCompliance(
  stops: Stop[], 
  routeMetrics: { distance: number; duration: number },
  isTeam: boolean
): HOSAnalysis {
  const breaks: Break[] = [];
  const violations: string[] = [];
  
  // HOS regulations (in minutes)
  const SOLO_MAX_DRIVE_TIME = 11 * 60; // 11 hours
  const SOLO_MAX_ON_DUTY = 14 * 60; // 14 hours
  const SOLO_BREAK_AFTER = 8 * 60; // 30-min break after 8 hours
  const SOLO_BREAK_DURATION = 30; // 30 minutes
  const SOLO_REST_PERIOD = 10 * 60; // 10 hours off-duty
  
  // Team drivers can alternate, so different rules
  const TEAM_MAX_DRIVE_TIME = 20 * 60; // Can drive longer with alternating drivers
  const TEAM_BREAK_DURATION = 30; // Still need rest breaks
  
  if (stops.length < 2) {
    return { compliant: true, breaks: [], totalDriveTime: routeMetrics.duration, violations: [] };
  }

  const totalDriveTime = routeMetrics.duration;
  let cumulativeDriveTime = 0;
  let lastBreakTime = 0;
  
  if (isTeam) {
    // Team operation - more flexible HOS
    // Teams can drive continuously with alternating drivers
    // But still need periodic rest breaks
    
    if (totalDriveTime > TEAM_MAX_DRIVE_TIME) {
      // Need a major rest break
      const breakPoint = Math.floor(stops.length / 2);
      if (breakPoint > 0 && breakPoint < stops.length) {
        const stop = stops[breakPoint];
        breaks.push({
          location: `${stop.location_name || stop.location_city}`,
          coordinates: stop.coordinates!,
          afterStopIndex: breakPoint,
          duration: SOLO_REST_PERIOD,
          reason: 'Team rest period - 10 hour break',
          cumulativeDriveTime: TEAM_MAX_DRIVE_TIME
        });
      }
    } else if (totalDriveTime > SOLO_BREAK_AFTER) {
      // Need periodic breaks even for teams
      const numberOfBreaks = Math.floor(totalDriveTime / SOLO_BREAK_AFTER);
      for (let i = 1; i <= numberOfBreaks; i++) {
        const breakPoint = Math.floor((stops.length * i) / (numberOfBreaks + 1));
        if (breakPoint > 0 && breakPoint < stops.length) {
          const stop = stops[breakPoint];
          breaks.push({
            location: `${stop.location_name || stop.location_city}`,
            coordinates: stop.coordinates!,
            afterStopIndex: breakPoint,
            duration: TEAM_BREAK_DURATION,
            reason: 'Team rest break - 30 minutes',
            cumulativeDriveTime: (totalDriveTime * i) / (numberOfBreaks + 1)
          });
        }
      }
    }
    
    return {
      compliant: totalDriveTime <= TEAM_MAX_DRIVE_TIME + SOLO_REST_PERIOD,
      breaks,
      totalDriveTime,
      violations
    };
  } else {
    // Solo driver - strict HOS regulations
    const segmentDuration = totalDriveTime / (stops.length - 1);
    
    for (let i = 1; i < stops.length; i++) {
      cumulativeDriveTime += segmentDuration;
      
      // Check if 30-minute break is needed (after 8 hours of driving)
      if (cumulativeDriveTime - lastBreakTime >= SOLO_BREAK_AFTER) {
        const stop = stops[i];
        breaks.push({
          location: `${stop.location_name || stop.location_city}`,
          coordinates: stop.coordinates!,
          afterStopIndex: i,
          duration: SOLO_BREAK_DURATION,
          reason: '30-minute break required (8+ hours driving)',
          cumulativeDriveTime
        });
        lastBreakTime = cumulativeDriveTime;
      }
      
      // Check if approaching 11-hour drive limit
      if (cumulativeDriveTime >= SOLO_MAX_DRIVE_TIME) {
        const stop = stops[i];
        breaks.push({
          location: `${stop.location_name || stop.location_city}`,
          coordinates: stop.coordinates!,
          afterStopIndex: i,
          duration: SOLO_REST_PERIOD,
          reason: '10-hour rest period required (11-hour drive limit reached)',
          cumulativeDriveTime
        });
        violations.push('11-hour driving limit reached - 10-hour rest required');
        cumulativeDriveTime = 0; // Reset after rest
        lastBreakTime = 0;
      }
      
      // Check 14-hour on-duty limit
      const totalOnDutyTime = cumulativeDriveTime + (breaks.length * SOLO_BREAK_DURATION);
      if (totalOnDutyTime >= SOLO_MAX_ON_DUTY) {
        violations.push('14-hour on-duty limit would be exceeded');
      }
    }
    
    const totalTimeWithBreaks = totalDriveTime + (breaks.reduce((sum, b) => sum + b.duration, 0));
    
    return {
      compliant: violations.length === 0 && totalDriveTime <= SOLO_MAX_DRIVE_TIME,
      breaks,
      totalDriveTime,
      violations
    };
  }
}
