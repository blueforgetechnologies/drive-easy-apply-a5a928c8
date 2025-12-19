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

    // Get total count of locations
    const { count: totalLocations, error: countError } = await supabaseClient
      .from('geocode_cache')
      .select('*', { count: 'exact', head: true });

    if (countError) {
      console.error('Error counting locations:', countError);
      throw countError;
    }

    // Get sum of hit_count by fetching all rows (need to handle pagination for large tables)
    let totalHits = 0;
    let offset = 0;
    const batchSize = 1000;
    
    while (true) {
      const { data: batch, error: batchError } = await supabaseClient
        .from('geocode_cache')
        .select('hit_count')
        .range(offset, offset + batchSize - 1);
      
      if (batchError) {
        console.error('Error fetching hits batch:', batchError);
        throw batchError;
      }
      
      if (!batch || batch.length === 0) break;
      
      totalHits += batch.reduce((sum, row) => sum + (row.hit_count || 1), 0);
      offset += batchSize;
      
      if (batch.length < batchSize) break;
    }

    const estimatedSavings = totalHits * 0.00075; // $0.75 per 1000 calls

    // Count locations added today
    const today = new Date().toISOString().split('T')[0];
    const { count: newLocationsToday } = await supabaseClient
      .from('geocode_cache')
      .select('*', { count: 'exact', head: true })
      .gte('created_at', `${today}T00:00:00Z`);

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
        total_locations: totalLocations || 0,
        total_hits: totalHits,
        new_locations_today: newLocationsToday || 0,
        hits_today: Math.max(0, hitsToday),
        estimated_savings: estimatedSavings,
      }, { onConflict: 'recorded_at' });

    if (insertError) {
      console.error('Error inserting stats:', insertError);
      throw insertError;
    }

    console.log(`✅ Stats snapshot saved: ${totalLocations} locations, ${totalHits} total hits, $${estimatedSavings.toFixed(2)} saved`);

    return new Response(
      JSON.stringify({
        success: true,
        stats: {
          totalLocations: totalLocations || 0,
          totalHits,
          newLocationsToday: newLocationsToday || 0,
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
