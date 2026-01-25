import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { Resend } from "https://esm.sh/resend@4.0.0";
import { encode as base64Encode } from "https://deno.land/std@0.208.0/encoding/base64.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

interface SendInvoiceEmailRequest {
  tenant_id: string;
  invoice_id: string;
}

interface AttachmentInfo {
  invoice: boolean;
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

    // Load company profile for accounting email and sender info
    const { data: company } = await supabase
      .from("company_profile")
      .select("*")
      .eq("tenant_id", tenant_id)
      .maybeSingle();

    // Require accounting email for CC
    if (!company?.accounting_email) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "Company Profile accounting email is not set. Please configure it in Settings → Company Profile." 
        }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
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

    // Determine recipient email: billing_email > email
    const toEmail = customer?.billing_email || customer?.email;
    if (!toEmail) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: "No billing email found. Please add a billing email or primary email to the customer record." 
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

    // Collect attachments from load_documents
    const warnings: string[] = [];
    const attachments: Array<{ filename: string; content: string; type?: string }> = [];
    const attachmentInfo: AttachmentInfo = {
      invoice: false,
      rate_confirmation: false,
      bill_of_lading: false,
    };

    if (loadIds.length > 0) {
      // Use correct schema: file_url, file_name, document_type
      // Order by uploaded_at DESC to get newest first
      const { data: documents } = await supabase
        .from("load_documents")
        .select("id, load_id, document_type, file_name, file_url, uploaded_at")
        .in("load_id", loadIds)
        .in("document_type", ["rate_confirmation", "bill_of_lading", "pod"])
        .order("uploaded_at", { ascending: false });

      if (!documents || documents.length === 0) {
        warnings.push("No rate confirmation or BOL documents found for attached loads");
      } else {
        // Deduplicate: keep only newest RC and newest BOL/POD per load
        const seenRcByLoad = new Set<string>();
        const seenBolByLoad = new Set<string>();
        const uniqueDocs: typeof documents = [];

        for (const doc of documents) {
          const isRc = doc.document_type === "rate_confirmation";
          const isBol = doc.document_type === "bill_of_lading" || doc.document_type === "pod";
          
          if (isRc) {
            if (!seenRcByLoad.has(doc.load_id)) {
              seenRcByLoad.add(doc.load_id);
              uniqueDocs.push(doc);
            }
          } else if (isBol) {
            if (!seenBolByLoad.has(doc.load_id)) {
              seenBolByLoad.add(doc.load_id);
              uniqueDocs.push(doc);
            }
          }
        }

        for (const doc of uniqueDocs) {
          if (doc.file_url) {
            try {
              // Download from storage bucket 'load-documents'
              const { data: fileData, error: downloadError } = await supabase
                .storage
                .from("load-documents")
                .download(doc.file_url);

              if (downloadError || !fileData) {
                warnings.push(`Failed to download ${doc.document_type}: ${downloadError?.message || 'Unknown error'}`);
                continue;
              }

              // Convert blob to base64 safely using Deno std library
              const arrayBuffer = await fileData.arrayBuffer();
              const uint8Array = new Uint8Array(arrayBuffer);
              const base64Content = base64Encode(uint8Array);
              
              const filename = doc.file_name || `${doc.document_type}_${doc.load_id.slice(0, 8)}.pdf`;
              
              attachments.push({ 
                filename, 
                content: base64Content,
              });
              
              if (doc.document_type === "rate_confirmation") {
                attachmentInfo.rate_confirmation = true;
              } else if (doc.document_type === "bill_of_lading" || doc.document_type === "pod") {
                attachmentInfo.bill_of_lading = true;
              }
            } catch (err) {
              warnings.push(`Error fetching ${doc.document_type}: ${err instanceof Error ? err.message : 'Unknown error'}`);
            }
          }
        }
      }
    }

    // Generate Invoice HTML for both email body and attachment
    const invoiceHtml = generateInvoiceHtml(invoice, loads || [], company, customer);
    
    // Attach invoice as HTML file (PDF generation not feasible in edge without heavy deps)
    const invoiceFilename = `invoice_${invoice.invoice_number}.html`;
    const invoiceHtmlBase64 = base64Encode(new TextEncoder().encode(invoiceHtml));
    attachments.push({
      filename: invoiceFilename,
      content: invoiceHtmlBase64,
    });
    attachmentInfo.invoice = true;

    // Build email
    const subject = `Invoice ${invoice.invoice_number} from ${company?.company_name || 'Our Company'}`;
    const emailBody = buildEmailBody(invoice, loads || [], company, customer);

    // Fixed verified sender domain - never use resend.dev or company email as sender
    const fromEmail = `${company?.company_name || 'Billing'} <billing@blueforgetechnologies.org>`;
    const replyTo = company.accounting_email;

    // Send email via Resend with CC to accounting
    const resend = new Resend(resendApiKey);
    
    const emailPayload: {
      from: string;
      to: string[];
      cc?: string[];
      reply_to?: string;
      subject: string;
      html: string;
      attachments?: Array<{ filename: string; content: string }>;
    } = {
      from: fromEmail,
      to: [toEmail],
      cc: [company.accounting_email],
      reply_to: replyTo,
      subject,
      html: emailBody,
    };

    if (attachments.length > 0) {
      emailPayload.attachments = attachments;
    }

    console.log(`Sending invoice email to ${toEmail}, CC: ${company.accounting_email}`);
    const emailResponse = await resend.emails.send(emailPayload);

    if (!emailResponse.data?.id) {
      const errorMessage = emailResponse.error?.message || "Failed to send email";
      console.error("Resend error:", emailResponse.error);
      
      // Log failed attempt
      await supabase.from("invoice_email_log").insert({
        tenant_id,
        invoice_id,
        to_email: toEmail,
        cc: company.accounting_email,
        subject,
        status: "failed",
        error: errorMessage,
        attachments: attachmentInfo,
        warnings: warnings.length > 0 ? warnings : null,
      });

      // Update invoice status to failed
      await supabase
        .from("invoices")
        .update({ status: "failed" })
        .eq("id", invoice_id);

      return new Response(
        JSON.stringify({ success: false, error: errorMessage }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // SUCCESS - update invoice and loads
    const now = new Date().toISOString();

    // Update invoice status to sent
    await supabase
      .from("invoices")
      .update({
        status: "sent",
        sent_at: now,
      })
      .eq("id", invoice_id);

    // Update linked loads financial_status to invoiced
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
      cc: company.accounting_email,
      subject,
      resend_message_id: emailResponse.data.id,
      status: "sent",
      attachments: attachmentInfo,
      warnings: warnings.length > 0 ? warnings : null,
    });

    console.log(`Invoice ${invoice.invoice_number} sent successfully, message_id: ${emailResponse.data.id}`);

    return new Response(
      JSON.stringify({
        success: true,
        invoice_id,
        invoice_number: invoice.invoice_number,
        to_email: toEmail,
        cc_email: company.accounting_email,
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

function generateInvoiceHtml(
  invoice: Record<string, unknown>,
  loads: Array<Record<string, unknown>>,
  company: Record<string, unknown> | null,
  customer: Record<string, unknown> | null
): string {
  const formatCurrency = (amount: number) => 
    new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(amount || 0);

  const loadsHtml = loads.map(load => `
    <tr>
      <td style="padding: 10px; border: 1px solid #ddd;">${load.load_number || 'N/A'}</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${load.pickup_location || ''}</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${load.delivery_location || ''}</td>
      <td style="padding: 10px; border: 1px solid #ddd;">${load.pickup_date || ''}</td>
      <td style="padding: 10px; border: 1px solid #ddd; text-align: right;">${formatCurrency(load.rate as number)}</td>
    </tr>
  `).join("");

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Invoice ${invoice.invoice_number}</title>
  <style>
    body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 20px; }
    .header { display: flex; justify-content: space-between; margin-bottom: 30px; }
    .company-info { text-align: right; }
    .invoice-title { font-size: 28px; color: #333; margin-bottom: 20px; }
    .info-section { margin-bottom: 20px; }
    .info-row { margin: 5px 0; }
    .label { font-weight: bold; color: #666; }
    table { width: 100%; border-collapse: collapse; margin: 20px 0; }
    th { background: #333; color: white; padding: 12px; text-align: left; }
    th:last-child { text-align: right; }
    .totals { text-align: right; margin-top: 20px; }
    .total-row { margin: 5px 0; }
    .grand-total { font-size: 1.3em; font-weight: bold; color: #2e7d32; }
    .remittance { margin-top: 30px; padding: 20px; background: #f5f5f5; border-radius: 4px; }
    .factoring { margin-top: 20px; padding: 15px; background: #fff3e0; border-radius: 4px; border-left: 4px solid #ff9800; }
  </style>
</head>
<body>
  <div class="header">
    <div>
      <h1 class="invoice-title">INVOICE</h1>
      <div class="info-row"><span class="label">Invoice #:</span> ${invoice.invoice_number}</div>
      <div class="info-row"><span class="label">Date:</span> ${invoice.invoice_date || 'N/A'}</div>
      <div class="info-row"><span class="label">Due Date:</span> ${invoice.due_date || 'N/A'}</div>
      <div class="info-row"><span class="label">Terms:</span> ${invoice.payment_terms || 'Net 30'}</div>
    </div>
    <div class="company-info">
      <h2>${company?.company_name || ''}</h2>
      <p>${company?.address || ''}</p>
      <p>${company?.city || ''}, ${company?.state || ''} ${company?.zip || ''}</p>
      <p>${company?.phone || ''}</p>
      <p>${company?.email || ''}</p>
      ${company?.mc_number ? `<p>MC# ${company.mc_number}</p>` : ''}
      ${company?.dot_number ? `<p>DOT# ${company.dot_number}</p>` : ''}
    </div>
  </div>

  <div class="info-section">
    <h3>Bill To:</h3>
    <p><strong>${customer?.name || invoice.customer_name || 'N/A'}</strong></p>
    ${customer?.address ? `<p>${customer.address}</p>` : ''}
    ${customer?.city ? `<p>${customer.city}, ${customer.state || ''} ${customer.zip || ''}</p>` : ''}
    ${customer?.mc_number ? `<p>MC# ${customer.mc_number}</p>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>Load #</th>
        <th>Origin</th>
        <th>Destination</th>
        <th>Date</th>
        <th>Amount</th>
      </tr>
    </thead>
    <tbody>
      ${loadsHtml || '<tr><td colspan="5" style="text-align: center; padding: 20px;">No loads attached</td></tr>'}
    </tbody>
  </table>

  <div class="totals">
    <div class="total-row"><span class="label">Subtotal:</span> ${formatCurrency(invoice.subtotal as number)}</div>
    ${(invoice.tax as number) > 0 ? `<div class="total-row"><span class="label">Tax:</span> ${formatCurrency(invoice.tax as number)}</div>` : ''}
    <div class="total-row grand-total"><span class="label">Total Due:</span> ${formatCurrency(invoice.total_amount as number)}</div>
    ${(invoice.amount_paid as number) > 0 ? `
      <div class="total-row"><span class="label">Amount Paid:</span> -${formatCurrency(invoice.amount_paid as number)}</div>
      <div class="total-row"><span class="label">Balance Due:</span> ${formatCurrency(invoice.balance_due as number)}</div>
    ` : ''}
  </div>

  ${company?.remittance_info ? `
    <div class="remittance">
      <h3>Remittance Information</h3>
      <p style="white-space: pre-wrap;">${company.remittance_info}</p>
    </div>
  ` : ''}

  ${company?.factoring_company_name ? `
    <div class="factoring">
      <h4>Payment Address (Factoring)</h4>
      <p><strong>${company.factoring_company_name}</strong></p>
      <p>${company.factoring_company_address || ''}</p>
      <p>${company.factoring_company_city || ''}, ${company.factoring_company_state || ''} ${company.factoring_company_zip || ''}</p>
    </div>
  ` : ''}

  <div style="margin-top: 40px; text-align: center; color: #666; font-size: 0.9em;">
    <p>Thank you for your business!</p>
  </div>
</body>
</html>
  `;
}

function buildEmailBody(
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
    
    <!-- Quick Summary Box -->
    <div style="background: #1a365d; color: white; padding: 20px; border-radius: 8px; margin-bottom: 25px; text-align: center;">
      <h2 style="margin: 0 0 10px 0; font-size: 1.5em;">Invoice ${invoice.invoice_number}</h2>
      <p style="margin: 0; font-size: 1.8em; font-weight: bold;">${formatCurrency(invoice.total_amount as number)}</p>
      <p style="margin: 8px 0 0 0; opacity: 0.9;">Due: ${invoice.due_date || 'Upon Receipt'}</p>
    </div>
    
    <!-- Attachments Note -->
    <div style="background: #f0f9ff; border: 1px solid #bae6fd; padding: 12px 15px; border-radius: 6px; margin-bottom: 20px;">
      <p style="margin: 0; color: #0369a1; font-size: 0.95em;">
        📎 <strong>Attached:</strong> Invoice, Rate Confirmation(s), and Bill of Lading/POD document(s).
      </p>
    </div>

    <div style="text-align: center; margin-bottom: 20px;">
      <p style="color: #666; margin: 5px 0;">From ${company?.company_name || 'Our Company'}</p>
    </div>

    <div style="margin-bottom: 20px;">
      <p><strong>Invoice Date:</strong> ${invoice.invoice_date || 'N/A'}</p>
      <p><strong>Due Date:</strong> ${invoice.due_date || 'N/A'}</p>
      <p><strong>Payment Terms:</strong> ${invoice.payment_terms || 'Net 30'}</p>
    </div>

    <div style="margin-bottom: 20px; padding: 15px; background: #f9f9f9; border-radius: 4px;">
      <h3 style="margin-top: 0;">Bill To:</h3>
      <p style="margin: 0;"><strong>${customer?.name || invoice.customer_name || 'N/A'}</strong></p>
      ${customer?.address ? `<p style="margin: 5px 0; color: #666;">${customer.address}</p>` : ''}
      ${customer?.city && customer?.state ? `<p style="margin: 5px 0; color: #666;">${customer.city}, ${customer.state} ${customer.zip || ''}</p>` : ''}
      ${customer?.mc_number ? `<p style="margin: 5px 0; color: #666;">MC# ${customer.mc_number}</p>` : ''}
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
        ${loadsHtml || '<tr><td colspan="3" style="text-align: center; padding: 15px;">No loads attached</td></tr>'}
      </tbody>
    </table>

    <div style="text-align: right; padding: 20px; background: #f9f9f9; border-radius: 4px;">
      <p style="margin: 5px 0;"><strong>Subtotal:</strong> ${formatCurrency(invoice.subtotal as number)}</p>
      ${(invoice.tax as number) > 0 ? `<p style="margin: 5px 0;"><strong>Tax:</strong> ${formatCurrency(invoice.tax as number)}</p>` : ''}
      <p style="margin: 10px 0; font-size: 1.2em;"><strong>Total Due:</strong> ${formatCurrency(invoice.total_amount as number)}</p>
      ${(invoice.balance_due as number) !== (invoice.total_amount as number) && (invoice.amount_paid as number) > 0 ? `
        <p style="margin: 5px 0; color: #666;"><strong>Balance Due:</strong> ${formatCurrency(invoice.balance_due as number)}</p>
      ` : ''}
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
        <p style="margin: 0;"><strong>${company.factoring_company_name}</strong></p>
        <p style="margin: 5px 0;">${company.factoring_company_address || ''}</p>
        <p style="margin: 0;">${company.factoring_company_city || ''}, ${company.factoring_company_state || ''} ${company.factoring_company_zip || ''}</p>
      </div>
    ` : ''}

    <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid #eee; text-align: center; color: #666; font-size: 0.9em;">
      <p>Thank you for your business!</p>
      <p style="margin-top: 10px;">Please find the invoice and supporting documents attached.</p>
      ${company?.phone ? `<p>Questions? Contact us at ${company.phone}</p>` : ''}
      ${company?.accounting_email ? `<p>Accounting: ${company.accounting_email}</p>` : ''}
    </div>
  </div>
</body>
</html>
  `;
}
