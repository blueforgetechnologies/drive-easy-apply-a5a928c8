import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { isFeatureEnabled } from '../_shared/assertFeatureEnabled.ts';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Track AI usage with feature location
async function trackAiUsage(
  model: string,
  feature: string,
  promptTokens: number,
  completionTokens: number,
  totalTokens: number,
  userId?: string
) {
  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    await supabase.from('ai_usage_tracking').insert({
      model,
      feature,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: totalTokens,
      user_id: userId || null,
    });
    
    console.log(`[AI Usage] Tracked: ${feature} - ${model} - ${totalTokens} tokens`);
  } catch (error) {
    console.error('[AI Usage] Failed to track:', error);
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { imageBase64, textInput, userId, tenant_id } = await req.json();
    
    // Feature gate: check if AI parsing is enabled for tenant
    if (tenant_id) {
      const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
      const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      
      const aiEnabled = await isFeatureEnabled({
        tenant_id,
        flag_key: 'load_hunter_ai_parsing',
        serviceClient: supabase,
      });
      
      if (!aiEnabled) {
        console.log(`[parse-freight-dimensions] AI parsing disabled for tenant ${tenant_id}`);
        return new Response(
          JSON.stringify({ error: 'Feature disabled', flag_key: 'load_hunter_ai_parsing', reason: 'release_channel' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
    }

    // Handle text input with AI fallback (when regex parsing fails)
    if (textInput) {
      console.log('[Freight Parser] Processing text with AI fallback:', textInput.substring(0, 100));
      
      const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
      if (!LOVABLE_API_KEY) {
        throw new Error('LOVABLE_API_KEY is not configured');
      }

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            {
              role: 'system',
              content: `You are a freight dimensions parser. Parse the given text to extract pallet/freight dimensions.
Output ONLY the dimensions in this exact format, one per line:
[quantity]@[length] x [width] x [height]

Example input: "12 - 48x48x48" means 12 pallets of 48 x 48 x 48 inches
Example output:
12@48 x 48 x 48

Rules:
- Dimensions are in INCHES
- Parse quantity from context (e.g., "12 - 48x48x48" = 12 pallets)
- Support formats like: "3@48x48x52", "12 - 48x48x48", "(2)48x48x45", "2-48x52x23"
- If quantity is not specified, assume 1
- Support decimal dimensions like 288.5
- Do not include any other text, explanations, or formatting
- If you cannot find any dimensions, output: NO_DIMENSIONS_FOUND`
            },
            {
              role: 'user',
              content: `Parse these freight dimensions: ${textInput}`
            }
          ],
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI API error:', response.status, errorText);
        
        if (response.status === 429) {
          return new Response(
            JSON.stringify({ error: 'Rate limit exceeded, please try again later' }),
            { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        if (response.status === 402) {
          return new Response(
            JSON.stringify({ error: 'AI credits exhausted, please add credits' }),
            { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
        }
        
        throw new Error(`AI API error: ${response.status}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      // Track usage with feature location
      const usage = data.usage || {};
      await trackAiUsage(
        'google/gemini-2.5-flash',
        'freight_calculator_text',
        usage.prompt_tokens || 0,
        usage.completion_tokens || 0,
        usage.total_tokens || 0,
        userId
      );

      if (content.includes('NO_DIMENSIONS_FOUND')) {
        return new Response(
          JSON.stringify({ dimensions: null, message: 'Could not parse dimensions from text' }),
          { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ dimensions: content.trim(), source: 'ai' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Handle image input
    if (!imageBase64) {
      return new Response(
        JSON.stringify({ error: 'No image or text provided' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[Freight Parser] Processing image with AI');

    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          {
            role: 'system',
            content: `You are a freight dimensions parser. Extract pallet/freight dimensions from images.
Output ONLY the dimensions in this exact format, one per line:
[quantity]@[length] x [width] x [height]

Example output:
3@48 x 48 x 52
1@48 x 48 x 59
8@47 x 24 x 59

Rules:
- Dimensions are in INCHES
- If quantity is not specified, assume 1
- Do not include any other text, explanations, or formatting
- If you cannot find any dimensions, output: NO_DIMENSIONS_FOUND`
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'Extract all freight/pallet dimensions from this image. Output only the dimensions in the specified format.'
              },
              {
                type: 'image_url',
                image_url: { url: imageBase64 }
              }
            ]
          }
        ],
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('AI API error:', response.status, errorText);
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded, please try again later' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted, please add credits' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      throw new Error(`AI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content || '';

    // Track usage with feature location
    const usage = data.usage || {};
    await trackAiUsage(
      'google/gemini-2.5-flash',
      'freight_calculator_image',
      usage.prompt_tokens || 0,
      usage.completion_tokens || 0,
      usage.total_tokens || 0,
      userId
    );

    if (content.includes('NO_DIMENSIONS_FOUND')) {
      return new Response(
        JSON.stringify({ dimensions: null, message: 'No dimensions found in image' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ dimensions: content.trim(), source: 'ai' }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error: unknown) {
    console.error('Error parsing freight dimensions:', error);
    const errorMessage = error instanceof Error ? error.message : 'Failed to parse';
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});