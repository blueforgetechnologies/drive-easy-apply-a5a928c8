import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;
    
    const supabase = createClient(supabaseUrl, supabaseKey);

    console.log("Fetching load emails...");
    const { data: emails, error: emailsError } = await supabase
      .from("load_emails")
      .select("*")
      .order("received_at", { ascending: false })
      .limit(100); // Process only 100 most recent emails to avoid timeout

    if (emailsError) throw emailsError;

    console.log(`Processing ${emails?.length || 0} emails with AI...`);

    const processedCustomers = new Map();
    let created = 0;
    let updated = 0;
    let processed = 0;
    let errors = 0;

    for (const email of emails || []) {
      processed++;
      console.log(`Processing email ${processed}/${emails?.length}...`);
      if (!email.body_html && !email.parsed_data) continue;

      const emailContent = email.body_html || JSON.stringify(email.parsed_data);
      
      // Use AI to extract customer data
      const aiResponse = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${lovableApiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            {
              role: "system",
              content: "Extract broker/customer information from freight load emails. Return JSON with: company_name, contact_name, email, phone, phone_secondary, phone_mobile, phone_fax, email_secondary, address, city, state, zip. Return null for missing fields."
            },
            {
              role: "user",
              content: `Extract customer data from this email:\n\n${emailContent.substring(0, 3000)}`
            }
          ],
          tools: [{
            type: "function",
            function: {
              name: "extract_customer",
              description: "Extract customer information from email",
              parameters: {
                type: "object",
                properties: {
                  company_name: { type: "string" },
                  contact_name: { type: "string" },
                  email: { type: "string" },
                  phone: { type: "string" },
                  phone_secondary: { type: "string" },
                  phone_mobile: { type: "string" },
                  phone_fax: { type: "string" },
                  email_secondary: { type: "string" },
                  address: { type: "string" },
                  city: { type: "string" },
                  state: { type: "string" },
                  zip: { type: "string" }
                },
                required: ["company_name"]
              }
            }
          }],
          tool_choice: { type: "function", function: { name: "extract_customer" } }
        }),
      });

      if (!aiResponse.ok) {
        const errorText = await aiResponse.text();
        console.error(`AI error for email ${email.id}:`, errorText);
        errors++;
        
        if (aiResponse.status === 429) {
          console.log("Rate limit hit, stopping processing");
          break;
        }
        continue;
      }

      const aiData = await aiResponse.json();
      const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
      
      if (!toolCall) {
        console.log(`No data extracted from email ${email.id}`);
        continue;
      }

      const customerData = JSON.parse(toolCall.function.arguments);
      
      if (!customerData.company_name) continue;

      const customerKey = customerData.company_name.toLowerCase().trim();
      
      if (!processedCustomers.has(customerKey)) {
        processedCustomers.set(customerKey, customerData);
      } else {
        // Merge data, preferring non-null values
        const existing = processedCustomers.get(customerKey);
        for (const [key, value] of Object.entries(customerData)) {
          if (value && !existing[key]) {
            existing[key] = value;
          }
        }
      }
    }

    console.log(`Extracted ${processedCustomers.size} unique customers`);

    // Fetch existing customers
    const { data: existingCustomers } = await supabase
      .from("customers")
      .select("id, name");

    const existingMap = new Map(
      existingCustomers?.map(c => [c.name.toLowerCase().trim(), c.id]) || []
    );

    // Insert or update customers
    for (const [key, customerData] of processedCustomers) {
      const existingId = existingMap.get(key);

      const record = {
        name: customerData.company_name,
        contact_name: customerData.contact_name || null,
        email: customerData.email || null,
        phone: customerData.phone || null,
        phone_secondary: customerData.phone_secondary || null,
        phone_mobile: customerData.phone_mobile || null,
        phone_fax: customerData.phone_fax || null,
        email_secondary: customerData.email_secondary || null,
        address: customerData.address || null,
        city: customerData.city || null,
        state: customerData.state || null,
        zip: customerData.zip || null,
        status: 'active'
      };

      if (existingId) {
        const { error } = await supabase
          .from("customers")
          .update(record)
          .eq("id", existingId);
        
        if (!error) updated++;
      } else {
        const { error } = await supabase
          .from("customers")
          .insert(record);
        
        if (!error) created++;
      }
    }

    console.log(`Customer update complete: ${created} created, ${updated} updated, ${errors} errors`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        created,
        updated,
        processed,
        errors,
        total: processedCustomers.size
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in ai-update-customers:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
