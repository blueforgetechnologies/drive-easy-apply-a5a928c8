import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting daily geocode cache stats snapshot');

    // Get current stats from geocode_cache
    const { data: cacheData, error: cacheError } = await supabaseClient
      .from('geocode_cache')
      .select('hit_count, created_at');

    if (cacheError) {
      console.error('Error fetching cache data:', cacheError);
      throw cacheError;
    }

    const totalLocations = cacheData?.length || 0;
    const totalHits = cacheData?.reduce((sum, row) => sum + (row.hit_count || 1), 0) || 0;
    const estimatedSavings = totalHits * 0.00075; // $0.75 per 1000 calls

    // Count locations added today
    const today = new Date().toISOString().split('T')[0];
    const newLocationsToday = cacheData?.filter(row => 
      row.created_at && row.created_at.startsWith(today)
    ).length || 0;

    // Get yesterday's stats to calculate hits today
    const { data: yesterdayStats } = await supabaseClient
      .from('geocode_cache_daily_stats')
      .select('total_hits')
      .order('recorded_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const hitsToday = yesterdayStats ? totalHits - yesterdayStats.total_hits : totalHits;

    // Insert or update today's stats
    const { error: insertError } = await supabaseClient
      .from('geocode_cache_daily_stats')
      .upsert({
        recorded_at: today,
        total_locations: totalLocations,
        total_hits: totalHits,
        new_locations_today: newLocationsToday,
        hits_today: Math.max(0, hitsToday),
        estimated_savings: estimatedSavings,
      }, { onConflict: 'recorded_at' });

    if (insertError) {
      console.error('Error inserting stats:', insertError);
      throw insertError;
    }

    console.log(`Stats snapshot saved: ${totalLocations} locations, ${totalHits} total hits, $${estimatedSavings.toFixed(2)} saved`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          totalLocations,
          totalHits,
          newLocationsToday,
          hitsToday: Math.max(0, hitsToday),
          estimatedSavings: estimatedSavings.toFixed(2),
        }
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in snapshot-geocode-stats function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});