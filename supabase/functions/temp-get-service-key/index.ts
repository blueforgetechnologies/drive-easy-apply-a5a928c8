import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

// TEMPORARY FUNCTION - DELETE AFTER USE
// One-time retrieval of service role key for VPS worker configuration

const SECRET_TOKEN = "vps-worker-setup-2024-delete-me";

serve(async (req) => {
  const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  };

  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // Simple token check
  const url = new URL(req.url);
  const token = url.searchParams.get('token');
  
  if (token !== SECRET_TOKEN) {
    return new Response(JSON.stringify({ error: 'Invalid token' }), {
      status: 403,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');

  return new Response(JSON.stringify({
    SUPABASE_URL: supabaseUrl,
    SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
    message: "Copy these values to your VPS .env file, then tell Lovable to delete this function!"
  }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
});
