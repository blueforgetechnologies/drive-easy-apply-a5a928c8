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
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get the current hour start (truncate to hour)
    const now = new Date();
    const hourStart = new Date(now);
    hourStart.setMinutes(0, 0, 0);
    
    // Get the previous hour for counting
    const prevHourStart = new Date(hourStart);
    prevHourStart.setHours(prevHourStart.getHours() - 1);

    console.log(`📊 Snapshotting email volume for hour: ${prevHourStart.toISOString()}`);

    // Count emails received in the previous hour
    const { count: receivedCount, error: receivedError } = await supabase
      .from('load_emails')
      .select('*', { count: 'exact', head: true })
      .gte('received_at', prevHourStart.toISOString())
      .lt('received_at', hourStart.toISOString());

    if (receivedError) {
      console.error('Error counting received emails:', receivedError);
    }

    // Count processed emails in the previous hour
    const { count: processedCount, error: processedError } = await supabase
      .from('email_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'completed')
      .gte('processed_at', prevHourStart.toISOString())
      .lt('processed_at', hourStart.toISOString());

    if (processedError) {
      console.error('Error counting processed emails:', processedError);
    }

    // Count failed emails in the previous hour
    const { count: failedCount, error: failedError } = await supabase
      .from('email_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'failed')
      .gte('queued_at', prevHourStart.toISOString())
      .lt('queued_at', hourStart.toISOString());

    if (failedError) {
      console.error('Error counting failed emails:', failedError);
    }

    // Count currently pending emails
    const { count: pendingCount, error: pendingError } = await supabase
      .from('email_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending');

    if (pendingError) {
      console.error('Error counting pending emails:', pendingError);
    }

    // Insert or update the hourly snapshot
    const { data, error: insertError } = await supabase
      .from('email_volume_stats')
      .upsert({
        hour_start: prevHourStart.toISOString(),
        emails_received: receivedCount || 0,
        emails_processed: processedCount || 0,
        emails_pending: pendingCount || 0,
        emails_failed: failedCount || 0,
        recorded_at: now.toISOString()
      }, {
        onConflict: 'hour_start'
      })
      .select()
      .single();

    if (insertError) {
      console.error('Error inserting snapshot:', insertError);
      throw insertError;
    }

    console.log(`✅ Snapshot saved: ${receivedCount} received, ${processedCount} processed, ${pendingCount} pending, ${failedCount} failed`);

    return new Response(
      JSON.stringify({
        success: true,
        hour: prevHourStart.toISOString(),
        stats: {
          received: receivedCount || 0,
          processed: processedCount || 0,
          pending: pendingCount || 0,
          failed: failedCount || 0
        }
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('Error in snapshot-email-volume:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
