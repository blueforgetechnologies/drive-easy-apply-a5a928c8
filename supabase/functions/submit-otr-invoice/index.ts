import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient as _createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, getServiceClient } from "../_shared/assertTenantAccess.ts";
import {
  OTR_API_BASE_URL,
  getOtrCredentialsFromEnv,
} from "../_shared/otrClient.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OTR PostInvoices payload - matches exact field names from OTR API v2.1 docs
// Based on their API Reference Body Params section
interface OtrPostInvoicePayload {
  // Required fields (from OTR API docs)
  CustomerMC: number;        // Broker MC number (numeric) - required
  ClientDOT: string;         // Your carrier DOT number - required
  FromCity: string;          // Pickup city - required
  FromState: string;         // Pickup state (2-letter) - required
  ToCity: string;            // Delivery city - required
  ToState: string;           // Delivery state (2-letter) - required
  PoNumber: string;          // PO/Reference number - required
  InvoiceNo: string;         // Invoice number - required
  InvoiceDate: string;       // date-time format (ISO 8601 recommended)
  InvoiceAmount: number;     // float - required
  
  // Optional fields
  TermPkey?: number;         // Payment terms key
  Weight?: number;           // Total weight
  Miles?: number;            // Total miles
  Notes?: string;            // Additional notes
}

interface OtrInvoiceResponse {
  success?: boolean;
  invoicePkey?: number;
  invoiceId?: string;
  status?: string;
  message?: string;
  errors?: string[];
  [key: string]: unknown;
}

// Submit invoice to OTR Solutions - only subscription key needed per OpenAPI spec
async function submitInvoiceToOtr(
  payload: OtrPostInvoicePayload,
  subscriptionKey: string
): Promise<{
  success: boolean;
  invoice_id?: string;
  status?: string;
  raw_response?: OtrInvoiceResponse;
  error?: string;
}> {
  try {
    console.log(`[submit-otr-invoice] Submitting invoice ${payload.InvoiceNo} to OTR...`);
    console.log(`[submit-otr-invoice] Payload:`, JSON.stringify(payload, null, 2));
    
    const endpoint = `${OTR_API_BASE_URL}/invoices`;
    console.log(`[submit-otr-invoice] Posting to: ${endpoint}`);
    
    // Per OpenAPI spec: only ocp-apim-subscription-key header required (no Bearer token)
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'ocp-apim-subscription-key': subscriptionKey,
      },
      body: JSON.stringify(payload)
    });

    console.log(`[submit-otr-invoice] Response status: ${response.status}`);
    const responseText = await response.text();
    console.log(`[submit-otr-invoice] Response body: ${responseText}`);

    let data: OtrInvoiceResponse;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { success: response.ok, message: responseText };
    }

    if (!response.ok) {
      console.error(`[submit-otr-invoice] OTR API error: ${response.status}`);
      
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: 'Invalid OTR subscription key or access denied', raw_response: data };
      }
      if (response.status === 400) {
        return { 
          success: false, 
          error: `Validation error: ${data.message || data.errors?.join(', ') || 'Invalid invoice data'}`,
          raw_response: data
        };
      }
      return { 
        success: false, 
        error: `OTR API error: ${response.status} - ${data.message || responseText}`,
        raw_response: data
      };
    }

    return {
      success: true,
      invoice_id: data.invoicePkey?.toString() || data.invoiceId,
      status: data.status || 'submitted',
      raw_response: data
    };
  } catch (error) {
    console.error('[submit-otr-invoice] OTR API error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to submit invoice'
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { 
      tenant_id,
      load_id: providedLoadId,  // Single load ID to submit (optional if invoice_id provided)
      invoice_id,               // Invoice ID - will look up loads from invoice_loads table
      quick_pay = false
    } = body;

    // Validate tenant access
    const authHeader = req.headers.get('Authorization');
    const accessCheck = await assertTenantAccess(authHeader, tenant_id);
    
    if (!accessCheck.allowed) {
      return accessCheck.response!;
    }

    const adminClient = getServiceClient();

    // Get OTR credentials
    const credentials = getOtrCredentialsFromEnv();
    if (!credentials) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'OTR Solutions credentials not configured' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get company profile for carrier info (ClientDOT)
    const { data: companyProfile } = await adminClient
      .from('company_profile')
      .select('*')
      .eq('tenant_id', tenant_id)
      .single();

    if (!companyProfile) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Company profile not configured. Please set up your company DOT number first.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!companyProfile.dot_number) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Company DOT number not configured in company profile' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Determine load_id - either provided directly or look up from invoice_loads table
    let load_id = providedLoadId;
    
    if (!load_id && invoice_id) {
      // Look up load(s) from invoice_loads join table
      const { data: invoiceLoads, error: invoiceLoadsError } = await adminClient
        .from('invoice_loads')
        .select('load_id')
        .eq('invoice_id', invoice_id)
        .eq('tenant_id', tenant_id);
      
      if (invoiceLoadsError) {
        console.error('[submit-otr-invoice] Error looking up invoice loads:', invoiceLoadsError);
      }
      
      if (invoiceLoads && invoiceLoads.length > 0) {
        // Use the first load associated with this invoice
        load_id = invoiceLoads[0].load_id;
        console.log(`[submit-otr-invoice] Found load_id ${load_id} from invoice ${invoice_id}`);
      }
    }

    if (!load_id) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'No load associated with this invoice. Please ensure the invoice has loads attached.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get load details
    const { data: load, error: loadError } = await adminClient
      .from('loads')
      .select('*')
      .eq('id', load_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (loadError || !load) {
      console.error('[submit-otr-invoice] Load not found:', { load_id, tenant_id, error: loadError });
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `Load not found (ID: ${load_id})` 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get customer/broker info for MC number
    let customerMc: number | null = null;
    let brokerName = load.broker_name || load.customer_name;

    if (load.customer_id) {
      const { data: customer } = await adminClient
        .from('customers')
        .select('mc_number, name')
        .eq('id', load.customer_id)
        .single();

      if (customer?.mc_number) {
        // Clean MC number and convert to number
        const cleanMc = customer.mc_number.replace(/^MC-?/i, '').replace(/\D/g, '').trim();
        customerMc = parseInt(cleanMc, 10);
        brokerName = customer.name || brokerName;
      }
    }

    // Try to get MC from load's broker_mc field if not found on customer
    if (!customerMc && load.broker_mc) {
      const cleanMc = String(load.broker_mc).replace(/^MC-?/i, '').replace(/\D/g, '').trim();
      customerMc = parseInt(cleanMc, 10);
    }

    if (!customerMc || isNaN(customerMc)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Broker MC number required. Add MC number to customer record first.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate required location fields
    if (!load.pickup_city || !load.pickup_state) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Pickup city and state are required' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!load.delivery_city || !load.delivery_state) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Delivery city and state are required' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If invoice_id is provided, prefer invoice fields (invoice_number / total_amount / invoice_date)
    // because OTR's PostInvoices examples typically use the invoice number (often numeric).
    let invoiceNumber: string | null = null;
    let invoiceAmount: number = Number(load.rate || 0);
    // OTR example shows YYYY-MM-DD format (not full RFC3339)
    let invoiceDate: string = new Date().toISOString().split('T')[0];

    if (invoice_id) {
      const { data: invoice, error: invoiceError } = await adminClient
        .from('invoices')
        .select('invoice_number, invoice_date, total_amount')
        .eq('id', invoice_id)
        .single();

      if (invoiceError) {
        console.warn('[submit-otr-invoice] Failed to fetch invoice details, falling back to load fields:', invoiceError);
      }

      if (invoice) {
        invoiceNumber = invoice.invoice_number ? String(invoice.invoice_number) : null;

        // total_amount is NUMERIC in DB; it may come back as string.
        const rawAmount: unknown = (invoice as any).total_amount;
        const parsedAmount = typeof rawAmount === 'number' ? rawAmount : parseFloat(String(rawAmount || '0'));
        if (!Number.isNaN(parsedAmount)) {
          invoiceAmount = parsedAmount;
        }

        // invoice_date is DATE in DB (YYYY-MM-DD) - use directly per OTR example
        const rawInvoiceDate: unknown = (invoice as any).invoice_date;
        if (rawInvoiceDate) {
          invoiceDate = String(rawInvoiceDate);
        }
      }
    }

    // Fallback invoice number: use load_number or generated value
    if (!invoiceNumber) {
      invoiceNumber = String(load.load_number || `INV-${Date.now()}`);
    }

    // Get reference/PO number - use reference_number, po_number, or load_number
    const poNumber = String(load.reference_number || load.po_number || load.load_number || invoiceNumber);
    
    if (invoiceAmount <= 0) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invoice amount must be greater than 0' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build OTR payload with exact field names from API docs
    // Per OpenAPI spec: InvoiceDate can be YYYY-MM-DD format
    const otrPayload: OtrPostInvoicePayload = {
      CustomerMC: customerMc,
      ClientDOT: String(companyProfile.dot_number),
      FromCity: load.pickup_city.toUpperCase(),
      FromState: load.pickup_state.toUpperCase().slice(0, 2),
      ToCity: load.delivery_city.toUpperCase(),
      ToState: load.delivery_state.toUpperCase().slice(0, 2),
      PoNumber: poNumber,
      InvoiceNo: invoiceNumber,
      InvoiceDate: invoiceDate,
      InvoiceAmount: parseFloat(invoiceAmount.toFixed(2)), // Ensure float format
    };

    // Add optional fields if available
    if (load.weight) {
      otrPayload.Weight = load.weight;
    }
    if (load.miles) {
      otrPayload.Miles = load.miles;
    }

    console.log('[submit-otr-invoice] Final OTR payload:', JSON.stringify(otrPayload, null, 2));

    // Submit to OTR - only subscription key needed per OpenAPI spec
    const result = await submitInvoiceToOtr(
      otrPayload,
      credentials.subscriptionKey
    );

    // Record submission attempt
    await adminClient
      .from('otr_invoice_submissions')
      .insert({
        tenant_id,
        invoice_id: invoice_id || null,
        load_id,
        broker_mc: customerMc.toString(),
        broker_name: brokerName,
        invoice_number: invoiceNumber,
        invoice_amount: invoiceAmount,
        otr_invoice_id: result.invoice_id,
        status: result.success ? (result.status || 'submitted') : 'failed',
        error_message: result.error,
        raw_request: otrPayload,
        raw_response: result.raw_response,
        submitted_by: accessCheck.user_id,
        quick_pay
      });

    // Update load with OTR submission status
    await adminClient
      .from('loads')
      .update({
        otr_submitted_at: result.success ? new Date().toISOString() : null,
        otr_invoice_id: result.invoice_id || null,
        otr_status: result.success ? (result.status || 'submitted') : 'failed'
      })
      .eq('id', load_id);

    return new Response(
      JSON.stringify({
        success: result.success,
        invoice_id: result.invoice_id,
        status: result.status,
        error: result.error,
        message: result.success 
          ? `Invoice ${invoiceNumber} submitted to OTR successfully` 
          : `Failed to submit invoice: ${result.error}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[submit-otr-invoice] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
