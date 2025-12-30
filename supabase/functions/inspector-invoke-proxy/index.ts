import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const ALLOWED_TARGET_ENDPOINTS = ['geocode', 'test-ai', 'send-bid-email'] as const;

type AllowedTarget = (typeof ALLOWED_TARGET_ENDPOINTS)[number];

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    // Verify user identity using their JWT
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Check platform admin status via profiles.is_platform_admin
    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);
    const { data: profile, error: profileError } = await serviceClient
      .from('profiles')
      .select('is_platform_admin')
      .eq('id', user.id)
      .single();

    if (profileError) {
      return new Response(JSON.stringify({ error: 'Failed to verify admin status' }), {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!profile?.is_platform_admin) {
      return new Response(JSON.stringify({ error: 'Forbidden - Platform admin access required' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Parse request body
    let requestBody: any = null;
    try {
      requestBody = await req.json();
    } catch {
      requestBody = null;
    }

    const targetEndpoint = requestBody?.endpoint as AllowedTarget | undefined;
    const targetBody = requestBody?.body ?? {};

    if (!targetEndpoint) {
      return new Response(JSON.stringify({ error: 'Missing endpoint' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (!ALLOWED_TARGET_ENDPOINTS.includes(targetEndpoint)) {
      return new Response(
        JSON.stringify({
          error: 'Endpoint not allowed',
          allowed: ALLOWED_TARGET_ENDPOINTS,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    // Invoke the target function server-side and normalize the result.
    // IMPORTANT: Always return 200 from this proxy to avoid client-side overlays on expected 403s.
    let status = 200;
    let payload: any = null;

    try {
      const { data, error } = await userClient.functions.invoke(targetEndpoint, {
        body: targetBody,
        headers: { Authorization: authHeader },
      });

      if (error) {
        const ctx: any = (error as any).context;
        status = ctx?.status ?? 500;
        payload = ctx?.body ?? { error: error.message };

        if (typeof payload === 'string') {
          try {
            payload = JSON.parse(payload);
          } catch {
            // keep as string
          }
        }
      } else {
        status = 200;
        payload = data;
      }
    } catch (err: any) {
      status = 500;
      payload = { error: err?.message || 'Unknown error' };
    }

    return new Response(JSON.stringify({ status, body: payload }), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch {
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
