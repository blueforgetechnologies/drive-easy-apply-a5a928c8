import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient as _createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, getServiceClient } from "../_shared/assertTenantAccess.ts";
import {
  OTR_API_BASE_URL,
  getOtrToken,
  getOtrCredentialsFromEnv,
} from "../_shared/otrClient.ts";

function encodeBase64(bytes: Uint8Array): string {
  // Avoid stack overflows on large files
  let binary = "";
  const chunkSize = 0x8000;
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
  }
  return btoa(binary);
}

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
        // Staging expects test flag; production can ignore it.
        'x-is-test': 'true'
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

    // Get invoice line items (loads) - use separate queries for reliability
    const { data: invoiceLoads, error: loadsError } = await adminClient
      .from('invoice_loads')
      .select('*')
      .eq('invoice_id', invoice_id);

    console.log('[submit-otr-invoice] Invoice loads query result:', invoiceLoads, loadsError);

    // Fetch load details separately for each invoice_load
    const loadsWithDetails: any[] = [];
    if (invoiceLoads && invoiceLoads.length > 0) {
      for (const il of invoiceLoads) {
        if (il.load_id) {
          const { data: loadData, error: loadError } = await adminClient
            .from('loads')
            .select('id, load_number, reference_number, pickup_date, delivery_date, pickup_city, pickup_state, delivery_city, delivery_state, rate')
            .eq('id', il.load_id)
            .single();

          if (loadError) {
            console.log('[submit-otr-invoice] Load fetch error:', il.load_id, loadError);
          }

          loadsWithDetails.push({
            ...il,
            load: loadData,
          });
        }
      }
    }
    console.log('[submit-otr-invoice] Loads with details:', loadsWithDetails);

    // Collect documents (rate confirmation / POD / BOL) for all loads
    const loadIds = loadsWithDetails.map((x: any) => x.load_id).filter(Boolean);
    let documents: OtrInvoicePayload["documents"] | undefined = undefined;

    if (loadIds.length > 0) {
      const { data: loadDocs, error: loadDocsError } = await adminClient
        .from('load_documents')
        .select('load_id, document_type, file_name, file_url')
        .in('load_id', loadIds);

      console.log('[submit-otr-invoice] Load documents query result:', loadDocs, loadDocsError);

      const docs = [] as NonNullable<OtrInvoicePayload["documents"]>;

      for (const d of loadDocs || []) {
        if (!d?.file_url) continue;

        const docType = String(d.document_type || 'other');
        const mappedType: 'rate_confirmation' | 'pod' | 'bol' | 'other' =
          docType === 'rate_confirmation'
            ? 'rate_confirmation'
            : docType === 'pod'
              ? 'pod'
              : docType === 'bill_of_lading' || docType === 'bol'
                ? 'bol'
                : 'other';

        // Download from storage and send as base64 (OTR often validates doc payloads)
        const { data: fileBlob, error: dlError } = await adminClient.storage
          .from('load-documents')
          .download(d.file_url);

        if (dlError || !fileBlob) {
          console.log('[submit-otr-invoice] Document download failed:', d.file_url, dlError);
          continue;
        }

        const bytes = new Uint8Array(await fileBlob.arrayBuffer());
        const fileBase64 = encodeBase64(bytes);

        docs.push({
          type: mappedType,
          fileName: d.file_name || `${mappedType}.pdf`,
          fileBase64,
        });
      }

      // If no explicit POD uploaded, fall back to using the newest BOL as POD as well.
      // (Many users upload a signed BOL as proof-of-delivery.)
      const hasPod = docs.some((d) => d.type === 'pod');
      const firstBol = docs.find((d) => d.type === 'bol');
      if (!hasPod && firstBol) {
        docs.push({ ...firstBol, type: 'pod' });
      }

      documents = docs.length > 0 ? docs : undefined;
    }

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

    // Broker/customer info
    let brokerMc = broker_mc;
    let brokerName = broker_name || invoice.customer_name;
    let brokerAddress: string | undefined;
    let brokerCity: string | undefined;
    let brokerState: string | undefined;
    let brokerZip: string | undefined;

    if (invoice.customer_id) {
      const { data: customer } = await adminClient
        .from('customers')
        .select('mc_number, name, address, city, state, zip')
        .eq('id', invoice.customer_id)
        .single();

      if (!brokerMc && customer?.mc_number) {
        brokerMc = customer.mc_number;
      }
      if (!brokerName && customer?.name) {
        brokerName = customer.name;
      }

      brokerAddress = customer?.address || undefined;
      brokerCity = customer?.city || undefined;
      brokerState = customer?.state || undefined;
      brokerZip = customer?.zip || undefined;
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
      brokerAddress,
      brokerCity,
      brokerState,
      brokerZip,
      carrierDot: companyProfile.dot_number,
      carrierMc: companyProfile.mc_number || undefined,
      carrierName: companyProfile.company_name,
      invoiceNumber: invoice.invoice_number,
      invoiceDate: invoice.invoice_date,
      invoiceAmount: invoice.total_amount,
      quickPay: quick_pay,
      loads: loadsWithDetails.map((il: any) => ({
        loadNumber: il.load?.load_number,
        referenceNumber: il.load?.reference_number,
        pickupDate: il.load?.pickup_date ? String(il.load.pickup_date).slice(0, 10) : undefined,
        deliveryDate: il.load?.delivery_date ? String(il.load.delivery_date).slice(0, 10) : undefined,
        pickupCity: il.load?.pickup_city,
        pickupState: il.load?.pickup_state,
        deliveryCity: il.load?.delivery_city,
        deliveryState: il.load?.delivery_state,
        rate: il.amount || il.load?.rate || 0
      })),
      documents,
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

    // Update invoice record with OTR submission status (success or failure)
    await adminClient
      .from('invoices')
      .update({
        otr_submitted_at: result.success ? new Date().toISOString() : null,
        otr_invoice_id: result.invoice_id || null,
        otr_status: result.success ? (result.status || 'submitted') : 'failed'
      })
      .eq('id', invoice_id);

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
