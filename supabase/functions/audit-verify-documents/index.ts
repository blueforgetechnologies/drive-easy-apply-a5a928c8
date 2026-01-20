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

interface VerificationResult {
  rateConfirmation: {
    customer_load_id: "match" | "fail" | "unable";
    carrier: "match" | "fail" | "unable";
    broker: "match" | "fail" | "unable";
    dates: "match" | "fail" | "unable";
    origin: "match" | "fail" | "unable";
    destination: "match" | "fail" | "unable";
    rate: "match" | "fail" | "unable";
  };
  billOfLading: {
    carrier: "match" | "fail" | "unable";
    origin: "match" | "fail" | "unable";
    destinations: "match" | "fail" | "unable";
  };
  extractedData: Record<string, string | null>;
  reasoning: string;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { documentUrl, documentType, loadData } = await req.json() as {
      documentUrl: string;
      documentType: "rate_confirmation" | "bill_of_lading";
      loadData: LoadData;
    };

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    if (!documentUrl) {
      throw new Error("Document URL is required");
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
      
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Please try again in a moment." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "AI credits exhausted. Please add credits to continue." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    const content = aiResponse.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error("No response from AI");
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
      // Return a default "unable" response
      parsedResult = documentType === "rate_confirmation" 
        ? {
            customer_load_id: "unable",
            carrier: "unable",
            broker: "unable",
            dates: "unable",
            origin: "unable",
            destination: "unable",
            rate: "unable",
            extracted: {},
            reasoning: "Failed to parse document"
          }
        : {
            carrier: "unable",
            origin: "unable",
            destinations: "unable",
            extracted: {},
            reasoning: "Failed to parse document"
          };
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
        error: error instanceof Error ? error.message : "Unknown error",
        success: false 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
