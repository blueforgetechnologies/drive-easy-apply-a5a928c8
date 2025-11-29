import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

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

interface OptimizationResult {
  optimizedSequence: Stop[];
  totalDistance: number;
  totalDuration: number;
  savings: {
    distanceSaved: number;
    timeSaved: number;
  };
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { stops } = await req.json();
    const MAPBOX_TOKEN = Deno.env.get('VITE_MAPBOX_TOKEN');
    
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

    if (!stops || stops.length < 2) {
      return new Response(
        JSON.stringify({ error: 'At least 2 stops required for optimization' }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log(`Optimizing route for ${stops.length} stops`);

    // Step 1: Geocode all stops to get coordinates
    const stopsWithCoords: Stop[] = [];
    for (const stop of stops) {
      const query = `${stop.location_address || ''} ${stop.location_city || ''} ${stop.location_state || ''} ${stop.location_zip || ''}`.trim();
      
      if (!query) {
        console.warn(`Skipping stop ${stop.id} - no address information`);
        continue;
      }

      try {
        const geocodeUrl = `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(query)}.json?access_token=${MAPBOX_TOKEN}&limit=1`;
        const geocodeResponse = await fetch(geocodeUrl);
        const geocodeData = await geocodeResponse.json();
        
        if (geocodeData.features && geocodeData.features.length > 0) {
          stopsWithCoords.push({
            ...stop,
            coordinates: geocodeData.features[0].center as [number, number]
          });
        } else {
          console.warn(`Could not geocode stop ${stop.id}`);
        }
      } catch (error) {
        console.error(`Geocoding error for stop ${stop.id}:`, error);
      }
    }

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
    const optimizedMetrics = await calculateRouteMetrics(optimizedSequence, MAPBOX_TOKEN);
    
    // Step 6: Calculate original route metrics for comparison
    const originalSequence = [...stops].sort((a, b) => a.stop_sequence - b.stop_sequence);
    const originalStopsWithCoords = originalSequence
      .map(stop => stopsWithCoords.find(s => s.id === stop.id))
      .filter(s => s !== undefined) as Stop[];
    const originalMetrics = await calculateRouteMetrics(originalStopsWithCoords, MAPBOX_TOKEN);

    const result: OptimizationResult = {
      optimizedSequence,
      totalDistance: optimizedMetrics.distance,
      totalDuration: optimizedMetrics.duration,
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

async function calculateRouteMetrics(stops: Stop[], mapboxToken: string): Promise<{ distance: number; duration: number }> {
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
