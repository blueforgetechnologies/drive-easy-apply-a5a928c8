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

    // Get all currently missed and skipped loads
    const { data: loadsToReset, error: fetchError } = await supabaseClient
      .from('load_emails')
      .select('*')
      .in('status', ['missed', 'skipped']);

    if (fetchError) {
      console.error('Error fetching loads to reset:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${loadsToReset?.length || 0} loads to reset (missed + skipped)`);

    // Log each load to history before resetting (only for missed loads, not skipped)
    const missedLoadsOnly = loadsToReset?.filter(load => load.status === 'missed') || [];
    if (missedLoadsOnly.length > 0) {
      const historyRecords = missedLoadsOnly.map(load => ({
        load_email_id: load.id,
        missed_at: load.updated_at,
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

    // Reset all missed loads back to new status
    const { error: resetError } = await supabaseClient
      .from('load_emails')
      .update({ status: 'new' })
      .eq('status', 'missed');

    if (resetError) {
      console.error('Error resetting missed loads:', resetError);
      throw resetError;
    }

    console.log('Successfully reset all missed loads to new status');

    return new Response(
      JSON.stringify({
        success: true,
        message: `Reset ${loadsToReset?.length || 0} loads (missed + skipped)`,
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
