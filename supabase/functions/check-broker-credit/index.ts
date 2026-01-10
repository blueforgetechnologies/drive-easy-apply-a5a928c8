import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, getServiceClient } from "../_shared/assertTenantAccess.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// AES-GCM decryption using Web Crypto API
async function decrypt(ciphertext: string, masterKey: string): Promise<string> {
  const decoder = new TextDecoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(masterKey.padEnd(32, '0').slice(0, 32)),
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
  
  const combined = Uint8Array.from(atob(ciphertext), c => c.charCodeAt(0));
  const iv = combined.slice(0, 12);
  const encrypted = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv },
    keyMaterial,
    encrypted
  );
  
  return decoder.decode(decrypted);
}

// OTR Solutions API response types
interface OtrCheckResult {
  approval_status: 'approved' | 'not_approved' | 'call_otr' | 'not_found' | 'error';
  broker_name?: string;
  credit_limit?: number;
  message?: string;
  raw_response?: Record<string, unknown>;
}

// Check broker credit with OTR Solutions API
async function checkWithOtr(mcNumber: string, apiKey: string, clientId?: string): Promise<OtrCheckResult> {
  try {
    // Clean MC number (remove MC- prefix if present)
    const cleanMc = mcNumber.replace(/^MC-?/i, '').trim();
    
    console.log(`[check-broker-credit] Checking MC: ${cleanMc}`);
    
    // OTR Solutions API endpoint for broker credit check
    // Note: Actual endpoint may differ - update based on OTR documentation
    const response = await fetch('https://api.otrsolutions.com/v1/broker/check', {
      method: 'POST',
      headers: { 
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
        ...(clientId ? { 'X-Client-ID': clientId } : {})
      },
      body: JSON.stringify({ mc_number: cleanMc })
    });

    if (!response.ok) {
      if (response.status === 404) {
        return {
          approval_status: 'not_found',
          message: `Broker with MC ${cleanMc} not found in OTR database`
        };
      }
      if (response.status === 401 || response.status === 403) {
        return {
          approval_status: 'error',
          message: 'OTR API authentication failed'
        };
      }
      return {
        approval_status: 'error',
        message: `OTR API error: ${response.status}`
      };
    }

    const data = await response.json();
    
    // Parse OTR response - adapt based on actual API response format
    // Common statuses: APPROVED, NOT_APPROVED, CALL_OTR, etc.
    const statusMap: Record<string, OtrCheckResult['approval_status']> = {
      'APPROVED': 'approved',
      'NOT_APPROVED': 'not_approved',
      'CALL_OTR': 'call_otr',
      'CALL OTR': 'call_otr',
      'NOT_FOUND': 'not_found',
    };
    
    const otrStatus = (data.status || data.approval_status || '').toUpperCase();
    const mappedStatus = statusMap[otrStatus] || 'call_otr';
    
    return {
      approval_status: mappedStatus,
      broker_name: data.broker_name || data.company_name,
      credit_limit: data.credit_limit || data.limit,
      message: data.message || `Status: ${otrStatus}`,
      raw_response: data
    };
  } catch (error) {
    console.error('[check-broker-credit] OTR API error:', error);
    return {
      approval_status: 'error',
      message: error instanceof Error ? error.message : 'Connection failed'
    };
  }
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const body = await req.json();
    const { tenant_id, mc_number, broker_name, customer_id, load_email_id, match_id } = body;

    // Validate required fields
    if (!mc_number && !customer_id) {
      return new Response(
        JSON.stringify({ error: 'Either mc_number or customer_id is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check tenant access
    const authHeader = req.headers.get('Authorization');
    const accessCheck = await assertTenantAccess(authHeader, tenant_id);
    
    if (!accessCheck.allowed) {
      return accessCheck.response!;
    }

    // Get master key for credential decryption
    const masterKey = Deno.env.get('INTEGRATIONS_MASTER_KEY');
    if (!masterKey) {
      return new Response(
        JSON.stringify({ error: 'Integration encryption not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const adminClient = getServiceClient();

    // Get OTR integration credentials
    const { data: integration, error: integrationError } = await adminClient
      .from('tenant_integrations')
      .select('*')
      .eq('tenant_id', tenant_id)
      .eq('provider', 'otr_solutions')
      .single();

    if (integrationError || !integration || !integration.credentials_encrypted) {
      return new Response(
        JSON.stringify({ 
          error: 'OTR Solutions integration not configured',
          details: 'Please configure OTR Solutions in Integrations settings'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Decrypt credentials
    let credentials: Record<string, string>;
    try {
      const decrypted = await decrypt(integration.credentials_encrypted, masterKey);
      credentials = JSON.parse(decrypted);
    } catch (e) {
      console.error('[check-broker-credit] Decryption failed:', e);
      return new Response(
        JSON.stringify({ error: 'Failed to decrypt OTR credentials' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If customer_id provided, look up the MC number
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
        // Use customer's MC if we only have broker name
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

    // Call OTR Solutions API
    const result = await checkWithOtr(mcToCheck, credentials.api_key, credentials.client_id);
    
    console.log(`[check-broker-credit] Result for MC ${mcToCheck}: ${result.approval_status}`);

    // Record the check in history
    const { error: historyError } = await adminClient
      .from('broker_credit_checks')
      .insert({
        tenant_id,
        customer_id: resolvedCustomerId,
        broker_name: result.broker_name || resolvedBrokerName || 'Unknown',
        mc_number: mcToCheck,
        approval_status: result.approval_status,
        credit_limit: result.credit_limit,
        raw_response: result.raw_response,
        checked_by: accessCheck.user_id,
        load_email_id,
        match_id
      });

    if (historyError) {
      console.error('[check-broker-credit] Failed to record history:', historyError);
    }

    // Update customer record if we have a customer_id
    if (resolvedCustomerId) {
      const { error: updateError } = await adminClient
        .from('customers')
        .update({
          otr_approval_status: result.approval_status,
          otr_credit_limit: result.credit_limit,
          otr_last_checked_at: new Date().toISOString(),
          otr_check_error: result.approval_status === 'error' ? result.message : null,
          // Also update the legacy factoring_approval field for compatibility
          factoring_approval: result.approval_status === 'approved' ? 'approved' : 
                             result.approval_status === 'not_approved' ? 'declined' : 'pending'
        })
        .eq('id', resolvedCustomerId);

      if (updateError) {
        console.error('[check-broker-credit] Failed to update customer:', updateError);
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        mc_number: mcToCheck,
        approval_status: result.approval_status,
        broker_name: result.broker_name || resolvedBrokerName,
        credit_limit: result.credit_limit,
        message: result.message,
        customer_id: resolvedCustomerId
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