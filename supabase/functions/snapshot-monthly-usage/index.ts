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

    // Calculate costs using tiered pricing
    const GEOCODING_FREE_TIER = 100000;
    const MAP_LOADS_FREE_TIER = 50000;

    // Tiered geocoding cost calculation
    const calculateGeocodingCost = (calls: number): number => {
      if (calls <= GEOCODING_FREE_TIER) return 0;
      
      let cost = 0;
      let remaining = calls - GEOCODING_FREE_TIER;
      
      // Tier 1: 100,001 - 500,000 @ $0.75/1,000
      const tier1 = Math.min(remaining, 400000);
      cost += (tier1 / 1000) * 0.75;
      remaining -= tier1;
      
      if (remaining <= 0) return cost;
      
      // Tier 2: 500,001 - 1,000,000 @ $0.60/1,000
      const tier2 = Math.min(remaining, 500000);
      cost += (tier2 / 1000) * 0.60;
      remaining -= tier2;
      
      if (remaining <= 0) return cost;
      
      // Tier 3: 1,000,000+ @ $0.45/1,000
      cost += (remaining / 1000) * 0.45;
      
      return cost;
    };

    // Tiered map loads cost calculation
    const calculateMapLoadsCost = (loads: number): number => {
      if (loads <= MAP_LOADS_FREE_TIER) return 0;
      
      let cost = 0;
      let remaining = loads - MAP_LOADS_FREE_TIER;
      
      // Tier 1: 50,001 - 100,000 @ $5.00/1,000
      const tier1 = Math.min(remaining, 50000);
      cost += (tier1 / 1000) * 5.00;
      remaining -= tier1;
      
      if (remaining <= 0) return cost;
      
      // Tier 2: 100,001 - 200,000 @ $4.00/1,000
      const tier2 = Math.min(remaining, 100000);
      cost += (tier2 / 1000) * 4.00;
      remaining -= tier2;
      
      if (remaining <= 0) return cost;
      
      // Tier 3: 200,001+ @ $3.00/1,000
      cost += (remaining / 1000) * 3.00;
      
      return cost;
    };

    const geocodingCount = geocodingCalls || 0;
    const mapLoadsCount = mapLoads || 0;

    const geocodingCost = calculateGeocodingCost(geocodingCount);
    const mapLoadsCost = calculateMapLoadsCost(mapLoadsCount);

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
