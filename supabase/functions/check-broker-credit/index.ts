import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, getServiceClient } from "../_shared/assertTenantAccess.ts";
import { 
  OTR_API_BASE_URL, 
  decrypt, 
  maskSubscriptionKey,
  getOtrHeaders,
} from "../_shared/otrClient.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface OtrBrokerCheckResponse {
  id?: string;
  Name?: string;
  McNumber?: string;
  BrokerTestResult?: string;
  NoBuy?: boolean;
  ResponseStatus?: number;
  brokerMc?: string;
  brokerName?: string;
  status?: string;
  creditLimit?: number;
  approvalStatus?: string;
  message?: string;
  [key: string]: unknown;
}

// Check broker credit using OTR Solutions API
// Endpoint: GET {BASE_URL}/broker-check/{brokerMc}
// NOTE: Broker check does NOT require bearer token, only subscription key
// Response format: {"id":"6678","Name":"...", "McNumber":"864049", "BrokerTestResult":"Call Credit", "NoBuy":false, "ResponseStatus":200}
async function checkWithOtr(
  mcNumber: string, 
  subscriptionKey: string
): Promise<{
  success: boolean;
  approval_status?: string;
  credit_limit?: number;
  broker_name?: string;
  raw_response?: OtrBrokerCheckResponse;
  error?: string;
}> {
  try {
    // Clean MC: remove "MC-" prefix and strip leading zeros
    const cleanMc = mcNumber.replace(/^MC-?/i, '').trim().replace(/^0+/, '') || '0';
    const requestUrl = `${OTR_API_BASE_URL}/broker-check/${cleanMc}`;
    
    console.log(`[check-broker-credit] GET ${requestUrl}`);
    console.log(`[check-broker-credit] Subscription key: ${maskSubscriptionKey(subscriptionKey)}`);
    
    // Broker check uses subscription key only (no bearer token required)
    const headers = getOtrHeaders(subscriptionKey);
    
    const response = await fetch(requestUrl, { 
      method: 'GET',
      headers,
    });

    console.log(`[check-broker-credit] Response status: ${response.status}`);
    const responseText = await response.text();
    console.log(`[check-broker-credit] Response body: ${responseText}`);

    let data: OtrBrokerCheckResponse;
    try {
      data = JSON.parse(responseText);
    } catch {
      data = { message: responseText };
    }

    if (!response.ok) {
      console.error(`[check-broker-credit] OTR API error: ${response.status}`);
      
      if (response.status === 401) {
        return { success: false, error: 'Invalid or missing subscription key', raw_response: data };
      }
      if (response.status === 404) {
        return { 
          success: true, 
          approval_status: 'not_found',
          error: 'Broker not found in OTR system',
          raw_response: data
        };
      }
      return { success: false, error: `OTR API error: ${response.status} - ${data.message || responseText}`, raw_response: data };
    }
    
    // Map OTR response to our status format
    // OTR returns: NoBuy (boolean) and BrokerTestResult (string like "Call Credit", "Approved", etc.)
    let approvalStatus = 'unchecked';
    
    // First check NoBuy flag - this is the primary indicator
    if (typeof data.NoBuy === 'boolean') {
      if (data.NoBuy === false) {
        // NoBuy=false means broker IS approved for factoring
        approvalStatus = 'approved';
      } else {
        // NoBuy=true means broker is NOT approved
        approvalStatus = 'not_approved';
      }
    }
    
    // Refine based on BrokerTestResult if available
    if (data.BrokerTestResult) {
      const testResult = data.BrokerTestResult.toLowerCase();
      if (testResult.includes('call') || testResult.includes('credit')) {
        // "Call Credit" means they need to call OTR for more info, but NoBuy=false means still approved
        if (data.NoBuy === false) {
          approvalStatus = 'approved'; // Still approved, just may need to call for credit limit
        } else {
          approvalStatus = 'call_otr';
        }
      } else if (testResult.includes('approved') || testResult.includes('yes')) {
        approvalStatus = 'approved';
      } else if (testResult.includes('declined') || testResult.includes('denied') || testResult.includes('no')) {
        approvalStatus = 'not_approved';
      }
    }
    
    // Legacy field support
    if (approvalStatus === 'unchecked') {
      if (data.approvalStatus) {
        const otrStatus = data.approvalStatus.toLowerCase();
        if (otrStatus === 'approved' || otrStatus === 'active' || otrStatus === 'yes') {
          approvalStatus = 'approved';
        } else if (otrStatus === 'declined' || otrStatus === 'denied' || otrStatus === 'no') {
          approvalStatus = 'not_approved';
        } else if (otrStatus === 'call' || otrStatus === 'pending' || otrStatus === 'review') {
          approvalStatus = 'call_otr';
        }
      } else if (data.status) {
        const otrStatus = data.status.toLowerCase();
        if (otrStatus === 'approved' || otrStatus === 'active') {
          approvalStatus = 'approved';
        } else if (otrStatus === 'declined' || otrStatus === 'denied') {
          approvalStatus = 'not_approved';
        }
      }
    }

    console.log(`[check-broker-credit] Mapped status: NoBuy=${data.NoBuy}, BrokerTestResult=${data.BrokerTestResult} -> ${approvalStatus}`);

    return {
      success: true,
      approval_status: approvalStatus,
      credit_limit: data.creditLimit,
      broker_name: data.Name || data.brokerName,
      raw_response: data
    };
  } catch (error) {
    console.error('[check-broker-credit] OTR API error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Failed to connect to OTR API'
    };
  }
}

// Check broker info using FMCSA API (free, public) - full data including address
async function checkWithFmcsa(mcNumber: string): Promise<{
  found: boolean;
  legal_name?: string;
  dba_name?: string;
  phone?: string;
  dot_number?: string;
  status?: string;
  physical_address?: string;
  safer_status?: string;
  safety_rating?: string;
  mc_number?: string;
}> {
  try {
    // Clean MC: remove "MC-" prefix and strip leading zeros for FMCSA
    const cleanMc = mcNumber.replace(/^MC-?/i, '').trim().replace(/^0+/, '') || '0';
    console.log(`[check-broker-credit] Checking FMCSA (SAFER) for MC: ${cleanMc}`);
    
    // Use SAFER website for full data including address
    const fmcsaUrl = `https://safer.fmcsa.dot.gov/query.asp?searchtype=ANY&query_type=queryCarrierSnapshot&query_param=MC_MX&query_string=${cleanMc}`;
    const response = await fetch(fmcsaUrl);
    const html = await response.text();

    console.log(`[check-broker-credit] FMCSA response length: ${html.length}`);

    // Parse HTML for carrier data
    const result: {
      found: boolean;
      legal_name?: string;
      dba_name?: string;
      phone?: string;
      dot_number?: string;
      status?: string;
      physical_address?: string;
      safer_status?: string;
      safety_rating?: string;
      mc_number?: string;
    } = { found: false };

    // Extract USDOT Number
    const usdotMatch = html.match(/USDOT Number:<\/a><\/th>\s*<td[^>]*>(.*?)<\/td>/is);
    if (usdotMatch) {
      result.dot_number = usdotMatch[1].trim().replace(/&nbsp;/g, '').replace(/<[^>]*>/g, '').trim();
    }

    // Extract Legal Name
    const legalNameMatch = html.match(/Legal Name:<\/a><\/th>\s*<td[^>]*>(.*?)<\/td>/is);
    if (legalNameMatch) {
      result.legal_name = legalNameMatch[1].trim().replace(/&nbsp;/g, '').replace(/<[^>]*>/g, '').trim();
    }

    // Extract DBA Name
    const dbaNameMatch = html.match(/DBA Name:<\/a><\/th>\s*<td[^>]*>(.*?)<\/td>/is);
    if (dbaNameMatch) {
      const dbaText = dbaNameMatch[1].trim().replace(/&nbsp;/g, '').replace(/<[^>]*>/g, '').trim();
      if (dbaText) result.dba_name = dbaText;
    }

    // Extract Physical Address
    const physicalAddressMatch = html.match(/Physical Address:<\/a><\/th>\s*<td[^>]*id="physicaladdressvalue"[^>]*>(.*?)<\/td>/is);
    if (physicalAddressMatch) {
      result.physical_address = physicalAddressMatch[1]
        .replace(/<br>/gi, ', ')
        .replace(/&nbsp;/g, '')
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
    }

    // Extract Phone
    const phoneMatch = html.match(/Phone:<\/a><\/th>\s*<td[^>]*>(.*?)<\/td>/is);
    if (phoneMatch) {
      result.phone = phoneMatch[1].trim().replace(/&nbsp;/g, '').replace(/<[^>]*>/g, '').trim();
    }

    // Extract MC Number
    const mcNumberMatch = html.match(/MC-(\d+)/i);
    if (mcNumberMatch) {
      result.mc_number = mcNumberMatch[1];
    }

    // Extract Operating Authority Status
    const operatingStatusMatch = html.match(/Operating\s+Authority\s+Status:<\/a><\/th>[\s\S]{0,300}?<b>(.*?)<\/b>/i);
    if (operatingStatusMatch) {
      result.safer_status = operatingStatusMatch[1].trim().replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ');
      result.status = result.safer_status?.toLowerCase().includes('authorized') ? 'authorized' : 'not_authorized';
    }

    // Extract Safety Rating
    const safetyRatingMatch = html.match(/Rating:<\/[^>]+>[\s\S]{0,200}?<td[^>]*>[\s\S]{0,100}?([^<\n]+)/i);
    if (safetyRatingMatch) {
      const rating = safetyRatingMatch[1].trim().replace(/&nbsp;/g, ' ').replace(/\|/g, '').replace(/\s+/g, ' ').trim();
      if (rating && rating.length > 0) result.safety_rating = rating;
    }

    // Check if carrier was found
    result.found = !!(result.legal_name || result.dba_name || result.physical_address);
    
    console.log(`[check-broker-credit] FMCSA result: found=${result.found}, name=${result.legal_name}`);
    return result;
  } catch (error) {
    console.error('[check-broker-credit] FMCSA lookup error:', error);
    return { found: false };
  }
}

// Get OTR subscription key from secrets or tenant integrations
async function getOtrSubscriptionKey(adminClient: ReturnType<typeof getServiceClient>, tenantId: string): Promise<{
  subscriptionKey: string;
  username?: string;
  password?: string;
} | null> {
  const masterKey = Deno.env.get('INTEGRATIONS_MASTER_KEY');
  
  try {
    // 1. First try tenant_factoring_config (new per-tenant factoring settings)
    const { data: factoringConfig } = await adminClient
      .from('tenant_factoring_config')
      .select('credentials_encrypted, is_enabled')
      .eq('tenant_id', tenantId)
      .eq('provider', 'otr_solutions')
      .eq('is_enabled', true)
      .maybeSingle();

    if (factoringConfig?.credentials_encrypted && masterKey) {
      try {
        const decrypted = await decrypt(factoringConfig.credentials_encrypted, masterKey);
        const creds = JSON.parse(decrypted);
        if (creds.api_key) {
          console.log(`[check-broker-credit] Using tenant factoring config key: ${maskSubscriptionKey(creds.api_key)}`);
          return { 
            subscriptionKey: creds.api_key,
            username: creds.username,
            password: creds.password,
          };
        }
      } catch (e) {
        console.error('[check-broker-credit] Failed to decrypt factoring config:', e);
      }
    }

    // 2. Then try tenant_integrations (legacy location)
    const { data: integration } = await adminClient
      .from('tenant_integrations')
      .select('encrypted_credentials')
      .eq('tenant_id', tenantId)
      .eq('provider', 'otr_solutions')
      .eq('is_active', true)
      .maybeSingle();

    const integrationData = integration as { encrypted_credentials?: string } | null;
    if (integrationData?.encrypted_credentials && masterKey) {
      try {
        const decrypted = await decrypt(integrationData.encrypted_credentials, masterKey);
        const creds = JSON.parse(decrypted);
        if (creds.api_key) {
          console.log(`[check-broker-credit] Using tenant integration key: ${maskSubscriptionKey(creds.api_key)}`);
          return { 
            subscriptionKey: creds.api_key,
            username: creds.username,
            password: creds.password,
          };
        }
      } catch (e) {
        console.error('[check-broker-credit] Failed to decrypt integration:', e);
      }
    }

    // 3. Finally fall back to global secrets (staging/dev only)
    const subscriptionKey = Deno.env.get('OTR_API_KEY');
    if (subscriptionKey) {
      console.log(`[check-broker-credit] Using global OTR key (fallback): ${maskSubscriptionKey(subscriptionKey)}`);
      return { 
        subscriptionKey,
        username: Deno.env.get('OTR_USERNAME'),
        password: Deno.env.get('OTR_PASSWORD'),
      };
    }

    return null;
  } catch (error) {
    console.error('[check-broker-credit] Error getting OTR subscription key:', error);
    return null;
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
      mc_number, 
      broker_name, 
      customer_id, 
      load_email_id, 
      match_id,
      manual_status,
      notes,
      force_check
    } = body;

    // Check tenant access - allow service role for automated VPS calls
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
    const token = authHeader?.replace('Bearer ', '');
    
    // Check if this is a service-role call (from VPS worker)
    const isServiceRoleCall = token && serviceRoleKey && token === serviceRoleKey;
    
    let accessCheck: { allowed: boolean; user_id?: string; response?: Response };
    
    if (isServiceRoleCall) {
      // VPS worker using service role - validate tenant_id exists
      if (!tenant_id) {
        return new Response(
          JSON.stringify({ error: 'tenant_id required for service role calls' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.log(`[check-broker-credit] Service role call for tenant ${tenant_id}`);
      accessCheck = { allowed: true, user_id: 'service_role' };
    } else {
      // User call - validate JWT and tenant membership
      accessCheck = await assertTenantAccess(authHeader, tenant_id);
      if (!accessCheck.allowed) {
        return accessCheck.response!;
      }
    }

    const adminClient = getServiceClient();

    // If manual_status provided, this is a manual update
    if (manual_status) {
      const validStatuses = ['approved', 'not_approved', 'call_otr', 'not_found', 'unchecked'];
      if (!validStatuses.includes(manual_status)) {
        return new Response(
          JSON.stringify({ error: 'Invalid status' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      let resolvedCustomerId = customer_id;
      let resolvedMcNumber = mc_number;

      if (!customer_id && broker_name) {
        const { data: customers } = await adminClient
          .from('customers')
          .select('id, mc_number')
          .eq('tenant_id', tenant_id)
          .ilike('name', `%${broker_name}%`)
          .limit(1);
        
        if (customers && customers.length > 0) {
          resolvedCustomerId = customers[0].id;
          resolvedMcNumber = resolvedMcNumber || customers[0].mc_number;
        }
      }

      const { error: historyError } = await adminClient
        .from('broker_credit_checks')
        .insert({
          tenant_id,
          customer_id: resolvedCustomerId,
          broker_name: broker_name || 'Unknown',
          mc_number: resolvedMcNumber,
          approval_status: manual_status,
          checked_by: accessCheck.user_id,
          load_email_id,
          match_id,
          raw_response: { manual: true, notes }
        });

      if (historyError) {
        console.error('[check-broker-credit] Failed to record history:', historyError);
      }

      if (resolvedCustomerId) {
        const { error: updateError } = await adminClient
          .from('customers')
          .update({
            otr_approval_status: manual_status,
            otr_last_checked_at: new Date().toISOString(),
            otr_check_error: null,
            factoring_approval: manual_status === 'approved' ? 'approved' : 
                               manual_status === 'not_approved' ? 'declined' : 'pending'
          })
          .eq('id', resolvedCustomerId);

        if (updateError) {
          console.error('[check-broker-credit] Failed to update customer:', updateError);
        }
      }

      return new Response(
        JSON.stringify({
          success: true,
          approval_status: manual_status,
          broker_name: broker_name,
          customer_id: resolvedCustomerId,
          message: 'Status updated manually'
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Automated check - need MC number
    if (!mc_number && !customer_id) {
      return new Response(
        JSON.stringify({ error: 'MC number or customer_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get MC from customer if needed
    let mcToCheck = mc_number;
    let resolvedBrokerName = broker_name;
    let resolvedCustomerId = customer_id;
    
    if (customer_id && !mc_number) {
      const { data: customer, error: customerError } = await adminClient
        .from('customers')
        .select('mc_number, name')
        .eq('id', customer_id)
        .single();
      
      if (customerError || !customer?.mc_number) {
        return new Response(
          JSON.stringify({ 
            error: 'Customer MC number not found',
            details: 'Please add MC number to the customer record first'
          }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      mcToCheck = customer.mc_number;
      resolvedBrokerName = resolvedBrokerName || customer.name;
    }

    // Check for existing customer by MC number OR name
    let existingCustomer: {
      id: string;
      name: string;
      mc_number?: string;
      address?: string;
      city?: string;
      state?: string;
      zip?: string;
      phone?: string;
      otr_approval_status?: string;
      otr_credit_limit?: number;
    } | null = null;

    // Find similar customers for merge detection
    let similarCustomers: Array<{ id: string; name: string; mc_number?: string }> = [];

    if (mcToCheck || broker_name) {
      // Look for exact MC match first
      if (mcToCheck) {
        const cleanMc = mcToCheck.replace(/^MC-?/i, '').trim();
        const { data: mcMatch } = await adminClient
          .from('customers')
          .select('id, name, mc_number, address, city, state, zip, phone, otr_approval_status, otr_credit_limit')
          .eq('tenant_id', tenant_id)
          .eq('mc_number', cleanMc)
          .maybeSingle();
        
        if (mcMatch) {
          existingCustomer = mcMatch;
          resolvedCustomerId = mcMatch.id;
        }
      }

      // Find similar customers by name (fuzzy match for merge suggestions)
      if (broker_name && !existingCustomer) {
        const { data: nameMatches } = await adminClient
          .from('customers')
          .select('id, name, mc_number')
          .eq('tenant_id', tenant_id)
          .ilike('name', `%${broker_name.split(' ')[0]}%`)
          .limit(5);
        
        if (nameMatches && nameMatches.length > 0) {
          similarCustomers = nameMatches;
          // If there's an exact name match, use it
          const exactMatch = nameMatches.find(c => 
            c.name.toLowerCase() === broker_name.toLowerCase()
          );
          if (exactMatch) {
            existingCustomer = {
              id: exactMatch.id,
              name: exactMatch.name,
              mc_number: exactMatch.mc_number || undefined,
            };
            resolvedCustomerId = exactMatch.id;
          }
        }
      }
    }

    if (!mcToCheck) {
      return new Response(
        JSON.stringify({ 
          error: 'No MC number available',
          details: 'Please provide an MC number or add it to the customer record'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get OTR credentials
    const credentials = await getOtrSubscriptionKey(adminClient, tenant_id);
    let otrResult: { 
      success: boolean; 
      approval_status?: string; 
      credit_limit?: number;
      broker_name?: string;
      raw_response?: OtrBrokerCheckResponse;
      error?: string;
    } | null = null;
    
    if (credentials) {
      console.log('[check-broker-credit] OTR credentials found, checking broker...');
      
      // Broker check does NOT require bearer token - only subscription key
      otrResult = await checkWithOtr(mcToCheck, credentials.subscriptionKey);
    } else {
      console.log('[check-broker-credit] No OTR subscription key configured');
    }

    // Also get FMCSA data for additional broker info
    const fmcsaResult = await checkWithFmcsa(mcToCheck);
    
    // Determine final status
    let finalStatus = 'unchecked';
    let creditLimit: number | null = null;
    let finalBrokerName = resolvedBrokerName;
    let dotNumber: string | null = null;
    let checkError: string | null = null;

    if (otrResult?.success) {
      finalStatus = otrResult.approval_status || 'unchecked';
      creditLimit = otrResult.credit_limit || null;
      finalBrokerName = otrResult.broker_name || finalBrokerName;
    } else if (otrResult?.error) {
      checkError = otrResult.error;
    }

    // Use FMCSA data to supplement
    if (fmcsaResult.found) {
      finalBrokerName = finalBrokerName || fmcsaResult.legal_name || fmcsaResult.dba_name;
      dotNumber = fmcsaResult.dot_number || null;
    }

    // Record the check in history
    const { error: historyError } = await adminClient
      .from('broker_credit_checks')
      .insert({
        tenant_id,
        customer_id: resolvedCustomerId,
        broker_name: finalBrokerName || 'Unknown',
        mc_number: mcToCheck,
        approval_status: finalStatus,
        credit_limit: creditLimit,
        checked_by: accessCheck.user_id,
        load_email_id,
        match_id,
        raw_response: {
          otr: otrResult?.raw_response || null,
          fmcsa: fmcsaResult.found ? fmcsaResult : null
        }
      });

    if (historyError) {
      console.error('[check-broker-credit] Failed to record history:', historyError);
    }

    // Update customer record if we have one
    if (resolvedCustomerId) {
      const updateData: Record<string, unknown> = {
        otr_approval_status: finalStatus,
        otr_last_checked_at: new Date().toISOString(),
        otr_check_error: checkError,
      };
      
      if (creditLimit !== null) {
        updateData.otr_credit_limit = creditLimit;
      }
      if (dotNumber) {
        updateData.dot_number = dotNumber;
      }

      const { error: updateError } = await adminClient
        .from('customers')
        .update(updateData)
        .eq('id', resolvedCustomerId);

      if (updateError) {
        console.error('[check-broker-credit] Failed to update customer:', updateError);
      }
    }

    // Build comprehensive response with all sources
    return new Response(
      JSON.stringify({
        success: otrResult?.success ?? false,
        approval_status: finalStatus,
        credit_limit: creditLimit,
        broker_name: finalBrokerName,
        dot_number: dotNumber,
        customer_id: resolvedCustomerId,
        error: checkError,
        // OTR Solutions data (billing authority)
        otr_data: otrResult?.success ? {
          name: otrResult.broker_name,
          approval_status: otrResult.approval_status,
          credit_limit: otrResult.credit_limit,
          mc_number: mcToCheck,
        } : null,
        // FMCSA data (compliance/address)
        fmcsa_data: fmcsaResult.found ? {
          legal_name: fmcsaResult.legal_name,
          dba_name: fmcsaResult.dba_name,
          dot_number: fmcsaResult.dot_number,
          mc_number: fmcsaResult.mc_number,
          physical_address: fmcsaResult.physical_address,
          phone: fmcsaResult.phone,
          safer_status: fmcsaResult.safer_status,
          safety_rating: fmcsaResult.safety_rating,
        } : null,
        // Existing customer info
        existing_customer: existingCustomer ? {
          id: existingCustomer.id,
          name: existingCustomer.name,
          mc_number: existingCustomer.mc_number,
          address: existingCustomer.address,
          city: existingCustomer.city,
          state: existingCustomer.state,
          zip: existingCustomer.zip,
          phone: existingCustomer.phone,
        } : null,
        // Similar customers for merge detection
        similar_customers: similarCustomers.length > 0 ? similarCustomers : null,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[check-broker-credit] Error:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
