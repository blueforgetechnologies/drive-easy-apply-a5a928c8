import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface LoadData {
  reference_number?: string | null;
  carrier_name?: string | null;
  customer_name?: string | null;
  pickup_date?: string | null;
  delivery_date?: string | null;
  pickup_city?: string | null;
  pickup_state?: string | null;
  delivery_city?: string | null;
  delivery_state?: string | null;
  rate?: number | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentUrl, documentType, loadData, fileName } = await req.json() as {
      documentUrl: string;
      documentType: "rate_confirmation" | "bill_of_lading";
      loadData: LoadData;
      fileName?: string;
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "AI service not configured. Please contact support.",
          errorCode: "CONFIG_ERROR"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (!documentUrl) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "No document URL provided.",
          errorCode: "MISSING_URL"
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Check if the file is a PDF - AI vision doesn't support PDFs directly
    const isPdf = fileName?.toLowerCase().endsWith('.pdf') || documentUrl.toLowerCase().includes('.pdf');
    
    if (isPdf) {
      // For PDFs, we need to convert to image first
      // For now, return a helpful error message
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "PDF documents cannot be verified directly by AI vision. Please convert the PDF to an image (PNG/JPEG) first, or manually verify the document.",
          errorCode: "PDF_NOT_SUPPORTED",
          suggestion: "You can take a screenshot of the PDF and upload it as an image, or use the manual Match/Fail buttons."
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = `You are a document verification assistant for freight/trucking logistics. 
Your task is to analyze Rate Confirmations and Bills of Lading to verify they match the expected load data.

For each field, you will:
1. Extract the value from the document image
2. Compare it to the expected value
3. Return "match" if they are similar (fuzzy match - ignore case, minor spelling differences, abbreviations)
4. Return "fail" if they clearly don't match
5. Return "unable" if you cannot find or read the field in the document

Be lenient with matching:
- "TALBI LOGISTICS LLC" matches "Talbi Logistics"
- "NY" matches "New York"
- Dates within 1-2 days are considered matching
- Rates within 2% are considered matching
- Partial city/state matches are acceptable (e.g., "Chicago, IL" matches "Chicago")`;

    const userPrompt = documentType === "rate_confirmation" 
      ? `Analyze this Rate Confirmation document and verify it matches the following load data:

Expected Load Data:
- Customer/Reference Load ID: ${loadData.reference_number || "N/A"}
- Carrier Name: ${loadData.carrier_name || "N/A"}
- Broker/Customer Name: ${loadData.customer_name || "N/A"}
- Pickup Date: ${loadData.pickup_date || "N/A"}
- Delivery Date: ${loadData.delivery_date || "N/A"}
- Origin: ${loadData.pickup_city || ""}${loadData.pickup_state ? ", " + loadData.pickup_state : ""}
- Destination: ${loadData.delivery_city || ""}${loadData.delivery_state ? ", " + loadData.delivery_state : ""}
- Rate: $${loadData.rate || "N/A"}

Return a JSON object with this exact structure:
{
  "customer_load_id": "match" | "fail" | "unable",
  "carrier": "match" | "fail" | "unable",
  "broker": "match" | "fail" | "unable",
  "dates": "match" | "fail" | "unable",
  "origin": "match" | "fail" | "unable",
  "destination": "match" | "fail" | "unable",
  "rate": "match" | "fail" | "unable",
  "extracted": {
    "customer_load_id": "extracted value or null",
    "carrier": "extracted value or null",
    "broker": "extracted value or null",
    "pickup_date": "extracted value or null",
    "delivery_date": "extracted value or null",
    "origin": "extracted value or null",
    "destination": "extracted value or null",
    "rate": "extracted value or null"
  },
  "reasoning": "Brief explanation of your verification"
}`
      : `Analyze this Bill of Lading document and verify it matches the following load data:

Expected Load Data:
- Carrier Name: ${loadData.carrier_name || "N/A"}
- Origin: ${loadData.pickup_city || ""}${loadData.pickup_state ? ", " + loadData.pickup_state : ""}
- Destination(s): ${loadData.delivery_city || ""}${loadData.delivery_state ? ", " + loadData.delivery_state : ""}

Return a JSON object with this exact structure:
{
  "carrier": "match" | "fail" | "unable",
  "origin": "match" | "fail" | "unable",
  "destinations": "match" | "fail" | "unable",
  "extracted": {
    "carrier": "extracted value or null",
    "origin": "extracted value or null",
    "destinations": "extracted value or null"
  },
  "reasoning": "Brief explanation of your verification"
}`;

    console.log("Calling Lovable AI with document URL:", documentUrl);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          { 
            role: "user", 
            content: [
              { type: "text", text: userPrompt },
              { type: "image_url", image_url: { url: documentUrl } }
            ]
          }
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      
      let errorDetails;
      try {
        errorDetails = JSON.parse(errorText);
      } catch {
        errorDetails = { message: errorText };
      }
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "Rate limit exceeded. Please wait a moment and try again.",
            errorCode: "RATE_LIMIT"
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "AI credits exhausted. Please add credits to continue using AI features.",
            errorCode: "CREDITS_EXHAUSTED"
          }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      // Check for unsupported format error
      if (errorDetails?.error?.message?.includes("Unsupported image format")) {
        return new Response(
          JSON.stringify({ 
            success: false, 
            error: "This file format is not supported by AI vision. Please use PNG, JPEG, WebP, or GIF images.",
            errorCode: "UNSUPPORTED_FORMAT",
            suggestion: "Take a screenshot of the document and upload it as an image instead."
          }),
          { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `AI verification failed: ${errorDetails?.error?.message || 'Unknown error'}`,
          errorCode: "AI_ERROR"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "AI did not return a response. Please try again.",
          errorCode: "EMPTY_RESPONSE"
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    console.log("AI Response:", content);

    // Parse the JSON from the response
    let parsedResult;
    try {
      // Extract JSON from the response (it might be wrapped in markdown code blocks)
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = jsonMatch[1] || content;
      parsedResult = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Failed to parse AI response. The document may be unclear or in an unexpected format.",
          errorCode: "PARSE_ERROR",
          rawResponse: content
        }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        documentType,
        result: parsedResult,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Verification error:", error);
    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : "An unexpected error occurred",
        errorCode: "UNKNOWN_ERROR"
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
