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

    console.log('Starting midnight ET reset for missed/skipped loads and matches');

    // 1. Reset skipped matches in load_hunt_matches (is_active = false -> true)
    const { data: skippedMatches, error: fetchMatchesError } = await supabaseClient
      .from('load_hunt_matches')
      .select('id')
      .eq('is_active', false);

    if (fetchMatchesError) {
      console.error('Error fetching skipped matches:', fetchMatchesError);
      throw fetchMatchesError;
    }

    const skippedMatchCount = skippedMatches?.length || 0;
    console.log(`Found ${skippedMatchCount} skipped matches to reset`);

    if (skippedMatchCount > 0) {
      const { error: resetMatchesError } = await supabaseClient
        .from('load_hunt_matches')
        .update({ is_active: true, updated_at: new Date().toISOString() })
        .eq('is_active', false);

      if (resetMatchesError) {
        console.error('Error resetting skipped matches:', resetMatchesError);
        throw resetMatchesError;
      }
      console.log(`Successfully reset ${skippedMatchCount} skipped matches to active`);
    }

    // 2. Get loads with missed/skipped status or marked_missed_at for history logging
    const { data: loadsToReset, error: fetchError } = await supabaseClient
      .from('load_emails')
      .select('*')
      .or('status.in.(missed,skipped),marked_missed_at.not.is.null');

    if (fetchError) {
      console.error('Error fetching loads to reset:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${loadsToReset?.length || 0} load emails to reset (missed + skipped status)`);

    // 3. Log loads with marked_missed_at to history before resetting
    const loadsWithMissedTracking = loadsToReset?.filter(load => load.marked_missed_at !== null) || [];
    if (loadsWithMissedTracking.length > 0) {
      const historyRecords = loadsWithMissedTracking.map(load => ({
        load_email_id: load.id,
        missed_at: load.marked_missed_at || load.updated_at,
        reset_at: new Date().toISOString(),
        from_email: load.from_email,
        subject: load.subject,
        received_at: load.received_at,
      }));

      const { error: historyError } = await supabaseClient
        .from('missed_loads_history')
        .insert(historyRecords);

      if (historyError) {
        console.error('Error logging missed loads history:', historyError);
        throw historyError;
      }

      console.log(`Logged ${historyRecords.length} missed loads to history`);
    }

    // 4. Reset load_emails with missed/skipped status back to 'new'
    const { error: resetError } = await supabaseClient
      .from('load_emails')
      .update({ 
        status: 'new',
        marked_missed_at: null 
      })
      .or('status.eq.missed,status.eq.skipped,marked_missed_at.not.is.null');

    if (resetError) {
      console.error('Error resetting load emails:', resetError);
      throw resetError;
    }

    console.log('Successfully completed midnight reset');

    return new Response(
      JSON.stringify({
        success: true,
        message: `Reset ${skippedMatchCount} skipped matches and ${loadsToReset?.length || 0} load emails`,
        skipped_matches_reset: skippedMatchCount,
        load_emails_reset: loadsToReset?.length || 0,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in reset-missed-loads function:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
