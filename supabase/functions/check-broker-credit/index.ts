import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, getServiceClient } from "../_shared/assertTenantAccess.ts";
import { OTR_API_BASE_URL } from "../_shared/otrClient.ts";

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
  // Add other fields based on actual API response
  [key: string]: unknown;
}

interface OtrTokenResponse {
  access_token: string;
  refresh_token?: string;
  token_type: string;
  expires_in?: number;
}

// Get OAuth token from OTR Solutions
async function getOtrToken(subscriptionKey: string, username: string, password: string): Promise<{
  success: boolean;
  access_token?: string;
  error?: string;
}> {
  try {
    console.log('[check-broker-credit] Authenticating with OTR...');
    
    const formData = new URLSearchParams();
    formData.append('username', username);
    formData.append('password', password);
    
    const response = await fetch(`${OTR_API_BASE_URL}/auth/token`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
        'ocp-apim-subscription-key': subscriptionKey,
        'x-is-test': 'false'
      },
      body: formData.toString()
    });
    
    console.log(`[check-broker-credit] OTR auth response status: ${response.status}`);
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[check-broker-credit] OTR auth error: ${response.status} - ${errorText}`);
      return { success: false, error: `Authentication failed: ${response.status}` };
    }
    
    const data: OtrTokenResponse = await response.json();
    console.log('[check-broker-credit] OTR authentication successful');
    
    return {
      success: true,
      access_token: data.access_token
    };
  } catch (error) {
    console.error('[check-broker-credit] OTR auth error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Authentication failed'
    };
  }
}

// Check broker credit using OTR Solutions API
async function checkWithOtr(
  mcNumber: string, 
  subscriptionKey: string, 
  accessToken: string
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
    console.log(`[check-broker-credit] Checking OTR for MC: ${cleanMc}`);
    
    const response = await fetch(
      `${OTR_API_BASE_URL}/broker-check/${cleanMc}`,
      { 
        method: 'GET',
        headers: { 
          'Accept': 'application/json',
          'ocp-apim-subscription-key': subscriptionKey,
          'Authorization': `Bearer ${accessToken}`,
          'x-is-test': 'false'
        } 
      }
    );

    console.log(`[check-broker-credit] OTR API response status: ${response.status}`);

    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[check-broker-credit] OTR API error: ${response.status} - ${errorText}`);
      
      if (response.status === 401 || response.status === 403) {
        return { success: false, error: 'Invalid OTR credentials or access denied' };
      }
      if (response.status === 404) {
        return { 
          success: true, 
          approval_status: 'not_found',
          error: 'Broker not found in OTR system'
        };
      }
      return { success: false, error: `OTR API error: ${response.status}` };
    }

    const data: OtrBrokerCheckResponse = await response.json();
    console.log(`[check-broker-credit] OTR API response:`, JSON.stringify(data));
    
    // Map OTR response to our status format
    // Adjust these mappings based on actual OTR API response structure
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
        approvalStatus = 'call_otr'; // Default to call for unknown statuses
      }
    } else if (data.status) {
      // Try alternate field
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

// OTR credentials structure
interface OtrCredentials {
  subscriptionKey: string;
  username: string;
  password: string;
}

// Get OTR credentials from secrets or tenant integrations
async function getOtrCredentials(adminClient: ReturnType<typeof getServiceClient>, tenantId: string): Promise<OtrCredentials | null> {
  try {
    // First try global secrets
    const subscriptionKey = Deno.env.get('OTR_API_KEY');
    const username = Deno.env.get('OTR_USERNAME');
    const password = Deno.env.get('OTR_PASSWORD');
    
    if (subscriptionKey && username && password) {
      console.log('[check-broker-credit] Using global OTR credentials');
      return { subscriptionKey, username, password };
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
      // Decrypt credentials if stored encrypted
      const masterKey = Deno.env.get('INTEGRATIONS_MASTER_KEY');
      if (masterKey) {
        try {
          const decrypted = await decrypt(integrationData.encrypted_credentials, masterKey);
          const creds = JSON.parse(decrypted);
          if (creds.api_key && creds.username && creds.password) {
            console.log('[check-broker-credit] Using tenant OTR credentials');
            return { 
              subscriptionKey: creds.api_key, 
              username: creds.username, 
              password: creds.password 
            };
          }
        } catch (e) {
          console.error('[check-broker-credit] Failed to decrypt OTR credentials:', e);
        }
      }
    }

    return null;
  } catch (error) {
    console.error('[check-broker-credit] Error getting OTR credentials:', error);
    return null;
  }
}

// Decrypt credentials
async function decrypt(ciphertext: string, masterKey: string): Promise<string> {
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(masterKey.padEnd(32, '0').slice(0, 32)),
    { name: 'AES-GCM' },
    false,
    ['decrypt']
  );
  
  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    keyMaterial,
    data
  );
  
  return new TextDecoder().decode(decrypted);
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
      // For manual status updates
      manual_status,
      notes,
      // Force API check even if we have cached status
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

      // Get customer ID if we have broker name but not customer_id
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

      // Record the manual check in history
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

      // Update customer record if we have a customer_id
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

    // If we have broker_name but no customer_id, try to find matching customer
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

    // Try OTR API first
    const otrCredentials = await getOtrCredentials(adminClient, tenant_id);
    let otrResult: { 
      success: boolean; 
      approval_status?: string; 
      credit_limit?: number;
      broker_name?: string;
      raw_response?: OtrBrokerCheckResponse;
      error?: string;
    } | null = null;
    
    if (otrCredentials) {
      console.log('[check-broker-credit] OTR credentials found, authenticating...');
      
      // First get OAuth token
      const tokenResult = await getOtrToken(
        otrCredentials.subscriptionKey, 
        otrCredentials.username, 
        otrCredentials.password
      );
      
      if (tokenResult.success && tokenResult.access_token) {
        console.log('[check-broker-credit] OTR auth successful, checking broker...');
        otrResult = await checkWithOtr(mcToCheck, otrCredentials.subscriptionKey, tokenResult.access_token);
      } else {
        console.error('[check-broker-credit] OTR auth failed:', tokenResult.error);
        otrResult = { success: false, error: tokenResult.error || 'OTR authentication failed' };
      }
    } else {
      console.log('[check-broker-credit] No OTR credentials configured');
    }

    // Also get FMCSA data for additional broker info
    const fmcsaResult = await checkWithFmcsa(mcToCheck);
    
    console.log(`[check-broker-credit] Results for MC ${mcToCheck}:`, { 
      otr: otrResult, 
      fmcsa: fmcsaResult 
    });

    // Determine final approval status
    let finalStatus = 'unchecked';
    let creditLimit: number | null = null;
    let statusSource = 'none';
    let errorMessage: string | null = null;

    if (otrResult?.success && otrResult.approval_status) {
      finalStatus = otrResult.approval_status;
      creditLimit = otrResult.credit_limit || null;
      statusSource = 'otr_api';
    } else if (otrResult && !otrResult.success) {
      errorMessage = otrResult.error || 'OTR API check failed';
      // Keep unchecked status but record the error
    }

    // Record the check in history
    const { error: historyError } = await adminClient
      .from('broker_credit_checks')
      .insert({
        tenant_id,
        customer_id: resolvedCustomerId,
        broker_name: otrResult?.broker_name || fmcsaResult.legal_name || resolvedBrokerName || 'Unknown',
        mc_number: mcToCheck,
        approval_status: finalStatus,
        credit_limit: creditLimit,
        checked_by: accessCheck.user_id,
        load_email_id,
        match_id,
        raw_response: { 
          source: statusSource,
          otr: otrResult?.raw_response || null,
          fmcsa: fmcsaResult,
          error: errorMessage
        }
      });

    if (historyError) {
      console.error('[check-broker-credit] Failed to record history:', historyError);
    }

    // Update customer record
    if (resolvedCustomerId) {
      const updateData: Record<string, unknown> = {
        otr_last_checked_at: new Date().toISOString(),
        otr_check_error: errorMessage,
      };
      
      // Only update status if we got a definitive answer from OTR
      if (otrResult?.success && otrResult.approval_status && otrResult.approval_status !== 'unchecked') {
        updateData.otr_approval_status = finalStatus;
        updateData.otr_credit_limit = creditLimit;
        updateData.factoring_approval = finalStatus === 'approved' ? 'approved' : 
                                        finalStatus === 'not_approved' ? 'declined' : 'pending';
      }
      
      // Update DOT number from FMCSA if found
      if (fmcsaResult.found && fmcsaResult.dot_number) {
        updateData.dot_number = fmcsaResult.dot_number;
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
        success: otrResult?.success || false,
        mc_number: mcToCheck,
        approval_status: finalStatus,
        credit_limit: creditLimit,
        status_source: statusSource,
        broker_name: otrResult?.broker_name || fmcsaResult.legal_name || resolvedBrokerName,
        customer_id: resolvedCustomerId,
        fmcsa_found: fmcsaResult.found,
        fmcsa_status: fmcsaResult.status,
        legal_name: fmcsaResult.legal_name,
        dba_name: fmcsaResult.dba_name,
        dot_number: fmcsaResult.dot_number,
        phone: fmcsaResult.phone,
        error: errorMessage,
        message: otrResult?.success 
          ? `Credit status: ${finalStatus}${creditLimit ? ` (Limit: $${creditLimit.toLocaleString()})` : ''}`
          : errorMessage || (otrCredentials ? 'OTR check failed - please verify manually' : 'OTR API not configured - manual check required')
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[check-broker-credit] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
