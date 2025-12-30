import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';
import { assertFeatureEnabled } from '../_shared/assertFeatureEnabled.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Rate limiting: max API calls per minute per IP
const RATE_LIMIT_PER_MINUTE = 60;
const DAILY_API_LIMIT = 5000; // Max new API calls per day

// In-memory rate limit tracking (resets on function cold start)
const rateLimitMap = new Map<string, { count: number; resetTime: number }>();

function normalizeLocationKey(query: string): string {
  return query
    .toUpperCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/[.,]/g, '')
    .replace(/\s+(USA|US|UNITED STATES)$/i, '');
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  
  if (!entry || now > entry.resetTime) {
    rateLimitMap.set(ip, { count: 1, resetTime: now + 60000 });
    return true;
  }
  
  if (entry.count >= RATE_LIMIT_PER_MINUTE) {
    return false;
  }
  
  entry.count++;
  return true;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const clientIp = req.headers.get('x-forwarded-for') || 'unknown';
    const authHeader = req.headers.get('Authorization');
    
    // Check rate limit first (before parsing body)
    if (!checkRateLimit(clientIp)) {
      console.warn(`Rate limit exceeded for IP: ${clientIp}`);
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded. Please slow down.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const requestBody = await req.json();
    const { query, city, state, zip } = requestBody;
    
    // Build location query
    let locationQuery = query;
    if (!locationQuery && (city || state || zip)) {
      locationQuery = [city, state, zip].filter(Boolean).join(', ');
    }
    
    if (!locationQuery) {
      return new Response(
        JSON.stringify({ error: 'No location query provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Feature gate: derive tenant from auth and check geocoding_enabled
    // This blocks the API call BEFORE any expensive operations
    const gateResult = await assertFeatureEnabled({
      flag_key: 'geocoding_enabled',
      authHeader,
    });
    
    if (!gateResult.allowed) {
      console.log(`[geocode] Feature disabled: ${gateResult.reason}`);
      return gateResult.response!;
    }

    const normalizedKey = normalizeLocationKey(locationQuery);
    console.log(`📍 Geocode request: "${locationQuery}" -> normalized: "${normalizedKey}" (tenant: ${gateResult.tenant_id})`);

    // Now initialize Supabase for cache operations
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Check cache first
    const { data: cached } = await supabase
      .from('geocode_cache')
      .select('latitude, longitude, city, state, id, hit_count')
      .eq('location_key', normalizedKey)
      .maybeSingle();

    if (cached) {
      console.log(`✅ Cache HIT: ${normalizedKey}`);
      
      // Track this as a cache hit for usage counting
      supabase.from('geocoding_api_tracking').insert({
        location_query: normalizedKey,
        was_cache_hit: true,
        month_year: new Date().toISOString().slice(0, 7)
      }).then(() => {});
      
      // Increment hit count (fire and forget)
      supabase
        .from('geocode_cache')
        .update({ hit_count: (cached.hit_count || 1) + 1 })
        .eq('id', cached.id)
        .then(() => {});

      return new Response(
        JSON.stringify({
          lat: cached.latitude,
          lng: cached.longitude,
          city: cached.city,
          state: cached.state,
          cached: true
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check daily API limit
    const today = new Date().toISOString().slice(0, 10);
    const { count: todayCalls } = await supabase
      .from('geocode_cache')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${today}T00:00:00Z`);

    if ((todayCalls || 0) >= DAILY_API_LIMIT) {
      console.warn(`Daily API limit reached: ${todayCalls} calls today`);
      return new Response(
        JSON.stringify({ error: 'Daily geocoding limit reached. Try again tomorrow.' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Cache miss - call Mapbox API
    const mapboxToken = Deno.env.get('VITE_MAPBOX_TOKEN');
    if (!mapboxToken) {
      return new Response(
        JSON.stringify({ error: 'Mapbox token not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`🌐 Cache MISS - calling Mapbox API for: ${normalizedKey}`);
    
    const encoded = encodeURIComponent(`${locationQuery}, USA`);
    const response = await fetch(
      `https://api.mapbox.com/geocoding/v5/mapbox.places/${encoded}.json?access_token=${mapboxToken}&country=US&limit=1`
    );

    if (!response.ok) {
      console.error(`Mapbox API error: ${response.status}`);
      return new Response(
        JSON.stringify({ error: 'Geocoding service error' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const data = await response.json();

    if (!data.features || data.features.length === 0) {
      console.warn(`No results for: ${locationQuery}`);
      return new Response(
        JSON.stringify({ error: 'Location not found', query: locationQuery }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const [lng, lat] = data.features[0].center;
    
    // Extract city and state from context
    let resultCity = city;
    let resultState = state;
    
    if (data.features[0].context) {
      for (const ctx of data.features[0].context) {
        if (ctx.id.startsWith('place.') && !resultCity) {
          resultCity = ctx.text;
        }
        if (ctx.id.startsWith('region.') && !resultState) {
          resultState = ctx.short_code?.replace('US-', '') || ctx.text;
        }
      }
    }

    const currentMonth = new Date().toISOString().slice(0, 7);

    // Track this as an actual Mapbox API call (cache miss = billable)
    await supabase.from('geocoding_api_tracking').insert({
      location_query: normalizedKey,
      was_cache_hit: false,
      month_year: currentMonth
    });

    // Save to cache
    await supabase.from('geocode_cache').upsert({
      location_key: normalizedKey,
      latitude: lat,
      longitude: lng,
      city: resultCity?.toUpperCase(),
      state: resultState?.toUpperCase(),
      month_created: currentMonth,
      hit_count: 1
    }, { onConflict: 'location_key' });

    console.log(`💾 Cached new location: ${normalizedKey} (${lat}, ${lng}) - API call tracked`);

    return new Response(
      JSON.stringify({
        lat,
        lng,
        city: resultCity,
        state: resultState,
        cached: false
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Geocode error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
