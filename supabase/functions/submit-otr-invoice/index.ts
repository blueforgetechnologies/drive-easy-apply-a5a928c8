import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient as _createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, getServiceClient } from "../_shared/assertTenantAccess.ts";
import { 
  OTR_API_BASE_URL, 
  getOtrCredentialsFromEnv,
  maskSubscriptionKey,
  isTokenAuthEnabled,
  getOtrHeaders,
  getOtrHeadersWithToken,
  getOtrToken,
} from "../_shared/otrClient.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OTR PostInvoices payload per OTR specification
interface OtrPostInvoicePayload {
  BrokerMC: number;          // Broker MC number (numeric, dynamic per request)
  ClientDOT: string;         // Your carrier DOT number (2391750 for Talbi)
  FromCity: string;          // Pickup city
  FromState: string;         // Pickup state (2-letter)
  ToCity: string;            // Delivery city
  ToState: string;           // Delivery state (2-letter)
  PoNumber: string;          // PO/Reference number
  InvoiceNo: string;         // Invoice number
  InvoiceDate: string;       // YYYY-MM-DD format (ISO, do not localize)
  InvoiceAmount: number;     // Invoice amount
  
  // Optional fields
  TermPkey?: number;
  Weight?: number;
  Miles?: number;
  Notes?: string;
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

// Submit invoice to OTR Solutions
// Endpoint: POST {BASE_URL}/invoices
async function submitInvoiceToOtr(
  payload: OtrPostInvoicePayload,
  subscriptionKey: string,
  accessToken?: string  // Optional: only used if token auth is enabled
): Promise<{
  success: boolean;
  invoice_id?: string;
  status?: string;
  raw_response?: OtrInvoiceResponse;
  error?: string;
}> {
  try {
    const requestUrl = `${OTR_API_BASE_URL}/invoices`;
    
    console.log(`[submit-otr-invoice] POST ${requestUrl}`);
    console.log(`[submit-otr-invoice] Subscription key: ${maskSubscriptionKey(subscriptionKey)}`);
    console.log(`[submit-otr-invoice] Token auth enabled: ${isTokenAuthEnabled()}`);
    console.log(`[submit-otr-invoice] Payload:`, JSON.stringify(payload, null, 2));
    
    // Use token auth headers if enabled and token provided
    const headers = accessToken && isTokenAuthEnabled() 
      ? getOtrHeadersWithToken(subscriptionKey, accessToken)
      : getOtrHeaders(subscriptionKey);
    
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers,
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
      console.error(`[submit-otr-invoice] Full request details:`, JSON.stringify({
        url: requestUrl,
        method: 'POST',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'ocp-apim-subscription-key': maskSubscriptionKey(subscriptionKey),
        },
        payload,
        response: {
          status: response.status,
          body: data
        }
      }, null, 2));
      
      if (response.status === 401) {
        // Include actual OTR error message for better debugging
        const otrMessage = String(data?.message || data?.Message || data?.error || '');
        const errorMsg = otrMessage.includes('Not Authorized') 
          ? `OTR account not authorized: ${otrMessage}`
          : 'Invalid or missing subscription key';
        return { success: false, error: errorMsg, raw_response: data };
      }
      if (response.status === 400) {
        return { 
          success: false, 
          error: `Validation error: ${data.message || data.errors?.join(', ') || 'Invalid Request'}`,
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
      load_id: providedLoadId,
      invoice_id,
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
          error: 'OTR Solutions subscription key not configured (OTR_API_KEY)' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get company profile for ClientDOT
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

    // Determine load_id
    let load_id = providedLoadId;
    
    if (!load_id && invoice_id) {
      const { data: invoiceLoads, error: invoiceLoadsError } = await adminClient
        .from('invoice_loads')
        .select('load_id')
        .eq('invoice_id', invoice_id)
        .eq('tenant_id', tenant_id);
      
      if (invoiceLoadsError) {
        console.error('[submit-otr-invoice] Error looking up invoice loads:', invoiceLoadsError);
      }
      
      if (invoiceLoads && invoiceLoads.length > 0) {
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

    // Get BrokerMC from customer
    let brokerMc: number | null = null;
    let brokerName = load.broker_name || load.customer_name;

    if (load.customer_id) {
      const { data: customer } = await adminClient
        .from('customers')
        .select('mc_number, name')
        .eq('id', load.customer_id)
        .single();

      if (customer?.mc_number) {
        const cleanMc = customer.mc_number.replace(/^MC-?/i, '').replace(/\D/g, '').trim();
        brokerMc = parseInt(cleanMc, 10);
        brokerName = customer.name || brokerName;
      }
    }

    // Try load's broker_mc field if not found on customer
    if (!brokerMc && load.broker_mc) {
      const cleanMc = String(load.broker_mc).replace(/^MC-?/i, '').replace(/\D/g, '').trim();
      brokerMc = parseInt(cleanMc, 10);
    }

    if (!brokerMc || isNaN(brokerMc)) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Broker MC number required. Add MC number to customer record first.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate locations
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

    // Get invoice details if invoice_id provided
    let invoiceNumber: string | null = null;
    let invoiceAmount: number = Number(load.rate || 0);
    let invoiceDate: string = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

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

        const rawAmount: unknown = (invoice as any).total_amount;
        const parsedAmount = typeof rawAmount === 'number' ? rawAmount : parseFloat(String(rawAmount || '0'));
        if (!Number.isNaN(parsedAmount)) {
          invoiceAmount = parsedAmount;
        }

        // InvoiceDate: use YYYY-MM-DD format directly, do not localize
        const rawInvoiceDate: unknown = (invoice as any).invoice_date;
        if (rawInvoiceDate) {
          invoiceDate = String(rawInvoiceDate);
        }
      }
    }

    if (!invoiceNumber) {
      invoiceNumber = String(load.load_number || `INV-${Date.now()}`);
    }

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

    // Build OTR payload per specification
    const otrPayload: OtrPostInvoicePayload = {
      BrokerMC: brokerMc,
      ClientDOT: String(companyProfile.dot_number),
      FromCity: load.pickup_city.toUpperCase(),
      FromState: load.pickup_state.toUpperCase().slice(0, 2),
      ToCity: load.delivery_city.toUpperCase(),
      ToState: load.delivery_state.toUpperCase().slice(0, 2),
      PoNumber: poNumber,
      InvoiceNo: invoiceNumber,
      InvoiceDate: invoiceDate,
      InvoiceAmount: invoiceAmount,
    };

    if (load.weight) {
      otrPayload.Weight = load.weight;
    }
    if (load.miles) {
      otrPayload.Miles = load.miles;
    }

    console.log('[submit-otr-invoice] Final OTR payload:', JSON.stringify(otrPayload, null, 2));

    // Get access token if token auth is enabled
    let accessToken: string | undefined;
    
    if (isTokenAuthEnabled() && credentials.username && credentials.password) {
      console.log('[submit-otr-invoice] Token auth enabled, getting token...');
      const tokenResult = await getOtrToken(
        credentials.subscriptionKey,
        credentials.username,
        credentials.password
      );
      if (tokenResult.success) {
        accessToken = tokenResult.access_token;
      } else {
        console.warn('[submit-otr-invoice] Token auth failed, falling back to subscription-key-only:', tokenResult.error);
      }
    }

    // Submit to OTR (with or without token)
    const result = await submitInvoiceToOtr(otrPayload, credentials.subscriptionKey, accessToken);

    // Record submission attempt
    await adminClient
      .from('otr_invoice_submissions')
      .insert({
        tenant_id,
        invoice_id: invoice_id || null,
        load_id,
        broker_mc: brokerMc.toString(),
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
