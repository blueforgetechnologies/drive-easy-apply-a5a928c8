import { supabase } from './supabase.js';

const MAPBOX_TOKEN = process.env.VITE_MAPBOX_TOKEN;

export interface Coordinates {
  lat: number;
  lng: number;
}

export interface CityStateResult {
  city: string;
  state: string;
}

/**
 * Geocode a city/state location using Mapbox, with caching.
 * Returns coordinates or null if geocoding fails.
 */
export async function geocodeLocation(
  city: string,
  state: string
): Promise<Coordinates | null> {
  if (!MAPBOX_TOKEN || !city || !state) return null;

  const locationKey = `${city.toLowerCase().trim()}, ${state.toLowerCase().trim()}`;

  try {
    // Check cache first
    const { data: cached } = await supabase
      .from('geocode_cache')
      .select('latitude, longitude, id, hit_count')
      .eq('location_key', locationKey)
      .maybeSingle();

    if (cached) {
      // Increment hit count (fire and forget)
      supabase
        .from('geocode_cache')
        .update({ hit_count: (cached.hit_count || 1) + 1 })
        .eq('id', cached.id)
        .then(() => {});

      console.log(`[geocode] Cache HIT: ${city}, ${state}`);
      return { lat: Number(cached.latitude), lng: Number(cached.longitude) };
    }

    // Cache miss - call Mapbox API
    const query = encodeURIComponent(`${city}, ${state}, USA`);
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&limit=1`
    );

    if (response.ok) {
      const data = await response.json() as { features?: Array<{ center?: [number, number] }> };
      if (data.features?.[0]?.center) {
        const coords: Coordinates = {
          lng: data.features[0].center[0],
          lat: data.features[0].center[1],
        };

        // Store in cache
        const currentMonth = new Date().toISOString().slice(0, 7);
        await supabase.from('geocode_cache').upsert(
          {
            location_key: locationKey,
            city: city.trim(),
            state: state.trim(),
            latitude: coords.lat,
            longitude: coords.lng,
            month_created: currentMonth,
          },
          { onConflict: 'location_key' }
        );

        console.log(`[geocode] Cache MISS (stored): ${city}, ${state}`);
        return coords;
      }
    }
  } catch (e) {
    console.error('[geocode] Error:', e);
  }
  return null;
}

/**
 * Lookup city from zip code using Mapbox.
 * Returns { city, state } or null if lookup fails.
 */
export async function lookupCityFromZip(
  zipCode: string,
  state?: string
): Promise<CityStateResult | null> {
  if (!MAPBOX_TOKEN || !zipCode) return null;

  try {
    const query = encodeURIComponent(`${zipCode}, USA`);
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${query}.json?access_token=${MAPBOX_TOKEN}&types=postcode&limit=1`
    );

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
