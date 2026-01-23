import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient as _createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, getServiceClient } from "../_shared/assertTenantAccess.ts";
import { 
  OTR_API_BASE_URL, 
  getOtrCredentialsFromEnv,
  maskSubscriptionKey,
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

// OTR file upload response
interface OtrFileUploadResult {
  success: boolean;
  document_type: string;
  file_name: string;
  invoice_doc_types: number;
  attempt_id: string;
  http_status?: number;
  response_body?: unknown;
  error?: string;
}

// Mime type inference from file extension
function inferMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  const mimeMap: Record<string, string> = {
    'pdf': 'application/pdf',
    'png': 'image/png',
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'txt': 'text/plain',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return mimeMap[ext] || 'application/octet-stream';
}

// OTR InvoiceDocTypes enum per API spec
const OTR_DOC_TYPES = {
  rate_confirmation: 1, // Rate Confirmation/Contract
  bill_of_lading: 2,    // Bill of Lading / Delivery Receipt
  pod: 2,               // POD is same as BOL
  invoice: 3,           // Invoice document
  other: 4,             // Other supporting documents
} as const;

// ============================================================================
// Timezone Helpers - US/Eastern with explicit Intl.DateTimeFormat
// ============================================================================

interface TimestampInfo {
  utc_time: string;
  eastern_time: string;
  eastern_hour: number;
}

function getTimestampInfo(): TimestampInfo {
  const now = new Date();
  const utc_time = now.toISOString();
  
  const easternFormatter = new Intl.DateTimeFormat("en-US", {
    timeZone: "America/New_York",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  
  const parts = easternFormatter.formatToParts(now);
  const getPart = (type: string) => parts.find(p => p.type === type)?.value || "";
  const eastern_time = `${getPart("year")}-${getPart("month")}-${getPart("day")}T${getPart("hour")}:${getPart("minute")}:${getPart("second")} America/New_York`;
  const eastern_hour = parseInt(getPart("hour"), 10);
  
  return { utc_time, eastern_time, eastern_hour };
}

// ============================================================================
// OTR Error Message Extraction - Priority: message > error > detail > raw
// ============================================================================

function extractOtrErrorMessage(data: unknown, rawText: string): string {
  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    // Priority order: message, Message, error, Error, detail, Detail
    if (typeof obj.message === 'string' && obj.message) return obj.message;
    if (typeof obj.Message === 'string' && obj.Message) return obj.Message;
    if (typeof obj.error === 'string' && obj.error) return obj.error;
    if (typeof obj.Error === 'string' && obj.Error) return obj.Error;
    if (typeof obj.detail === 'string' && obj.detail) return obj.detail;
    if (typeof obj.Detail === 'string' && obj.Detail) return obj.Detail;
    // Check for errors array
    if (Array.isArray(obj.errors) && obj.errors.length > 0) {
      return obj.errors.join(', ');
    }
  }
  return rawText || 'Unknown error';
}

// ============================================================================
// Submit invoice to OTR Solutions
// Endpoint: POST {BASE_URL}/invoices
// ============================================================================

async function submitInvoiceToOtr(
  payload: OtrPostInvoicePayload,
  subscriptionKey: string,
  accessToken: string  // REQUIRED - OTR confirmed bearer token is mandatory for invoice submission
): Promise<{
  success: boolean;
  invoice_id?: string;
  invoice_pkey?: number;
  status?: string;
  raw_response?: OtrInvoiceResponse;
  error?: string;
  attempt_id?: string;
}> {
  const attempt_id = crypto.randomUUID();
  const timestamps = getTimestampInfo();
  const requestUrl = `${OTR_API_BASE_URL}/invoices`;
  
  try {
    console.log('\n' + '='.repeat(70));
    console.log(`[OTR SUBMIT - ATTEMPT ${attempt_id}]`);
    console.log('='.repeat(70));
    console.log(`[TIMESTAMP] UTC: ${timestamps.utc_time}`);
    console.log(`[TIMESTAMP] Eastern: ${timestamps.eastern_time}`);
    console.log(`[REQUEST] URL: ${requestUrl}`);
    console.log(`[REQUEST] Subscription Key: ${maskSubscriptionKey(subscriptionKey)}`);
    console.log(`[REQUEST] Bearer Token: ***PROVIDED***`);
    console.log(`[REQUEST] Payload:`, JSON.stringify(payload, null, 2));
    
    // ALWAYS use bearer token for invoice submission (OTR requirement)
    const headers = getOtrHeadersWithToken(subscriptionKey, accessToken);
    
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload)
    });

    const responseText = await response.text();
    let data: OtrInvoiceResponse;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { success: response.ok, message: responseText };
    }
    
    console.log(`[RESPONSE] Status: ${response.status}`);
    console.log(`[RESPONSE] Body: ${responseText}`);

    if (!response.ok) {
      const otr_error_message = extractOtrErrorMessage(data, responseText);
      
      // Handle 409 Conflict: OTR returns invoicePkey even on conflict - treat as success if we got a pkey
      if (response.status === 409 && data.invoicePkey) {
        console.log(`[OTR 409 WITH PKEY] Invoice created despite conflict. invoicePkey: ${data.invoicePkey}, invoiceExists: ${data.invoiceExists}`);
        return {
          success: true,
          invoice_id: data.invoicePkey?.toString(),
          invoice_pkey: data.invoicePkey,
          status: data.invoiceExists ? 'existing' : 'created',
          raw_response: data,
          attempt_id
        };
      }
      
      // Structured error logging
      console.error('\n[OTR ERROR LOG]', JSON.stringify({
        attempt_id,
        request_url: requestUrl,
        status: response.status,
        otr_error_message,
        subscription_key_masked: maskSubscriptionKey(subscriptionKey),
        utc_time: timestamps.utc_time,
        eastern_time: timestamps.eastern_time,
        payload,
        raw_response: data,
      }, null, 2));
      console.log('='.repeat(70) + '\n');
      
      // 401 handling with specific messages
      if (response.status === 401) {
        let errorMsg: string;
        if (otr_error_message.includes('Not Authorized')) {
          errorMsg = `OTR: Not authorized to post invoices for this ClientDOT (staging enablement needed). Details: ${otr_error_message}`;
        } else {
          errorMsg = `OTR: Invalid or missing subscription key. Details: ${otr_error_message}`;
        }
        return { success: false, error: errorMsg, raw_response: data, attempt_id };
      }
      
      // 400 validation errors
      if (response.status === 400) {
        return { 
          success: false, 
          error: `OTR validation error: ${otr_error_message}`,
          raw_response: data,
          attempt_id
        };
      }
      
      // Other errors
      return { 
        success: false, 
        error: `OTR API error (${response.status}): ${otr_error_message}`,
        raw_response: data,
        attempt_id
      };
    }

    console.log(`[SUCCESS] Invoice submitted successfully`);
    console.log('='.repeat(70) + '\n');
    
    return {
      success: true,
      invoice_id: data.invoicePkey?.toString() || data.invoiceId,
      invoice_pkey: data.invoicePkey,
      status: data.status || 'submitted',
      raw_response: data,
      attempt_id
    };
  } catch (error) {
    console.error('\n[OTR EXCEPTION]', JSON.stringify({
      attempt_id,
      request_url: requestUrl,
      error: error instanceof Error ? error.message : String(error),
      utc_time: timestamps.utc_time,
      eastern_time: timestamps.eastern_time,
    }, null, 2));
    
    return { 
      success: false, 
      error: `OTR request failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      attempt_id
    };
  }
}

// ============================================================================
// Upload document to OTR Solutions
// Endpoint: POST {BASE_URL}/file-upload (multipart/form-data)
// ============================================================================

async function uploadDocumentToOtr(
  fileBuffer: Uint8Array,
  fileName: string,
  documentType: string,
  invoicePkey: number,
  subscriptionKey: string,
  accessToken: string,
  sendEmail: boolean = false,
  mimeType?: string
): Promise<OtrFileUploadResult> {
  const attempt_id = crypto.randomUUID();
  const timestamps = getTimestampInfo();
  const requestUrl = `${OTR_API_BASE_URL}/file-upload`;
  
  // Map document type to OTR InvoiceDocTypes
  const invoiceDocType = OTR_DOC_TYPES[documentType as keyof typeof OTR_DOC_TYPES] || OTR_DOC_TYPES.other;
  
  // Determine mime type: use provided, or infer from filename
  const resolvedMimeType = mimeType || inferMimeType(fileName);
  
  try {
    console.log('\n' + '='.repeat(70));
    console.log(`[OTR DOCUMENT UPLOAD - ATTEMPT ${attempt_id}]`);
    console.log('='.repeat(70));
    console.log(`[TIMESTAMP] UTC: ${timestamps.utc_time}`);
    console.log(`[TIMESTAMP] Eastern: ${timestamps.eastern_time}`);
    console.log(`[REQUEST] URL: ${requestUrl}`);
    console.log(`[REQUEST] File: ${fileName} (${fileBuffer.length} bytes)`);
    console.log(`[REQUEST] MimeType: ${resolvedMimeType}`);
    console.log(`[REQUEST] DocumentType (form): invoice-file-upload`);
    console.log(`[REQUEST] InvoiceDocTypes: ${invoiceDocType} (from: ${documentType})`);
    console.log(`[REQUEST] ItemPkey: ${invoicePkey}`);
    console.log(`[REQUEST] SendEmail: ${sendEmail}`);
    console.log(`[REQUEST] Subscription Key: ${maskSubscriptionKey(subscriptionKey)}`);
    console.log(`[REQUEST] Bearer Token: ***PROVIDED***`);
    
    // Build multipart form data
    const formData = new FormData();
    // Slice the Uint8Array to get a proper ArrayBuffer copy (avoids offset issues)
    const arrayBufferCopy = fileBuffer.slice().buffer;
    const blob = new Blob([arrayBufferCopy], { type: resolvedMimeType });
    formData.append('file', blob, fileName);
    // DocumentType must be constant 'invoice-file-upload' per OTR Swagger
    formData.append('DocumentType', 'invoice-file-upload');
    formData.append('ItemPkey', invoicePkey.toString());
    formData.append('SendEmail', sendEmail.toString());
    formData.append('InvoiceDocTypes', invoiceDocType.toString());
    
    // CRITICAL: Both subscription key AND bearer token required for file-upload
    // Do NOT set Content-Type manually - FormData handles boundary automatically
    const response = await fetch(requestUrl, {
      method: 'POST',
      headers: {
        'ocp-apim-subscription-key': subscriptionKey,
        'Authorization': `Bearer ${accessToken}`,
        'Accept': 'application/json',
      },
      body: formData
    });

    const responseText = await response.text();
    let responseBody: unknown;
    try {
      responseBody = responseText ? JSON.parse(responseText) : {};
    } catch {
      responseBody = responseText || {};
    }
    
    console.log(`[RESPONSE] Status: ${response.status}`);
    console.log(`[RESPONSE] Body: ${responseText}`);
    console.log(`[RESPONSE] Attempt ID: ${attempt_id}`);

    if (!response.ok) {
      console.error('\n[OTR UPLOAD ERROR]', JSON.stringify({
        attempt_id,
        request_url: requestUrl,
        http_status: response.status,
        file_name: fileName,
        document_type: documentType,
        invoice_doc_types: invoiceDocType,
        item_pkey: invoicePkey,
        mime_type: resolvedMimeType,
        utc_time: timestamps.utc_time,
        eastern_time: timestamps.eastern_time,
        response_body: responseBody,
      }, null, 2));
      console.log('='.repeat(70) + '\n');
      
      return {
        success: false,
        document_type: documentType,
        file_name: fileName,
        invoice_doc_types: invoiceDocType,
        attempt_id,
        http_status: response.status,
        response_body: responseBody,
        error: `Upload failed (${response.status}): ${responseText}`
      };
    }

    console.log(`[SUCCESS] Document ${fileName} uploaded successfully`);
    console.log('='.repeat(70) + '\n');
    
    return {
      success: true,
      document_type: documentType,
      file_name: fileName,
      invoice_doc_types: invoiceDocType,
      attempt_id,
      http_status: response.status,
      response_body: responseBody
    };
  } catch (error) {
    console.error(`[OTR UPLOAD EXCEPTION - ${attempt_id}] ${fileName}:`, error);
    return {
      success: false,
      document_type: documentType || 'unknown',
      file_name: fileName,
      invoice_doc_types: invoiceDocType,
      attempt_id,
      error: error instanceof Error ? error.message : 'Unknown error'
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

    // Get access token - REQUIRED for invoice submission (per OTR support confirmation)
    if (!credentials.username || !credentials.password) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'OTR username and password required for invoice submission. Configure OTR_USERNAME and OTR_PASSWORD secrets.' 
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log('[submit-otr-invoice] Getting OAuth bearer token (REQUIRED for invoice submission)...');
    const tokenResult = await getOtrToken(
      credentials.subscriptionKey,
      credentials.username,
      credentials.password
    );
    
    if (!tokenResult.success || !tokenResult.access_token) {
      console.error('[submit-otr-invoice] Token auth FAILED:', tokenResult.error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: `OTR authentication failed: ${tokenResult.error}`,
          token_attempt_id: tokenResult.attempt_id,
          utc_time: tokenResult.utc_time,
          eastern_time: tokenResult.eastern_time,
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    console.log(`[submit-otr-invoice] Token obtained successfully (attempt: ${tokenResult.attempt_id})`);
    
    // Submit to OTR with required bearer token
    const result = await submitInvoiceToOtr(otrPayload, credentials.subscriptionKey, tokenResult.access_token);

    // Track document upload results
    const documentUploadResults: OtrFileUploadResult[] = [];
    
    // If invoice submission succeeded and we have an invoicePkey, upload documents
    if (result.success && result.invoice_pkey) {
      console.log(`[submit-otr-invoice] Invoice submitted successfully. Uploading documents to OTR (ItemPkey: ${result.invoice_pkey})...`);
      
      // Fetch load documents (BOL and Rate Confirmation)
      const { data: loadDocuments, error: docsError } = await adminClient
        .from('load_documents')
        .select('id, document_type, file_name, file_url')
        .eq('load_id', load_id)
        .eq('tenant_id', tenant_id)
        .in('document_type', ['rate_confirmation', 'bill_of_lading', 'pod']);
      
      if (docsError) {
        console.warn('[submit-otr-invoice] Failed to fetch load documents:', docsError);
      } else if (loadDocuments && loadDocuments.length > 0) {
        console.log(`[submit-otr-invoice] Found ${loadDocuments.length} documents to upload`);
        
        for (const doc of loadDocuments) {
          if (!doc.file_url) {
            console.warn(`[submit-otr-invoice] Skipping document ${doc.id}: no file_url`);
            continue;
          }
          
          try {
            // Download file from Supabase Storage
            const { data: fileData, error: downloadError } = await adminClient.storage
              .from('load-documents')
              .download(doc.file_url);
            
            if (downloadError || !fileData) {
              const errorAttemptId = crypto.randomUUID();
              console.error(`[submit-otr-invoice] Failed to download ${doc.file_url}:`, downloadError);
              documentUploadResults.push({
                success: false,
                document_type: doc.document_type || 'unknown',
                file_name: doc.file_name || doc.file_url,
                invoice_doc_types: OTR_DOC_TYPES[doc.document_type as keyof typeof OTR_DOC_TYPES] || OTR_DOC_TYPES.other,
                attempt_id: errorAttemptId,
                error: `Download failed: ${downloadError?.message || 'No data'}`
              });
              continue;
            }
            
            // Convert blob to Uint8Array
            const arrayBuffer = await fileData.arrayBuffer();
            const fileBuffer = new Uint8Array(arrayBuffer);
            
            // Infer mime type from filename
            const fileName = doc.file_name || doc.file_url.split('/').pop() || 'document.pdf';
            const mimeType = fileData.type || inferMimeType(fileName);
            
            // Upload to OTR with access token
            const uploadResult = await uploadDocumentToOtr(
              fileBuffer,
              fileName,
              doc.document_type || 'other',
              result.invoice_pkey,
              credentials.subscriptionKey,
              tokenResult.access_token,  // Pass bearer token
              false,                      // Don't send email
              mimeType                    // Pass mime type
            );
            
            documentUploadResults.push(uploadResult);
            
          } catch (uploadError) {
            const errorAttemptId = crypto.randomUUID();
            console.error(`[submit-otr-invoice] Exception uploading ${doc.file_url}:`, uploadError);
            documentUploadResults.push({
              success: false,
              document_type: doc.document_type || 'unknown',
              file_name: doc.file_name || doc.file_url,
              invoice_doc_types: OTR_DOC_TYPES[(doc.document_type as keyof typeof OTR_DOC_TYPES)] || OTR_DOC_TYPES.other,
              attempt_id: errorAttemptId,
              error: uploadError instanceof Error ? uploadError.message : 'Unknown upload error'
            });
          }
        }
        
        // Log document upload summary
        const successCount = documentUploadResults.filter(r => r.success).length;
        console.log(`[submit-otr-invoice] Document uploads complete: ${successCount}/${documentUploadResults.length} successful`);
      } else {
        console.log('[submit-otr-invoice] No documents found for this load');
      }
    }

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

    // Update invoice with OTR submission status
    if (invoice_id) {
      await adminClient
        .from('invoices')
        .update({
          otr_submitted_at: result.success ? new Date().toISOString() : null,
        })
        .eq('id', invoice_id);
    }

    // Build response in requested format
    const successfulUploads = documentUploadResults.filter(r => r.success);
    const failedUploads = documentUploadResults.filter(r => !r.success);
    
    let message = result.success 
      ? `Invoice ${invoiceNumber} submitted to OTR successfully`
      : `Failed to submit invoice: ${result.error}`;
    
    if (result.success && documentUploadResults.length > 0) {
      message += `. Documents: ${successfulUploads.length}/${documentUploadResults.length} uploaded`;
    }

    // Format uploads for response per test requirements
    const uploadsFormatted = documentUploadResults.map(r => ({
      fileName: r.file_name,
      docType: r.document_type,
      invoiceDocTypes: r.invoice_doc_types,
      status: r.http_status,
      success: r.success,
      attempt_id: r.attempt_id,
      responseBody: r.response_body,
      error: r.error
    }));

    return new Response(
      JSON.stringify({
        success: result.success,
        message,
        // Invoice details in structured format
        invoice: {
          invoiceNo: invoiceNumber,
          invoicePkey: result.invoice_pkey,
          status: result.status,
          attempt_id: result.attempt_id,
          error: result.error
        },
        // Uploads array per test requirements
        uploads: uploadsFormatted,
        // Legacy fields for backward compatibility
        invoice_id: result.invoice_id,
        invoice_pkey: result.invoice_pkey,
        status: result.status,
        error: result.error,
        documents: {
          total: documentUploadResults.length,
          successful: successfulUploads.length,
          failed: failedUploads.length,
          results: documentUploadResults
        }
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
