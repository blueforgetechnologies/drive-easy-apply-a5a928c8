import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, getServiceClient } from "../_shared/assertTenantAccess.ts";
import { 
  OTR_API_BASE_URL, 
  getOtrToken, 
  getOtrCredentialsFromEnv 
} from "../_shared/otrClient.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// OTR Invoice payload structure based on Carrier TMS API v2
interface OtrInvoicePayload {
  // Broker/Customer info
  brokerMc: string;
  brokerName: string;
  brokerAddress?: string;
  brokerCity?: string;
  brokerState?: string;
  brokerZip?: string;
  
  // Carrier info (your company)
  carrierDot: string;
  carrierMc?: string;
  carrierName: string;
  
  // Invoice details
  invoiceNumber: string;
  invoiceDate: string; // ISO date string
  invoiceAmount: number;
  
  // Load details
  loads: Array<{
    loadNumber?: string;
    referenceNumber?: string;
    pickupDate?: string;
    deliveryDate?: string;
    pickupCity?: string;
    pickupState?: string;
    deliveryCity?: string;
    deliveryState?: string;
    weight?: number;
    rate: number;
  }>;
  
  // Rate confirmation / POD documents (URLs or base64)
  documents?: Array<{
    type: 'rate_confirmation' | 'pod' | 'bol' | 'other';
    fileName: string;
    fileUrl?: string;
    fileBase64?: string;
  }>;
  
  // Optional fields
  notes?: string;
  quickPay?: boolean; // Request quick pay advance
}

interface OtrInvoiceResponse {
  success: boolean;
  invoiceId?: string;
  status?: string;
  message?: string;
  errors?: string[];
  [key: string]: unknown;
}

// Submit invoice to OTR Solutions
async function submitInvoiceToOtr(
  invoice: OtrInvoicePayload,
  subscriptionKey: string,
  accessToken: string
): Promise<{
  success: boolean;
  invoice_id?: string;
  status?: string;
  raw_response?: OtrInvoiceResponse;
  error?: string;
}> {
  try {
    console.log(`[submit-otr-invoice] Submitting invoice ${invoice.invoiceNumber} to OTR...`);
    
    const response = await fetch(`${OTR_API_BASE_URL}/invoices`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'ocp-apim-subscription-key': subscriptionKey,
        'Authorization': `Bearer ${accessToken}`,
        'x-is-test': 'false'
      },
      body: JSON.stringify(invoice)
    });

    console.log(`[submit-otr-invoice] OTR API response status: ${response.status}`);
    
    const responseText = await response.text();
    console.log(`[submit-otr-invoice] OTR API response body: ${responseText}`);

    let data: OtrInvoiceResponse;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { success: response.ok, message: responseText };
    }

    if (!response.ok) {
      console.error(`[submit-otr-invoice] OTR API error: ${response.status}`);
      
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: 'Invalid OTR credentials or access denied' };
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
      invoice_id: data.invoiceId,
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
      invoice_id, // Our internal invoice ID
      // Override fields if not pulling from invoice record
      broker_mc,
      broker_name,
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

    // Get invoice details
    const { data: invoice, error: invoiceError } = await adminClient
      .from('invoices')
      .select('*')
      .eq('id', invoice_id)
      .eq('tenant_id', tenant_id)
      .single();

    if (invoiceError || !invoice) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Invoice not found' 
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get invoice line items (loads)
    const { data: invoiceLoads } = await adminClient
      .from('invoice_loads')
      .select(`
        *,
        load:load_id (
          id,
          load_number,
          reference_number,
          pickup_date,
          delivery_date,
          pickup_location,
          delivery_location,
          pickup_city,
          pickup_state,
          delivery_city,
          delivery_state,
          weight,
          rate
        )
      `)
      .eq('invoice_id', invoice_id);

    // Get company profile for carrier info
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

    // Get broker MC from customer if not provided
    let brokerMc = broker_mc;
    let brokerName = broker_name || invoice.customer_name;

    if (!brokerMc && invoice.customer_id) {
      const { data: customer } = await adminClient
        .from('customers')
        .select('mc_number, name')
        .eq('id', invoice.customer_id)
        .single();
      
      if (customer?.mc_number) {
        brokerMc = customer.mc_number;
        brokerName = brokerName || customer.name;
      }
    }

    if (!brokerMc) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Broker MC number required. Add MC to customer record or provide broker_mc.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Clean MC number
    const cleanMc = brokerMc.replace(/^MC-?/i, '').trim();

    // Authenticate with OTR
    const tokenResult = await getOtrToken(
      credentials.subscriptionKey,
      credentials.username,
      credentials.password
    );

    if (!tokenResult.success || !tokenResult.access_token) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `OTR authentication failed: ${tokenResult.error}` 
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Build OTR invoice payload
    const otrPayload: OtrInvoicePayload = {
      brokerMc: cleanMc,
      brokerName: brokerName,
      carrierDot: companyProfile.dot_number,
      carrierMc: companyProfile.mc_number || undefined,
      carrierName: companyProfile.company_name,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      invoiceAmount: invoice.total_amount,
      quickPay: quick_pay,
      loads: (invoiceLoads || []).map((il: any) => ({
        loadNumber: il.load?.load_number,
        referenceNumber: il.load?.reference_number,
        pickupDate: il.load?.pickup_date,
        deliveryDate: il.load?.delivery_date,
        pickupCity: il.load?.pickup_city,
        pickupState: il.load?.pickup_state,
        deliveryCity: il.load?.delivery_city,
        deliveryState: il.load?.delivery_state,
        weight: il.load?.weight,
        rate: il.amount || il.load?.rate || 0
      })),
      notes: invoice.notes || undefined
    };

    console.log('[submit-otr-invoice] Payload:', JSON.stringify(otrPayload, null, 2));

    // Submit to OTR
    const result = await submitInvoiceToOtr(
      otrPayload,
      credentials.subscriptionKey,
      tokenResult.access_token
    );

    // Record submission attempt
    await adminClient
      .from('otr_invoice_submissions')
      .insert({
        tenant_id,
        invoice_id,
        broker_mc: cleanMc,
        broker_name: brokerName,
        invoice_number: invoice.invoice_number,
        invoice_amount: invoice.total_amount,
        otr_invoice_id: result.invoice_id,
        status: result.success ? (result.status || 'submitted') : 'failed',
        error_message: result.error,
        raw_request: otrPayload,
        raw_response: result.raw_response,
        submitted_by: accessCheck.user_id,
        quick_pay
      });

    // Update invoice record with OTR submission status
    if (result.success) {
      await adminClient
        .from('invoices')
        .update({
          otr_submitted_at: new Date().toISOString(),
          otr_invoice_id: result.invoice_id,
          otr_status: result.status || 'submitted'
        })
        .eq('id', invoice_id);
    }

    return new Response(
      JSON.stringify({
        success: result.success,
        invoice_id: result.invoice_id,
        status: result.status,
        error: result.error,
        message: result.success 
          ? `Invoice ${invoice.invoice_number} submitted to OTR successfully` 
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
