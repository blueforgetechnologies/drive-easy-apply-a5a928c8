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

    console.log('Starting daily missed and skipped loads reset at midnight ET');

    // Get all currently missed and skipped loads, plus loads marked for missed tracking
    const { data: loadsToReset, error: fetchError } = await supabaseClient
      .from('load_emails')
      .select('*')
      .or('status.in.(missed,skipped),marked_missed_at.not.is.null');

    if (fetchError) {
      console.error('Error fetching loads to reset:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${loadsToReset?.length || 0} loads to reset (missed + skipped)`);

    // Log loads to history before resetting
    // Log loads that have marked_missed_at set (these are the tracked missed loads)
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

    // Reset all missed loads back to new status and clear marked_missed_at timestamp
    const { error: resetError } = await supabaseClient
      .from('load_emails')
      .update({ 
        status: 'new',
        marked_missed_at: null 
      })
      .or('status.eq.missed,marked_missed_at.not.is.null');

    if (resetError) {
      console.error('Error resetting missed loads:', resetError);
      throw resetError;
    }

    console.log('Successfully reset loads: cleared skipped status and missed tracking');

    return new Response(
      JSON.stringify({
        success: true,
        message: `Reset ${loadsToReset?.length || 0} loads (skipped status + missed tracking)`,
        count: loadsToReset?.length || 0,
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
