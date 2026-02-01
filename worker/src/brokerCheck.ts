/**
 * Broker Credit Check Module
 * 
 * Checks broker factoring approval via OTR Solutions API
 * and auto-creates customers when MC numbers are found.
 * 
 * Uses RPC match_customer_by_broker_name to search both name AND alias_names.
 * Learns new alias names automatically when broker names differ.
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
  aliasLearned?: boolean;
  error?: string;
}

interface MatchedCustomer {
  id: string;
  name: string | null;
  mc_number: string | null;
  otr_approval_status: string | null;
  alias_names: string[] | null;
}

/**
 * Normalize broker name for comparison (lowercase, collapse whitespace)
 */
function normalizeName(name?: string | null): string {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
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
    
  return !!(existingCheck && existingCheck.length > 0);
}

/**
 * Find customer using RPC that searches BOTH name AND alias_names.
 * Returns the matched customer if found.
 */
async function findCustomerByBrokerName(
  tenantId: string,
  brokerName: string
): Promise<MatchedCustomer | null> {
  const { data, error } = await supabase.rpc('match_customer_by_broker_name', {
    p_tenant_id: tenantId,
    p_broker_name: brokerName,
  });

  if (error) {
    console.error(`[broker-check] RPC match_customer_by_broker_name error:`, error);
    return null;
  }

  // RPC returns array, get first match
  const rows = data as MatchedCustomer[] | null;
  return rows?.[0] ?? null;
}

/**
 * Learn new alias: if brokerName differs from saved name and isn't already in alias_names,
 * append it to the customer's alias_names array.
 */
async function learnAliasIfNew(
  tenantId: string,
  customer: MatchedCustomer,
  brokerName: string
): Promise<boolean> {
  const normalizedBroker = normalizeName(brokerName);
  const normalizedCustomerName = normalizeName(customer.name);
  
  // Don't add if it matches the primary name
  if (normalizedBroker === normalizedCustomerName) {
    return false;
  }
  
  // Don't add if already in alias_names
  const aliases = customer.alias_names ?? [];
  const alreadyExists = aliases.some(a => normalizeName(a) === normalizedBroker);
  if (alreadyExists) {
    return false;
  }
  
  // Append the new alias (keep original casing from the email)
  const trimmedBroker = brokerName.trim();
  const newAliases = [...aliases, trimmedBroker];
  
  const { error } = await supabase
    .from('customers')
    .update({ alias_names: newAliases })
    .eq('tenant_id', tenantId)
    .eq('id', customer.id);
  
  if (error) {
    console.error(`[broker-check] Failed to update alias_names:`, error);
    return false;
  }
  
  console.log(`[broker-check] Learned new alias "${trimmedBroker}" for customer "${customer.name}"`);
  return true;
}

/**
 * Find or create customer by broker name and MC number.
 * Uses RPC for name+alias matching, falls back to MC lookup, creates if needed.
 */
async function findOrCreateCustomer(
  tenantId: string,
  brokerName: string,
  mcNumber: string | null | undefined
): Promise<{ 
  customerId: string | null; 
  created: boolean; 
  existingStatus: string | null;
  savedMcNumber: string | null;
  aliasLearned: boolean;
}> {
  // Step 1: Try RPC match (searches name + alias_names)
  const matchedCustomer = await findCustomerByBrokerName(tenantId, brokerName);
  
  if (matchedCustomer) {
    // Learn new alias if broker name differs
    const aliasLearned = await learnAliasIfNew(tenantId, matchedCustomer, brokerName);
    
    return { 
      customerId: matchedCustomer.id, 
      created: false,
      existingStatus: matchedCustomer.otr_approval_status,
      savedMcNumber: matchedCustomer.mc_number || null,
      aliasLearned,
    };
  }
  
  // Step 2: If no match by name/alias but we have MC, try by MC
  if (mcNumber) {
    const { data: existingByMc } = await supabase
      .from('customers')
      .select('id, mc_number, otr_approval_status, name, alias_names')
      .eq('tenant_id', tenantId)
      .eq('mc_number', mcNumber)
      .limit(1);
      
    if (existingByMc && existingByMc.length > 0) {
      const customer = existingByMc[0] as MatchedCustomer;
      // Learn the broker name as an alias since MC matched
      const aliasLearned = await learnAliasIfNew(tenantId, customer, brokerName);
      
      return { 
        customerId: customer.id, 
        created: false,
        existingStatus: customer.otr_approval_status,
        savedMcNumber: customer.mc_number || null,
        aliasLearned,
      };
    }
    
    // Step 3: Customer doesn't exist and we have MC - create it!
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
          .select('id, mc_number, otr_approval_status')
          .eq('tenant_id', tenantId)
          .or(`name.ilike.%${brokerName}%,mc_number.eq.${mcNumber}`)
          .limit(1);
        return { 
          customerId: existing?.[0]?.id || null, 
          created: false,
          existingStatus: existing?.[0]?.otr_approval_status || null,
          savedMcNumber: existing?.[0]?.mc_number || null,
          aliasLearned: false,
        };
      }
      console.error(`[broker-check] Failed to create customer:`, createError);
      return { customerId: null, created: false, existingStatus: null, savedMcNumber: null, aliasLearned: false };
    }
    
    console.log(`[broker-check] Created new customer: ${brokerName} (MC: ${mcNumber})`);
    return { customerId: newCustomer?.id || null, created: true, existingStatus: null, savedMcNumber: mcNumber, aliasLearned: false };
  }
  
  // No customer found and no MC to create one
  return { customerId: null, created: false, existingStatus: null, savedMcNumber: null, aliasLearned: false };
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
      
      // Map HTTP status to approval status
      if (response.status === 404) {
        return { success: true, approvalStatus: 'not_found' };
      }
      
      return { success: false, approvalStatus: 'unchecked', error: errorText };
    }
    
    const result = await response.json() as { success?: boolean; approval_status?: string };
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
 * 2. Find customer using RPC (name + alias_names)
 * 3. Learn new aliases if broker name differs
 * 4. If customer has MC number, call OTR API
 * 5. Store result in broker_credit_checks and update customer
 */
export async function checkBrokerCredit(
  tenantId: string,
  loadEmailId: string,
  parsedData: any,
  matchId?: string | null
): Promise<BrokerCheckResult> {
  const orderNumber = parsedData.order_number;
  const brokerName = parsedData.broker_company || parsedData.broker || parsedData.customer;
  const emailMcNumber = parsedData.mc_number;
  
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
  
  // Find or create customer using RPC (searches name + alias_names)
  const { customerId, created, existingStatus, savedMcNumber, aliasLearned } = await findOrCreateCustomer(
    tenantId,
    brokerName,
    emailMcNumber
  );
  
  // Use saved MC from customer record if email didn't have one
  const mcNumber = emailMcNumber || savedMcNumber;
  
  console.log(`[broker-check] Broker: ${brokerName}, Email MC: ${emailMcNumber || 'none'}, Saved MC: ${savedMcNumber || 'none'}, Using MC: ${mcNumber || 'none'}${aliasLearned ? ', Alias learned!' : ''}`);
  
  // If customer doesn't have MC, we can't do OTR check
  if (!mcNumber) {
    console.log(`[broker-check] No MC number for broker ${brokerName}, cannot check OTR`);
    
    // Still record that we tried (for dedupe) - UI will show GREY
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
      aliasLearned,
    };
  }
  
  // Call OTR API for fresh approval status
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
    aliasLearned,
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
      if (result.aliasLearned) {
        console.log(`[broker-check] Learned new alias for broker match`);
      }
      if (result.approvalStatus) {
        console.log(`[broker-check] Status for load ${loadEmailId}: ${result.approvalStatus}`);
      }
    })
    .catch((err) => {
      console.error(`[broker-check] Error (non-blocking):`, err);
    });
}
