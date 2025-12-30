import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { assertFeatureEnabled } from '../_shared/assertFeatureEnabled.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    
    // Safely extract overrideTenantId from body (for admin verification tests)
    let overrideTenantId: string | undefined;
    let requestBody: any = {};
    
    try {
      const bodyText = await req.text();
      if (bodyText) {
        requestBody = JSON.parse(bodyText);
        overrideTenantId = requestBody.overrideTenantId;
      }
    } catch (e) {
      // Empty or invalid body is fine
      console.log('[test-ai] Body parsing note:', e instanceof Error ? e.message : 'empty body');
    }
    
    // Feature gate FIRST - derive tenant from auth, check ai_parsing_enabled
    const gateResult = await assertFeatureEnabled({
      flag_key: 'ai_parsing_enabled',
      authHeader,
      overrideTenantId,
    });
    
    if (!gateResult.allowed) {
      console.log(`[test-ai] Feature disabled: ${gateResult.reason}`);
      return gateResult.response!;
    }

    // Get prompt from body (after gate passes)
    const { prompt } = requestBody;
    
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    console.log(`[test-ai] Processing for tenant ${gateResult.tenant_id}, user ${gateResult.user_id}`);
    console.log("Testing Lovable AI with prompt:", prompt);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: "You are a helpful AI assistant for testing purposes. Keep responses brief and friendly." },
          { role: "user", content: prompt || "Hello! Please confirm you're working." }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please wait and try again." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Insufficient credits. Please add credits to your Lovable workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    const aiResponse = data.choices?.[0]?.message?.content;
    
    // Extract token usage if available
    const usage = data.usage || {};
    const promptTokens = usage.prompt_tokens || 0;
    const completionTokens = usage.completion_tokens || 0;
    const totalTokens = usage.total_tokens || promptTokens + completionTokens;

    // Track AI usage with service client
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );
    
    await supabase
      .from('ai_usage_tracking')
      .insert({
        model: 'google/gemini-2.5-flash',
        prompt_tokens: promptTokens,
        completion_tokens: completionTokens,
        total_tokens: totalTokens,
        user_id: gateResult.user_id,
      });
    console.log('📊 Lovable AI usage tracked:', { promptTokens, completionTokens, totalTokens });

    console.log("AI response received successfully");

    return new Response(
      JSON.stringify({ 
        success: true, 
        response: aiResponse,
        model: "google/gemini-2.5-flash",
        usage: { promptTokens, completionTokens, totalTokens },
        tenant_id: gateResult.tenant_id,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in test-ai function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
