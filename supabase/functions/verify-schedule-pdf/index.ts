import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { deriveTenantFromJWT } from "../_shared/deriveTenantFromJWT.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface InvoiceExpected {
  invoice_number: string;
  expected_payout: number;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    const { tenant_id, user_id, error: authError } = await deriveTenantFromJWT(authHeader);
    if (authError) return authError;
    if (!tenant_id) {
      return new Response(JSON.stringify({ error: "No tenant" }), {
        status: 403,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { scheduleUrl, invoices, batchScheduleId } = await req.json() as {
      scheduleUrl: string;
      invoices: InvoiceExpected[];
      batchScheduleId: string;
    };

    if (!scheduleUrl || !invoices?.length || !batchScheduleId) {
      return new Response(
        JSON.stringify({ error: "Missing scheduleUrl, invoices, or batchScheduleId" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "AI service not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Fetch PDF and convert to base64
    console.log("[verify-schedule-pdf] Fetching PDF:", scheduleUrl);
    const pdfResponse = await fetch(scheduleUrl);
    if (!pdfResponse.ok) {
      return new Response(
        JSON.stringify({ error: `Failed to fetch PDF: ${pdfResponse.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const pdfBuffer = await pdfResponse.arrayBuffer();
    const bytes = new Uint8Array(pdfBuffer);
    let binary = "";
    for (let i = 0; i < bytes.byteLength; i++) {
      binary += String.fromCharCode(bytes[i]);
    }
    const base64 = btoa(binary);

    // Build invoice list for the prompt
    const invoiceList = invoices
      .map((inv) => `- Invoice #${inv.invoice_number}: Expected Net Pay $${inv.expected_payout.toFixed(2)}`)
      .join("\n");

    const totalExpected = invoices.reduce((sum, inv) => sum + inv.expected_payout, 0);

    const systemPrompt = `You are a financial document verification assistant for a freight/trucking factoring company.
Your task is to analyze an OTR Solutions payment schedule PDF and extract the NET PAY amount for each invoice listed.

The schedule typically contains a table with columns like Invoice #, Broker/Customer, Amount, Fee/Discount, and Net Pay (or similar).
Look for the net amount paid after factoring fees are deducted.

IMPORTANT: Extract amounts exactly as shown on the document. Match invoice numbers exactly.
Also find the TOTAL net payment amount shown at the bottom/summary of the schedule.`;

    const userPrompt = `Analyze this OTR Solutions payment schedule PDF.

I need you to find the NET PAY (amount after factoring fee deduction) for each of these invoices:

${invoiceList}

Also find the TOTAL NET PAYMENT shown on the schedule.

Our expected total net payment is: $${totalExpected.toFixed(2)}

Also find the SCHEDULE NUMBER / SCHEDULER NUMBER shown on the document (e.g. "TALB-2096").

Return a JSON object with this EXACT structure:
{
  "schedule_number": "<the scheduler/schedule number from the document, e.g. TALB-2096>",
  "invoices": {
    "<invoice_number>": {
      "found": true/false,
      "schedule_net_pay": <number or null if not found>,
      "notes": "<any relevant notes>"
    }
  },
  "total_schedule_net": <total net payment from the schedule or null>,
  "reasoning": "<brief explanation of what you found>"
}

IMPORTANT: Use the exact invoice numbers as keys. Return numbers without $ signs or commas.`;

    console.log("[verify-schedule-pdf] Calling AI with", invoices.length, "invoices to verify");

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
              { type: "image_url", image_url: { url: `data:application/pdf;base64,${base64}` } },
            ],
          },
        ],
        temperature: 0.1,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("[verify-schedule-pdf] AI error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: "AI processing failed", details: errorText }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await response.json();
    const content = aiResult.choices?.[0]?.message?.content || "";

    // Parse JSON from AI response
    let parsed;
    try {
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error("No JSON found in AI response");
      parsed = JSON.parse(jsonMatch[0]);
    } catch (parseError) {
      console.error("[verify-schedule-pdf] Failed to parse AI response:", content);
      return new Response(
        JSON.stringify({ error: "Failed to parse AI response", raw: content }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Build verification results
    const scheduleNumber = parsed.schedule_number || null;

    const verificationResults: Record<string, any> = {
      invoices: {},
      schedule_number: scheduleNumber,
      total_schedule_net: parsed.total_schedule_net ?? null,
      total_expected_net: totalExpected,
      all_matched: true,
      verified_at: new Date().toISOString(),
      reasoning: parsed.reasoning || "",
    };

    for (const inv of invoices) {
      const aiInvoice = parsed.invoices?.[inv.invoice_number];
      const scheduleNetPay = aiInvoice?.schedule_net_pay ?? null;
      const found = aiInvoice?.found ?? false;

      // Match within $0.01 tolerance
      const matched = found && scheduleNetPay !== null && Math.abs(scheduleNetPay - inv.expected_payout) < 0.02;

      verificationResults.invoices[inv.invoice_number] = {
        schedule_net_pay: scheduleNetPay,
        expected_payout: inv.expected_payout,
        matched,
        found,
        notes: aiInvoice?.notes || "",
      };

      if (!matched) {
        verificationResults.all_matched = false;
      }
    }

    // Check total match (within $0.05 tolerance)
    if (
      verificationResults.total_schedule_net !== null &&
      Math.abs(verificationResults.total_schedule_net - totalExpected) >= 0.05
    ) {
      verificationResults.all_matched = false;
    }

    // Save to database
    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Update verification results and auto-set schedule name if extracted
    const updatePayload: Record<string, any> = { verification_results: verificationResults };
    if (scheduleNumber) {
      updatePayload.schedule_name = scheduleNumber;
    }

    const { error: updateError } = await serviceClient
      .from("invoice_batch_schedules")
      .update(updatePayload)
      .eq("id", batchScheduleId)
      .eq("tenant_id", tenant_id);

    if (updateError) {
      console.error("[verify-schedule-pdf] DB update error:", updateError);
    }

    console.log("[verify-schedule-pdf] Verification complete. All matched:", verificationResults.all_matched);

    return new Response(
      JSON.stringify({ success: true, verification: verificationResults, schedule_number: scheduleNumber }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("[verify-schedule-pdf] Error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
