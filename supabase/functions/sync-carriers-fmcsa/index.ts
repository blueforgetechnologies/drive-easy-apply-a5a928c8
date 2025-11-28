import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    console.log('Starting carrier FMCSA sync...');

    // Get all active and pending carriers with DOT numbers
    const { data: carriers, error: fetchError } = await supabaseClient
      .from('carriers')
      .select('id, name, dot_number, status')
      .in('status', ['active', 'pending'])
      .not('dot_number', 'is', null)
      .neq('dot_number', '');

    if (fetchError) {
      console.error('Error fetching carriers:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${carriers?.length || 0} carriers to sync`);

    let successCount = 0;
    let errorCount = 0;

    // Process each carrier
    for (const carrier of carriers || []) {
      try {
        console.log(`Syncing carrier: ${carrier.name} (DOT: ${carrier.dot_number})`);

        // Fetch FMCSA data
        const fmcsaResponse = await fetch(
          `${Deno.env.get('SUPABASE_URL')}/functions/v1/fetch-carrier-data`,
          {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}`,
            },
            body: JSON.stringify({ usdot: carrier.dot_number }),
          }
        );

        if (!fmcsaResponse.ok) {
          console.log(`Failed to fetch FMCSA data for ${carrier.name}`);
          errorCount++;
          continue;
        }

        const fmcsaData = await fmcsaResponse.json();

        // Update carrier with new FMCSA data
        const { error: updateError } = await supabaseClient
          .from('carriers')
          .update({
            safer_status: fmcsaData.safer_status || null,
            safety_rating: fmcsaData.safety_rating || null,
            mc_number: fmcsaData.mc_number || carrier.mc_number,
            phone: fmcsaData.phone || carrier.phone,
            address: fmcsaData.physical_address || carrier.address,
          })
          .eq('id', carrier.id);

        if (updateError) {
          console.error(`Error updating carrier ${carrier.name}:`, updateError);
          errorCount++;
        } else {
          console.log(`Successfully synced ${carrier.name}`);
          successCount++;
        }

        // Add a small delay to avoid overwhelming the FMCSA website
        await new Promise(resolve => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error processing carrier ${carrier.name}:`, error);
        errorCount++;
      }
    }

    console.log(`Sync completed. Success: ${successCount}, Errors: ${errorCount}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: `Synced ${successCount} carriers, ${errorCount} errors`,
        successCount,
        errorCount,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error: any) {
    console.error('Error in sync-carriers-fmcsa:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 500,
      }
    );
  }
});
