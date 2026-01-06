import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { assertTenantAccess, getServiceClient, deriveTenantFromJWT } from "../_shared/assertTenantAccess.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

/**
 * AI-powered customer extraction from load emails.
 * 
 * TENANT ISOLATION:
 * - Derives tenant_id from JWT (server-side, never from client)
 * - Only processes load_emails belonging to the effective tenant
 * - Only creates/updates customers within the effective tenant
 * - Writes audit log on completion
 * 
 * Tables touched:
 * - load_emails (READ) - scoped by tenant_id
 * - customers (READ/WRITE) - scoped by tenant_id
 * - audit_logs (WRITE) - scoped by tenant_id
 */
serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    
    // Step 1: Derive tenant from JWT (server-side truth)
    const { tenant_id, user_id, error: derivationError } = await deriveTenantFromJWT(authHeader);
    
    if (derivationError) {
      return derivationError;
    }
    
    if (!tenant_id) {
      console.error("[ai-update-customers] No tenant context available");
      return new Response(
        JSON.stringify({ error: "No tenant context. User must belong to a tenant." }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    
    // Step 2: Verify user has access to this tenant
    const access = await assertTenantAccess(authHeader, tenant_id);
    if (!access.allowed) {
      return access.response!;
    }
    
    console.log(`[ai-update-customers] Processing for tenant: ${tenant_id}, user: ${user_id}`);
    
    // Step 3: Use service client for privileged operations (after access verified)
    const supabase = getServiceClient();
    const lovableApiKey = Deno.env.get("LOVABLE_API_KEY")!;

    // CRITICAL: Only fetch emails for this tenant
    console.log(`Fetching load emails for tenant ${tenant_id}...`);
    const { data: emails, error: emailsError } = await supabase
      .from("load_emails")
      .select("*")
      .eq("tenant_id", tenant_id) // TENANT SCOPING
      .order("received_at", { ascending: false })
      .limit(100);

    if (emailsError) throw emailsError;

    console.log(`Processing ${emails?.length || 0} emails with AI for tenant ${tenant_id}...`);

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

    console.log(`Extracted ${processedCustomers.size} unique customers for tenant ${tenant_id}`);

    // CRITICAL: Only fetch existing customers for this tenant
    const { data: existingCustomers } = await supabase
      .from("customers")
      .select("id, name")
      .eq("tenant_id", tenant_id); // TENANT SCOPING

    const existingMap = new Map(
      existingCustomers?.map(c => [c.name.toLowerCase().trim(), c.id]) || []
    );

    // Insert or update customers WITH tenant_id
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
        status: 'active',
        customer_type: 'broker',
        tenant_id: tenant_id, // CRITICAL: Always include tenant_id
      };

      if (existingId) {
        // Update existing - don't change tenant_id
        const { tenant_id: _, ...updateRecord } = record;
        const { error } = await supabase
          .from("customers")
          .update(updateRecord)
          .eq("id", existingId)
          .eq("tenant_id", tenant_id); // DOUBLE-CHECK tenant ownership
        
        if (!error) updated++;
      } else {
        const { error } = await supabase
          .from("customers")
          .insert(record);
        
        if (!error) created++;
      }
    }

    // Step 4: Write audit log
    await supabase.from("audit_logs").insert({
      tenant_id: tenant_id,
      user_id: user_id,
      entity_type: "ai_update_customers",
      entity_id: tenant_id,
      action: "bulk_update",
      notes: `AI customer update: ${created} created, ${updated} updated, ${errors} errors, ${processed} emails processed`,
    });

    console.log(`[ai-update-customers] Complete for tenant ${tenant_id}: ${created} created, ${updated} updated, ${errors} errors`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        tenant_id,
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
