import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertTenantAccess, getServiceClient } from "../_shared/assertTenantAccess.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Check broker info using FMCSA API (free, public)
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
    
    // FMCSA Carrier lookup by MC number
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
      notes
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

    // Otherwise, do FMCSA lookup for MC validation
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

    // Call FMCSA API to validate MC exists
    const fmcsaResult = await checkWithFmcsa(mcToCheck);
    
    console.log(`[check-broker-credit] FMCSA result for MC ${mcToCheck}:`, fmcsaResult);

    // Record the FMCSA check (but status remains unchecked until manual confirmation)
    const { error: historyError } = await adminClient
      .from('broker_credit_checks')
      .insert({
        tenant_id,
        customer_id: resolvedCustomerId,
        broker_name: fmcsaResult.legal_name || resolvedBrokerName || 'Unknown',
        mc_number: mcToCheck,
        approval_status: 'unchecked', // Keep unchecked until manual OTR verification
        checked_by: accessCheck.user_id,
        load_email_id,
        match_id,
        raw_response: { fmcsa: fmcsaResult }
      });

    if (historyError) {
      console.error('[check-broker-credit] Failed to record history:', historyError);
    }

    // Update customer with FMCSA info if found
    if (resolvedCustomerId && fmcsaResult.found) {
      const updateData: Record<string, unknown> = {
        otr_last_checked_at: new Date().toISOString(),
      };
      
      // Update DOT number if found
      if (fmcsaResult.dot_number) {
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
        success: true,
        mc_number: mcToCheck,
        fmcsa_found: fmcsaResult.found,
        fmcsa_status: fmcsaResult.status,
        legal_name: fmcsaResult.legal_name,
        dba_name: fmcsaResult.dba_name,
        dot_number: fmcsaResult.dot_number,
        phone: fmcsaResult.phone,
        broker_name: fmcsaResult.legal_name || resolvedBrokerName,
        customer_id: resolvedCustomerId,
        // OTR status still needs manual check
        approval_status: 'unchecked',
        message: fmcsaResult.found 
          ? `MC verified via FMCSA. Please check OTR portal for credit approval.`
          : 'MC not found in FMCSA database'
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
