import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.3';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    console.log('📦 Starting email archival process...');
    
    // Call the database function to archive old emails
    const { data, error } = await supabase.rpc('archive_old_load_emails');
    
    if (error) {
      console.error('❌ Archive error:', error);
      return new Response(
        JSON.stringify({ success: false, error: error.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    const archivedCount = data || 0;
    console.log(`✅ Archived ${archivedCount} emails older than 8 days`);
    
    // Get current counts for reporting
    const [mainCount, archiveCount] = await Promise.all([
      supabase.from('load_emails').select('id', { count: 'exact', head: true }),
      supabase.from('load_emails_archive').select('id', { count: 'exact', head: true })
    ]);
    
    return new Response(
      JSON.stringify({
        success: true,
        archived: archivedCount,
        mainTableCount: mainCount.count || 0,
        archiveTableCount: archiveCount.count || 0,
        message: `Archived ${archivedCount} emails. Main table: ${mainCount.count}, Archive: ${archiveCount.count}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    console.error('❌ Unexpected error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ success: false, error: message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
