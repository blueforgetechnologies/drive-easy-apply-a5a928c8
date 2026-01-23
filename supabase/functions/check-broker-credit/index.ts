import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, getServiceClient } from "../_shared/assertTenantAccess.ts";
import { 
  OTR_API_BASE_URL, 
  decrypt, 
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

interface OtrBrokerCheckResponse {
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
async function checkWithOtr(
  mcNumber: string, 
  subscriptionKey: string,
  accessToken?: string  // Optional: only used if token auth is enabled
): Promise<{
  success: boolean;
  approval_status?: string;
  credit_limit?: number;
  broker_name?: string;
  raw_response?: OtrBrokerCheckResponse;
  error?: string;
}> {
  try {
    const cleanMc = mcNumber.replace(/^MC-?/i, '').trim();
    const requestUrl = `${OTR_API_BASE_URL}/broker-check/${cleanMc}`;
    
    console.log(`[check-broker-credit] GET ${requestUrl}`);
    console.log(`[check-broker-credit] Subscription key: ${maskSubscriptionKey(subscriptionKey)}`);
    console.log(`[check-broker-credit] Token auth enabled: ${isTokenAuthEnabled()}`);
    
    // Use token auth headers if enabled and token provided
    const headers = accessToken && isTokenAuthEnabled() 
      ? getOtrHeadersWithToken(subscriptionKey, accessToken)
      : getOtrHeaders(subscriptionKey);
    
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
    let approvalStatus = 'unchecked';
    if (data.approvalStatus) {
      const otrStatus = data.approvalStatus.toLowerCase();
      if (otrStatus === 'approved' || otrStatus === 'active' || otrStatus === 'yes') {
        approvalStatus = 'approved';
      } else if (otrStatus === 'declined' || otrStatus === 'denied' || otrStatus === 'no') {
        approvalStatus = 'not_approved';
      } else if (otrStatus === 'call' || otrStatus === 'pending' || otrStatus === 'review') {
        approvalStatus = 'call_otr';
      } else {
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

    return {
      success: true,
      approval_status: approvalStatus,
      credit_limit: data.creditLimit,
      broker_name: data.brokerName,
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

// Check broker info using FMCSA API (free, public) as fallback
async function checkWithFmcsa(mcNumber: string): Promise<{
  found: boolean;
  legal_name?: string;
  dba_name?: string;
  phone?: string;
  dot_number?: string;
  status?: string;
}> {
  try {
    const cleanMc = mcNumber.replace(/^MC-?/i, '').trim();
    console.log(`[check-broker-credit] Checking FMCSA for MC: ${cleanMc}`);
    
    const response = await fetch(
      `https://mobile.fmcsa.dot.gov/qc/services/carriers/docket-number/${cleanMc}?webKey=d3667c8f7b84e0af15b7e0d3aea0a8f0c29e6ec1`,
      { headers: { 'Accept': 'application/json' } }
    );

    if (!response.ok) {
      console.log(`[check-broker-credit] FMCSA returned ${response.status}`);
      return { found: false };
    }

    const data = await response.json();
    
    if (!data?.content || data.content.length === 0) {
      return { found: false };
    }

    const carrier = data.content[0]?.carrier;
    if (!carrier) {
      return { found: false };
    }

    return {
      found: true,
      legal_name: carrier.legalName,
      dba_name: carrier.dbaName,
      phone: carrier.phyPhone,
      dot_number: carrier.dotNumber?.toString(),
      status: carrier.allowedToOperate === 'Y' ? 'authorized' : 'not_authorized'
    };
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
  try {
    // First try global secret
    const subscriptionKey = Deno.env.get('OTR_API_KEY');
    
    if (subscriptionKey) {
      console.log(`[check-broker-credit] Using global OTR subscription key: ${maskSubscriptionKey(subscriptionKey)}`);
      return { 
        subscriptionKey,
        username: Deno.env.get('OTR_USERNAME'),
        password: Deno.env.get('OTR_PASSWORD'),
      };
    }

    // Then try tenant-specific integration
    const { data: integration } = await adminClient
      .from('tenant_integrations')
      .select('encrypted_credentials')
      .eq('tenant_id', tenantId)
      .eq('provider', 'otr_solutions')
      .eq('is_active', true)
      .single();

    const integrationData = integration as { encrypted_credentials?: string } | null;
    if (integrationData?.encrypted_credentials) {
      const masterKey = Deno.env.get('INTEGRATIONS_MASTER_KEY');
      if (masterKey) {
        try {
          const decrypted = await decrypt(integrationData.encrypted_credentials, masterKey);
          const creds = JSON.parse(decrypted);
          if (creds.api_key) {
            console.log(`[check-broker-credit] Using tenant OTR subscription key: ${maskSubscriptionKey(creds.api_key)}`);
            return { 
              subscriptionKey: creds.api_key,
              username: creds.username,
              password: creds.password,
            };
          }
        } catch (e) {
          console.error('[check-broker-credit] Failed to decrypt OTR credentials:', e);
        }
      }
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

    // Check tenant access
    const authHeader = req.headers.get('Authorization');
    const accessCheck = await assertTenantAccess(authHeader, tenant_id);
    
    if (!accessCheck.allowed) {
      return accessCheck.response!;
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

    if (broker_name && !customer_id) {
      const { data: matchingCustomers } = await adminClient
        .from('customers')
        .select('id, name, mc_number')
        .eq('tenant_id', tenant_id)
        .or(`name.ilike.%${broker_name}%,mc_number.eq.${mcToCheck}`)
        .limit(1);
      
      if (matchingCustomers && matchingCustomers.length > 0) {
        resolvedCustomerId = matchingCustomers[0].id;
        if (!mcToCheck && matchingCustomers[0].mc_number) {
          mcToCheck = matchingCustomers[0].mc_number;
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
      
      let accessToken: string | undefined;
      
      // Only attempt token auth if explicitly enabled via env flag
      if (isTokenAuthEnabled() && credentials.username && credentials.password) {
        console.log('[check-broker-credit] Token auth enabled, getting token...');
        const tokenResult = await getOtrToken(
          credentials.subscriptionKey,
          credentials.username,
          credentials.password
        );
        if (tokenResult.success) {
          accessToken = tokenResult.access_token;
        } else {
          console.warn('[check-broker-credit] Token auth failed, falling back to subscription-key-only:', tokenResult.error);
        }
      }
      
      // Call OTR API (with or without token)
      otrResult = await checkWithOtr(mcToCheck, credentials.subscriptionKey, accessToken);
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

    return new Response(
      JSON.stringify({
        success: otrResult?.success ?? false,
        approval_status: finalStatus,
        credit_limit: creditLimit,
        broker_name: finalBrokerName,
        dot_number: dotNumber,
        customer_id: resolvedCustomerId,
        fmcsa_data: fmcsaResult.found ? fmcsaResult : null,
        error: checkError
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
