import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get previous month (the month we're closing out)
    const now = new Date();
    const previousMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const monthYear = `${previousMonth.getFullYear()}-${String(previousMonth.getMonth() + 1).padStart(2, '0')}`;

    console.log(`📊 Snapshotting usage for ${monthYear}`);

    // Count geocoding API calls for the month (unique locations created that month)
    const { count: geocodingCalls } = await supabase
      .from('geocode_cache')
      .select('*', { count: 'exact', head: true })
      .eq('month_created', monthYear);

    // Count map loads for the month
    const { count: mapLoads } = await supabase
      .from('map_load_tracking')
      .select('*', { count: 'exact', head: true })
      .eq('month_year', monthYear);

    // Calculate costs
    const GEOCODING_FREE_TIER = 100000;
    const GEOCODING_RATE = 0.75; // per 1,000
    const MAP_LOADS_FREE_TIER = 50000;
    const MAP_LOADS_RATE = 5.00; // per 1,000

    const geocodingCount = geocodingCalls || 0;
    const mapLoadsCount = mapLoads || 0;

    const billableGeocoding = Math.max(0, geocodingCount - GEOCODING_FREE_TIER);
    const geocodingCost = (billableGeocoding / 1000) * GEOCODING_RATE;

    const billableMapLoads = Math.max(0, mapLoadsCount - MAP_LOADS_FREE_TIER);
    const mapLoadsCost = (billableMapLoads / 1000) * MAP_LOADS_RATE;

    const totalCost = geocodingCost + mapLoadsCost;

    // Upsert monthly usage record
    const { error: upsertError } = await supabase
      .from('mapbox_monthly_usage')
      .upsert({
        month_year: monthYear,
        geocoding_api_calls: geocodingCount,
        map_loads: mapLoadsCount,
        geocoding_cost: geocodingCost,
        map_loads_cost: mapLoadsCost,
        total_cost: totalCost
      }, { onConflict: 'month_year' });

    if (upsertError) {
      console.error('Error saving monthly usage:', upsertError);
      throw upsertError;
    }

    console.log(`✅ Monthly usage saved: Geocoding=${geocodingCount}, MapLoads=${mapLoadsCount}, Cost=$${totalCost.toFixed(2)}`);

    return new Response(
      JSON.stringify({
        success: true,
        month_year: monthYear,
        geocoding_api_calls: geocodingCount,
        map_loads: mapLoadsCount,
        geocoding_cost: geocodingCost,
        map_loads_cost: mapLoadsCost,
        total_cost: totalCost
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error in snapshot-monthly-usage:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
