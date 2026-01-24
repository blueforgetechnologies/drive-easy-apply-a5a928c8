import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendInvoiceEmailRequest {
  tenant_id: string;
  invoice_id: string;
}

interface AttachmentInfo {
  invoice_pdf: boolean;
  rate_confirmation: boolean;
  bill_of_lading: boolean;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return new Response(
        JSON.stringify({ success: false, error: "Unauthorized" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const resendApiKey = Deno.env.get("RESEND_API_KEY");

    if (!resendApiKey) {
      return new Response(
        JSON.stringify({ success: false, error: "RESEND_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create authenticated client to verify user access
    const supabaseAuth = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get authenticated user
    const { data: { user }, error: userError } = await supabaseAuth.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ success: false, error: "Invalid token" }),
        { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }
    const userId = user.id;

    const { tenant_id, invoice_id }: SendInvoiceEmailRequest = await req.json();

    if (!tenant_id || !invoice_id) {
      return new Response(
        JSON.stringify({ success: false, error: "tenant_id and invoice_id are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Use service role for DB operations
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user can access tenant
    const { data: membership } = await supabase
      .from("tenant_users")
      .select("id")
      .eq("user_id", userId)
      .eq("tenant_id", tenant_id)
      .eq("is_active", true)
      .maybeSingle();

    const { data: platformAdmin } = await supabase
      .from("profiles")
      .select("is_platform_admin")
      .eq("id", userId)
      .maybeSingle();

    if (!membership && !platformAdmin?.is_platform_admin) {
      return new Response(
        JSON.stringify({ success: false, error: "Access denied to this tenant" }),
        { status: 403, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load invoice with tenant check
    const { data: invoice, error: invoiceError } = await supabase
      .from("invoices")
      .select("*")
      .eq("id", invoice_id)
      .eq("tenant_id", tenant_id)
      .single();

    if (invoiceError || !invoice) {
      return new Response(
        JSON.stringify({ success: false, error: "Invoice not found or access denied" }),
        { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (invoice.billing_method !== "direct_email") {
      return new Response(
        JSON.stringify({ success: false, error: "Invoice billing method is not direct_email" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load customer
    const { data: customer } = await supabase
      .from("customers")
      .select("*")
      .eq("id", invoice.customer_id)
      .single();

    // Determine recipient email
    const toEmail = customer?.email_secondary || customer?.email;
    if (!toEmail) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "No billing email found. Please add an email to the customer record." 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Load linked loads via invoice_loads
    const { data: invoiceLoads } = await supabase
      .from("invoice_loads")
      .select("load_id, amount, description")
      .eq("invoice_id", invoice_id);

    const loadIds = invoiceLoads?.map(il => il.load_id) || [];
    
    // Load full load details
    const { data: loads } = await supabase
      .from("loads")
      .select("id, load_number, pickup_location, delivery_location, pickup_date, delivery_date, rate")
      .in("id", loadIds.length > 0 ? loadIds : ["00000000-0000-0000-0000-000000000000"]);

    // Load company profile for remittance info
    const { data: company } = await supabase
      .from("company_profile")
      .select("*")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    // Collect attachments from load_documents
    const warnings: string[] = [];
    const attachments: Array<{ filename: string; content: string }> = [];
    const attachmentInfo: AttachmentInfo = {
      invoice_pdf: false,
      rate_confirmation: false,
      bill_of_lading: false,
    };

    if (loadIds.length > 0) {
      const { data: documents } = await supabase
        .from("load_documents")
        .select("*")
        .in("load_id", loadIds)
        .in("document_type", ["rate_confirmation", "bill_of_lading", "pod"]);

      if (!documents || documents.length === 0) {
        warnings.push("No rate confirmation or BOL documents found for attached loads");
      } else {
        for (const doc of documents) {
          if (doc.document_url) {
            try {
              // Fetch document from storage
              const response = await fetch(doc.document_url);
              if (response.ok) {
                const arrayBuffer = await response.arrayBuffer();
                const base64 = btoa(String.fromCharCode(...new Uint8Array(arrayBuffer)));
                
                const filename = doc.filename || `${doc.document_type}_${doc.load_id.slice(0, 8)}.pdf`;
                attachments.push({ filename, content: base64 });
                
                if (doc.document_type === "rate_confirmation") {
                  attachmentInfo.rate_confirmation = true;
                } else if (doc.document_type === "bill_of_lading" || doc.document_type === "pod") {
                  attachmentInfo.bill_of_lading = true;
                }
              } else {
                warnings.push(`Failed to fetch document: ${doc.document_type}`);
              }
            } catch (err) {
              warnings.push(`Error fetching ${doc.document_type}: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }
        }
      }
    }

    // Generate Invoice PDF HTML (server-side generation)
    const invoicePdfHtml = generateInvoicePdfHtml(invoice, loads || [], company, customer);
    
    // For now, we'll include the invoice as HTML in the email body
    // A more robust solution would use a PDF generation library like jsPDF on server
    attachmentInfo.invoice_pdf = true;

    // Build email HTML
    const subject = `Invoice ${invoice.invoice_number} from ${company?.company_name || 'Our Company'}`;
    const emailHtml = buildEmailHtml(invoice, loads || [], company, customer);

    // Send email via Resend
    const resend = new Resend(resendApiKey);
    
    const emailPayload: {
      from: string;
      to: string[];
      subject: string;
      html: string;
      attachments?: Array<{ filename: string; content: string }>;
    } = {
      from: company?.email || "billing@resend.dev",
      to: [toEmail],
      subject,
      html: emailHtml,
    };

    if (attachments.length > 0) {
      emailPayload.attachments = attachments;
    }

    const emailResponse = await resend.emails.send(emailPayload);

    if (!emailResponse.data?.id) {
      const errorMessage = emailResponse.error?.message || "Failed to send email";
      
      // Log failed attempt
      await supabase.from("invoice_email_log").insert({
        tenant_id,
        invoice_id,
        to_email: toEmail,
        subject,
        status: "failed",
        error: errorMessage,
        attachments: attachmentInfo,
        warnings,
      });

      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Success - update invoice and loads
    const now = new Date().toISOString();

    // Update invoice status
    await supabase
      .from("invoices")
      .update({
        status: "sent",
        sent_at: now,
      })
      .eq("id", invoice_id);

    // Update linked loads financial_status
    if (loadIds.length > 0) {
      await supabase
        .from("loads")
        .update({ financial_status: "invoiced" })
        .in("id", loadIds);
    }

    // Log successful send
    await supabase.from("invoice_email_log").insert({
      tenant_id,
      invoice_id,
      to_email: toEmail,
      subject,
      resend_message_id: emailResponse.data.id,
      status: "sent",
      attachments: attachmentInfo,
      warnings: warnings.length > 0 ? warnings : null,
    });

    return new Response(
      JSON.stringify({
        success: true,
        invoice_id,
        invoice_number: invoice.invoice_number,
        to_email: toEmail,
        resend_message_id: emailResponse.data.id,
        attachments: attachmentInfo,
        warnings,
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("send-invoice-email error:", error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

function generateInvoicePdfHtml(
  invoice: Record<string, unknown>,
  loads: Array<Record<string, unknown>>,
  company: Record<string, unknown> | null,
  customer: Record<string, unknown> | null
): string {
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount || 0);

  const loadsHtml = loads.map(load => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${load.load_number || 'N/A'}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${load.pickup_location || ''} → ${load.delivery_location || ''}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(load.rate as number)}</td>
    </tr>
  `).join("");

  return `
    <!DOCTYPE html>
    <html>
    <head><meta charset="utf-8"></head>
    <body style="font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px;">
      <h1 style="color: #333;">Invoice ${invoice.invoice_number}</h1>
      <p><strong>Date:</strong> ${invoice.invoice_date || 'N/A'}</p>
      <p><strong>Due Date:</strong> ${invoice.due_date || 'N/A'}</p>
      <p><strong>Bill To:</strong> ${customer?.name || invoice.customer_name || 'N/A'}</p>
      
      <table style="width: 100%; border-collapse: collapse; margin: 20px 0;">
        <thead>
          <tr style="background: #f5f5f5;">
            <th style="padding: 8px; text-align: left;">Load #</th>
            <th style="padding: 8px; text-align: left;">Route</th>
            <th style="padding: 8px; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${loadsHtml}
        </tbody>
        <tfoot>
          <tr>
            <td colspan="2" style="padding: 8px; text-align: right; font-weight: bold;">Total:</td>
            <td style="padding: 8px; text-align: right; font-weight: bold;">${formatCurrency(invoice.total_amount as number)}</td>
          </tr>
        </tfoot>
      </table>
      
      ${company?.remittance_info ? `<div style="margin-top: 20px; padding: 10px; background: #f9f9f9;"><h3>Remittance Information</h3><p>${company.remittance_info}</p></div>` : ''}
    </body>
    </html>
  `;
}

function buildEmailHtml(
  invoice: Record<string, unknown>,
  loads: Array<Record<string, unknown>>,
  company: Record<string, unknown> | null,
  customer: Record<string, unknown> | null
): string {
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount || 0);

  const loadsHtml = loads.map(load => `
    <tr>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${load.load_number || 'N/A'}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee;">${load.pickup_location || ''} → ${load.delivery_location || ''}</td>
      <td style="padding: 8px; border-bottom: 1px solid #eee; text-align: right;">${formatCurrency(load.rate as number)}</td>
    </tr>
  `).join("");

  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
    </head>
    <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background-color: #f4f4f4;">
      <div style="background: white; padding: 30px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
        <div style="text-align: center; margin-bottom: 30px;">
          <h1 style="color: #333; margin: 0;">Invoice ${invoice.invoice_number}</h1>
          <p style="color: #666; margin: 5px 0;">From ${company?.company_name || 'Our Company'}</p>
        </div>

        <div style="margin-bottom: 20px;">
          <p><strong>Invoice Date:</strong> ${invoice.invoice_date || 'N/A'}</p>
          <p><strong>Due Date:</strong> ${invoice.due_date || 'N/A'}</p>
          <p><strong>Payment Terms:</strong> ${invoice.payment_terms || 'Net 30'}</p>
        </div>

        <div style="margin-bottom: 20px; padding: 15px; background: #f9f9f9; border-radius: 4px;">
          <h3 style="margin-top: 0;">Bill To:</h3>
          <p style="margin: 0;">${customer?.name || invoice.customer_name || 'N/A'}</p>
          ${customer?.address ? `<p style="margin: 5px 0; color: #666;">${customer.address}</p>` : ''}
          ${customer?.city && customer?.state ? `<p style="margin: 5px 0; color: #666;">${customer.city}, ${customer.state} ${customer.zip || ''}</p>` : ''}
        </div>

        <h3>Load Details</h3>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
          <thead>
            <tr style="background: #333; color: white;">
              <th style="padding: 10px; text-align: left;">Load #</th>
              <th style="padding: 10px; text-align: left;">Route</th>
              <th style="padding: 10px; text-align: right;">Amount</th>
            </tr>
          </thead>
          <tbody>
            ${loadsHtml}
          </tbody>
        </table>

        <div style="text-align: right; padding: 20px; background: #f9f9f9; border-radius: 4px;">
          <p style="margin: 5px 0;"><strong>Subtotal:</strong> ${formatCurrency(invoice.subtotal as number)}</p>
          ${(invoice.tax as number) > 0 ? `<p style="margin: 5px 0;"><strong>Tax:</strong> ${formatCurrency(invoice.tax as number)}</p>` : ''}
          <p style="margin: 10px 0; font-size: 1.2em;"><strong>Total Due:</strong> ${formatCurrency(invoice.total_amount as number)}</p>
          ${(invoice.balance_due as number) !== (invoice.total_amount as number) ? `<p style="margin: 5px 0; color: #666;"><strong>Balance Due:</strong> ${formatCurrency(invoice.balance_due as number)}</p>` : ''}
        </div>

        ${company?.remittance_info ? `
          <div style="margin-top: 30px; padding: 20px; background: #e8f4e8; border-radius: 4px; border-left: 4px solid #4caf50;">
            <h3 style="margin-top: 0; color: #2e7d32;">Remittance Information</h3>
            <p style="margin: 0; white-space: pre-wrap;">${company.remittance_info}</p>
          </div>
        ` : ''}

        ${company?.factoring_company_name ? `
          <div style="margin-top: 20px; padding: 15px; background: #fff3e0; border-radius: 4px; border-left: 4px solid #ff9800;">
            <h4 style="margin-top: 0; color: #e65100;">Payment Address</h4>
            <p style="margin: 0;">${company.factoring_company_name}</p>
            <p style="margin: 5px 0;">${company.factoring_company_address || ''}</p>
            <p style="margin: 0;">${company.factoring_company_city || ''}, ${company.factoring_company_state || ''} ${company.factoring_company_zip || ''}</p>
          </div>
        ` : ''}

        <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 0.9em;">
          <p>Thank you for your business!</p>
          ${company?.phone ? `<p>Questions? Contact us at ${company.phone}</p>` : ''}
          ${company?.email ? `<p>${company.email}</p>` : ''}
        </div>
      </div>
    </body>
    </html>
  `;
}
