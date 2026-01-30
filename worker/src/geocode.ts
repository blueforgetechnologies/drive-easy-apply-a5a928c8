import { supabase } from './supabase.js';

const MAPBOX_TOKEN = process.env.VITE_MAPBOX_TOKEN;

// Timeout for geocode operations
const GEOCODE_TIMEOUT_MS = 10_000;

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface CityStateResult {
  city: string;
  state: string;
}

/**
 * Helper to wrap a promise with a timeout using Promise.race
 */
async function withGeoTimeout<T>(
  promiseLike: PromiseLike<T> | Promise<T>,
  timeoutMs: number,
  stepName: string
): Promise<T> {
  let timeoutId: ReturnType<typeof setTimeout> | undefined;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(`TIMEOUT (${timeoutMs}ms) at ${stepName}`));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([
      Promise.resolve(promiseLike),
      timeoutPromise,
    ]);
    if (timeoutId) clearTimeout(timeoutId);
    return result;
  } catch (e) {
    if (timeoutId) clearTimeout(timeoutId);
    throw e;
  }
}

/**
 * Geocode a city/state location using Mapbox, with caching.
 * Returns coordinates or null if geocoding fails.
 * Now includes timeout protection to prevent indefinite hangs.
 */
export async function geocodeLocation(
  city: string,
  state: string
): Promise<Coordinates | null> {
  if (!MAPBOX_TOKEN || !city || !state) return null;

  const locationKey = `${city.toLowerCase().trim()}, ${state.toLowerCase().trim()}`;

  try {
    // Check cache first with timeout
    let cached: { latitude: number; longitude: number; id: string; hit_count: number } | null = null;
    try {
      const { data } = await withGeoTimeout(
        supabase
          .from('geocode_cache')
          .select('latitude, longitude, id, hit_count')
          .eq('location_key', locationKey)
          .maybeSingle() as Promise<{ data: { latitude: number; longitude: number; id: string; hit_count: number } | null }>,
        GEOCODE_TIMEOUT_MS,
        'geocode-cache-lookup'
      );
      cached = data;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('TIMEOUT')) {
        console.error(`[geocode] Cache lookup TIMEOUT for ${city}, ${state}`);
        return null;
      }
      throw e;
    }

    if (cached) {
      // Increment hit count (fire and forget - no timeout needed)
      supabase
        .from('geocode_cache')
        .update({ hit_count: (cached.hit_count || 1) + 1 })
        .eq('id', cached.id)
        .then(() => {});

      console.log(`[geocode] Cache HIT: ${city}, ${state}`);
      return { lat: Number(cached.latitude), lng: Number(cached.longitude) };
    }

    // Cache miss - call Mapbox API with timeout
    const query = encodeURIComponent(`${city}, ${state}, USA`);
    const controller = new AbortController();
    const fetchTimeoutId = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
    
    try {
      const response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&limit=1`,
        { signal: controller.signal }
      );
      clearTimeout(fetchTimeoutId);

      if (response.ok) {
        const data = await response.json() as { features?: Array<{ center?: [number, number] }> };
        if (data.features?.[0]?.center) {
          const coords: Coordinates = {
            lng: data.features[0].center[0],
            lat: data.features[0].center[1],
          };

          // Store in cache (fire and forget - no timeout needed for cache write)
          const currentMonth = new Date().toISOString().slice(0, 7);
          supabase.from('geocode_cache').upsert(
            {
              location_key: locationKey,
              city: city.trim(),
              state: state.trim(),
              latitude: coords.lat,
              longitude: coords.lng,
              month_created: currentMonth,
            },
            { onConflict: 'location_key' }
          ).then(() => {});

          console.log(`[geocode] Cache MISS (stored): ${city}, ${state}`);
          return coords;
        }
      }
    } catch (e) {
      clearTimeout(fetchTimeoutId);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('abort')) {
        console.error(`[geocode] Mapbox API TIMEOUT for ${city}, ${state}`);
        return null;
      }
      throw e;
    }
  } catch (e) {
    console.error('[geocode] Error:', e);
  }
  return null;
}

/**
 * Lookup city from zip code using Mapbox.
 * Returns { city, state } or null if lookup fails.
 * Now includes timeout protection to prevent indefinite hangs.
 */
export async function lookupCityFromZip(
  zipCode: string,
  state?: string
): Promise<CityStateResult | null> {
  if (!MAPBOX_TOKEN || !zipCode) return null;

  try {
    const query = encodeURIComponent(`${zipCode}, USA`);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), GEOCODE_TIMEOUT_MS);
    
    let response: Response;
    try {
      response = await fetch(
        `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&types=postcode&limit=1`,
        { signal: controller.signal }
      );
      clearTimeout(timeoutId);
    } catch (e) {
      clearTimeout(timeoutId);
      const msg = e instanceof Error ? e.message : String(e);
      if (msg.includes('abort')) {
        console.error(`[geocode] Zip lookup TIMEOUT for ${zipCode}`);
        return null;
      }
      throw e;
    }

    if (response.ok) {
      const data = await response.json() as { features?: Array<{ place_name?: string; context?: Array<{ id?: string; text?: string; short_code?: string }> }> };
      if (data.features?.[0]) {
        const feature = data.features[0];
        let city = '';
        let foundState = state || '';

        for (const ctx of feature.context || []) {
          if (ctx.id?.startsWith('place.') && ctx.text) {
            city = ctx.text;
          }
          if (ctx.id?.startsWith('region.') && ctx.short_code) {
            foundState = ctx.short_code.replace('US-', '');
          }
        }

        if (!city && feature.place_name) {
          const parts = feature.place_name.split(',');
          if (parts.length >= 2) {
            city = parts[0].replace(zipCode, '').trim();
          }
        }

        if (city && foundState) {
          console.log(`[geocode] Zip ${zipCode} -> ${city}, ${foundState}`);
          return { city, state: foundState };
        }
      }
    }
  } catch (e) {
    console.error('[geocode] Zip lookup error:', e);
  }
  return null;
}
