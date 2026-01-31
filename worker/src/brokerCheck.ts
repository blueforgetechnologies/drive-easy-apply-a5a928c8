/**
 * Broker Credit Check Module
 * 
 * Checks broker factoring approval via OTR Solutions API
 * and auto-creates customers when MC numbers are found.
 * 
 * Deduplicates by order_number to minimize API calls.
 */

import { supabase } from './supabase.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
// Use service role key for automated VPS broker checks (bypasses user auth)
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

export interface BrokerCheckResult {
  success: boolean;
  approvalStatus?: string;
  customerId?: string | null;
  customerCreated?: boolean;
  error?: string;
}

/**
 * Check if we've already checked this order_number for credit in this session.
 * Uses broker_credit_checks table to deduplicate.
 */
async function hasRecentCheck(
  tenantId: string,
  orderNumber: string | null | undefined,
  loadEmailId: string
): Promise<boolean> {
  // If no order number, we can't deduplicate - use load_email_id
  const lookupValue = orderNumber || loadEmailId;
  
  // Check if we have a recent check (within last hour) for this order
  // This deduplicates across multiple matches for the same load
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  const { data: existingCheck } = await supabase
    .from('broker_credit_checks')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('load_email_id', loadEmailId)
    .gte('checked_at', oneHourAgo)
    .limit(1);
    
  return (existingCheck && existingCheck.length > 0);
}

/**
 * Find or create customer by broker name and MC number.
 * Returns customer ID if found/created.
 */
async function findOrCreateCustomer(
  tenantId: string,
  brokerName: string,
  mcNumber: string | null | undefined
): Promise<{ customerId: string | null; created: boolean; existingStatus: string | null }> {
  // First, try to find by name (fuzzy)
  const { data: existingByName } = await supabase
    .from('customers')
    .select('id, mc_number, otr_approval_status')
    .eq('tenant_id', tenantId)
    .ilike('name', `%${brokerName}%`)
    .limit(1);
    
  if (existingByName && existingByName.length > 0) {
    return { 
      customerId: existingByName[0].id, 
      created: false,
      existingStatus: existingByName[0].otr_approval_status
    };
  }
  
  // If no match by name but we have MC, try by MC
  if (mcNumber) {
    const { data: existingByMc } = await supabase
      .from('customers')
      .select('id, otr_approval_status')
      .eq('tenant_id', tenantId)
      .eq('mc_number', mcNumber)
      .limit(1);
      
    if (existingByMc && existingByMc.length > 0) {
      return { 
        customerId: existingByMc[0].id, 
        created: false,
        existingStatus: existingByMc[0].otr_approval_status
      };
    }
    
    // Customer doesn't exist and we have MC - create it!
    const { data: newCustomer, error: createError } = await supabase
      .from('customers')
      .insert({
        tenant_id: tenantId,
        name: brokerName,
        mc_number: mcNumber,
        customer_type: 'broker',
        status: 'active',
        otr_approval_status: 'unchecked',
      })
      .select('id')
      .single();
      
    if (createError) {
      // Check for unique constraint violation (customer already exists)
      if (createError.code === '23505') {
        console.log(`[broker-check] Customer already exists (race condition), fetching existing`);
        const { data: existing } = await supabase
          .from('customers')
          .select('id, otr_approval_status')
          .eq('tenant_id', tenantId)
          .or(`name.ilike.%${brokerName}%,mc_number.eq.${mcNumber}`)
          .limit(1);
        return { 
          customerId: existing?.[0]?.id || null, 
          created: false,
          existingStatus: existing?.[0]?.otr_approval_status || null
        };
      }
      console.error(`[broker-check] Failed to create customer:`, createError);
      return { customerId: null, created: false, existingStatus: null };
    }
    
    console.log(`[broker-check] Created new customer: ${brokerName} (MC: ${mcNumber})`);
    return { customerId: newCustomer?.id || null, created: true, existingStatus: null };
  }
  
  // No customer found and no MC to create one
  return { customerId: null, created: false, existingStatus: null };
}

/**
 * Call the check-broker-credit edge function to perform OTR check.
 */
async function callOtrCheck(
  tenantId: string,
  mcNumber: string,
  brokerName: string,
  customerId: string | null,
  loadEmailId: string,
  matchId: string | null
): Promise<{ success: boolean; approvalStatus: string; error?: string }> {
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/check-broker-credit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}`,
      },
      body: JSON.stringify({
        tenant_id: tenantId,
        mc_number: mcNumber,
        broker_name: brokerName,
        customer_id: customerId,
        load_email_id: loadEmailId,
        match_id: matchId,
        force_check: true,
      }),
    });
    
    if (!response.ok) {
      const errorText = await response.text();
      console.error(`[broker-check] OTR API error: ${response.status} - ${errorText}`);
      return { success: false, approvalStatus: 'unchecked', error: errorText };
    }
    
    const result = await response.json();
    console.log(`[broker-check] OTR check result: ${result.approval_status || 'unknown'}`);
    
    return {
      success: result.success ?? false,
      approvalStatus: result.approval_status || 'unchecked',
    };
  } catch (error) {
    console.error(`[broker-check] OTR call failed:`, error);
    return { 
      success: false, 
      approvalStatus: 'unchecked',
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Main function: Check broker credit for a load email after matches are created.
 * 
 * Flow:
 * 1. Check if already checked (dedupe by order_number/load_email_id)
 * 2. Find or create customer
 * 3. If customer has MC number, call OTR API
 * 4. Store result in broker_credit_checks and update customer
 */
export async function checkBrokerCredit(
  tenantId: string,
  loadEmailId: string,
  parsedData: any,
  matchId?: string | null
): Promise<BrokerCheckResult> {
  const orderNumber = parsedData.order_number;
  const brokerName = parsedData.broker_company || parsedData.broker || parsedData.customer;
  const mcNumber = parsedData.mc_number;
  
  // Skip if no broker name
  if (!brokerName) {
    console.log(`[broker-check] Skipped - no broker name found`);
    return { success: false, error: 'No broker name' };
  }
  
  // Check if already processed (dedupe)
  const alreadyChecked = await hasRecentCheck(tenantId, orderNumber, loadEmailId);
  if (alreadyChecked) {
    console.log(`[broker-check] Skipped - already checked for order ${orderNumber || loadEmailId}`);
    return { success: true, approvalStatus: 'already_checked' };
  }
  
  // Find or create customer
  const { customerId, created, existingStatus } = await findOrCreateCustomer(
    tenantId,
    brokerName,
    mcNumber
  );
  
  // If customer doesn't have MC, we can't do OTR check
  if (!mcNumber) {
    console.log(`[broker-check] No MC number for broker ${brokerName}, cannot check OTR`);
    
    // Still record that we tried (for dedupe)
    await supabase.from('broker_credit_checks').insert({
      tenant_id: tenantId,
      customer_id: customerId,
      broker_name: brokerName,
      approval_status: 'unchecked',
      load_email_id: loadEmailId,
      match_id: matchId,
      raw_response: { reason: 'no_mc_number' },
    });
    
    return { 
      success: true, 
      approvalStatus: 'unchecked',
      customerId,
      customerCreated: created,
    };
  }
  
  // Perform OTR check
  const otrResult = await callOtrCheck(
    tenantId,
    mcNumber,
    brokerName,
    customerId,
    loadEmailId,
    matchId || null
  );
  
  return {
    success: otrResult.success,
    approvalStatus: otrResult.approvalStatus,
    customerId,
    customerCreated: created,
    error: otrResult.error,
  };
}

/**
 * Trigger broker check for a load email (called after matching).
 * This is non-blocking and fire-and-forget.
 */
export function triggerBrokerCheck(
  tenantId: string,
  loadEmailId: string,
  parsedData: any,
  matchId?: string | null
): void {
  checkBrokerCredit(tenantId, loadEmailId, parsedData, matchId)
    .then((result) => {
      if (result.customerCreated) {
        console.log(`[broker-check] Created new customer for ${parsedData.broker_company || parsedData.broker}`);
      }
      if (result.approvalStatus) {
        console.log(`[broker-check] Status for load ${loadEmailId}: ${result.approvalStatus}`);
      }
    })
    .catch((err) => {
      console.error(`[broker-check] Error (non-blocking):`, err);
    });
}
