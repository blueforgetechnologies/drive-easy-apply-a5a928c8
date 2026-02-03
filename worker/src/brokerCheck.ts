/**
 * Broker Credit Check Module
 * 
 * Checks broker factoring approval via OTR Solutions API
 * and auto-creates customers when MC numbers are found.
 * 
 * Uses RPC match_customer_by_broker_name to search both name AND alias_names.
 * Learns new alias names automatically when broker names differ.
 * 
 * Key behavior:
 * - Deduplicates OTR API calls by (tenant_id, load_email_id) within 1-hour window
 * - Fan-out: ALL matches for a load_email_id receive the SAME approval_status
 * - If no MC number, rows are written without mc_number (UI shows GREY)
 */

import { supabase } from './supabase.js';
import { cleanCompanyName } from './cleanCompanyName.js';

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
 * Check if we've already checked this load_email_id for credit recently.
 * Returns the existing approval_status if found (for fan-out reuse), or null if no recent check.
 */
async function getRecentCheckResult(
  tenantId: string,
  loadEmailId: string
): Promise<{ approvalStatus: string; customerId: string | null; mcNumber: string | null } | null> {
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  
  // Fix #1: Get the MOST RECENT check, not a random one from the hour
  const { data: existingCheck } = await supabase
    .from('broker_credit_checks')
    .select('approval_status, customer_id, mc_number')
    .eq('tenant_id', tenantId)
    .eq('load_email_id', loadEmailId)
    .gte('checked_at', oneHourAgo)
    .order('checked_at', { ascending: false })
    .limit(1);
    
  if (existingCheck && existingCheck.length > 0) {
    return {
      approvalStatus: existingCheck[0].approval_status,
      customerId: existingCheck[0].customer_id,
      mcNumber: existingCheck[0].mc_number,
    };
  }
  return null;
}

/**
 * Fetch existing match_ids that already have broker_credit_checks for a load_email_id.
 * Used to avoid overwriting existing rows during dedupe fan-out.
 */
async function getExistingCheckedMatchIds(
  tenantId: string,
  loadEmailId: string
): Promise<Set<string>> {
  const { data: existing } = await supabase
    .from('broker_credit_checks')
    .select('match_id')
    .eq('tenant_id', tenantId)
    .eq('load_email_id', loadEmailId)
    .not('match_id', 'is', null);
    
  return new Set((existing || []).map(r => r.match_id).filter(Boolean));
}

/**
 * Fetch all match IDs for a given load_email_id (tenant-scoped).
 */
async function getAllMatchesForLoad(
  tenantId: string,
  loadEmailId: string
): Promise<string[]> {
  const { data: matches, error } = await supabase
    .from('load_hunt_matches')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('load_email_id', loadEmailId);
    
  if (error) {
    console.error(`[broker-check] Failed to fetch matches for load:`, error);
    return [];
  }
  
  return (matches || []).map(m => m.id);
}

/**
 * Fan-out: Upsert broker_credit_checks for ALL matches on a load_email_id.
 * This ensures every match row in UI shows the same status dot.
 * 
 * @param isDedupeFanout - If true, only insert MISSING matches (don't overwrite existing audit data)
 */
async function fanOutCreditCheckToMatches(
  tenantId: string,
  loadEmailId: string,
  matchIds: string[],
  customerId: string | null,
  brokerName: string,
  mcNumber: string | null,
  approvalStatus: string,
  rawResponse: Record<string, unknown> | null,
  isDedupeFanout: boolean = false
): Promise<void> {
  if (matchIds.length === 0) {
    console.log(`[broker-check] No matches to fan-out for load ${loadEmailId}`);
    return;
  }
  
  // Fix #2: For dedupe fan-out, only insert rows for MISSING match_ids
  let targetMatchIds = matchIds;
  if (isDedupeFanout) {
    const existingMatchIds = await getExistingCheckedMatchIds(tenantId, loadEmailId);
    targetMatchIds = matchIds.filter(id => !existingMatchIds.has(id));
    
    if (targetMatchIds.length === 0) {
      console.log(`[broker-check] Dedupe fan-out: all ${matchIds.length} matches already have checks`);
      return;
    }
    console.log(`[broker-check] Dedupe fan-out: filling gaps for ${targetMatchIds.length} of ${matchIds.length} matches`);
  }
  
  // Build rows for bulk insert - only include mc_number if present
  const rows = targetMatchIds.map(matchId => {
    const row: Record<string, unknown> = {
      tenant_id: tenantId,
      customer_id: customerId,
      broker_name: brokerName,
      approval_status: approvalStatus,
      load_email_id: loadEmailId,
      match_id: matchId,
      raw_response: rawResponse,
      checked_at: new Date().toISOString(),
    };
    
    // Guardrail #2: Only set mc_number if we actually have one
    if (mcNumber) {
      row.mc_number = mcNumber;
    }
    
    return row;
  });
  
  // For dedupe fan-out, use INSERT with ignoreDuplicates to avoid overwrites
  // For fresh checks, use UPSERT to update if needed
  const { error } = isDedupeFanout
    ? await supabase
        .from('broker_credit_checks')
        .insert(rows)
    : await supabase
        .from('broker_credit_checks')
        .upsert(rows, { 
          onConflict: 'tenant_id,load_email_id,match_id',
          ignoreDuplicates: false 
        });
    
  if (error) {
    // Ignore duplicate key errors for dedupe fan-out (race condition protection)
    if (isDedupeFanout && error.code === '23505') {
      console.log(`[broker-check] Dedupe fan-out: some rows already existed (race condition, safe to ignore)`);
      return;
    }
    console.error(`[broker-check] Fan-out ${isDedupeFanout ? 'insert' : 'upsert'} failed:`, error);
  } else {
    console.log(`[broker-check] Fan-out complete: ${targetMatchIds.length} matches for load ${loadEmailId}`);
  }
}

/**
 * Find customer using RPC that searches BOTH name AND alias_names.
 * Returns the matched customer if found.
 */
async function findCustomerByBrokerName(
  tenantId: string,
  brokerName: string
): Promise<MatchedCustomer | null> {
  // DEBUG: Log exact RPC call parameters
  console.log(`[broker-check] 🔍 DEBUG RPC CALL:
    function: match_customer_by_broker_name
    p_tenant_id: "${tenantId}"
    p_broker_name: "${brokerName}"
    lowercase_needle: "${brokerName.toLowerCase().replace(/\s+/g, ' ').trim()}"`);
  
  const { data, error } = await supabase.rpc('match_customer_by_broker_name', {
    p_tenant_id: tenantId,
    p_broker_name: brokerName,
  });

  if (error) {
    console.error(`[broker-check] RPC match_customer_by_broker_name error:`, error);
    return null;
  }

  // DEBUG: Log RPC result
  const rows = data as MatchedCustomer[] | null;
  const match = rows?.[0] ?? null;
  console.log(`[broker-check] 🔍 DEBUG RPC RESULT:
    rowsReturned: ${rows?.length ?? 0}
    matchedCustomer: ${match ? `"${match.name}" (id: ${match.id}, MC: ${match.mc_number || 'null'})` : 'null'}
    aliases: ${match?.alias_names ? JSON.stringify(match.alias_names) : '[]'}`);
  
  return match;
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
 * 1. Check if already checked (dedupe by load_email_id within 1-hour window)
 * 2. If dedupe triggers, STILL fan-out to any missing matches (guardrail #1)
 * 3. Find customer using RPC (name + alias_names)
 * 4. Learn new aliases if broker name differs
 * 5. If customer has MC number, call OTR API
 * 6. Fan-out the SAME result to ALL matches on this load_email_id
 */
export async function checkBrokerCredit(
  tenantId: string,
  loadEmailId: string,
  parsedData: any,
  matchId?: string | null
): Promise<BrokerCheckResult> {
  // Extract raw broker name from parsed data (may contain boilerplate/noise)
  const rawBrokerName = parsedData.broker_company || parsedData.broker || parsedData.customer;
  // Sanitize to extract just the company name (strip phone, email, metadata)
  const brokerName = cleanCompanyName(rawBrokerName);
  const emailMcNumber = parsedData.mc_number;
  
  // DEBUG: Log both raw and normalized broker names BEFORE lookup
  console.log(`[broker-check] 🔍 DEBUG TRACE - load ${loadEmailId}:
    rawBrokerName: "${rawBrokerName?.slice(0, 80) || 'null'}"
    normalizedBrokerName (after cleanCompanyName): "${brokerName || 'null'}"
    emailMcNumber: "${emailMcNumber || 'null'}"
    RPC will search: match_customer_by_broker_name(tenant_id, "${brokerName}")`);
  
  // Skip if no broker name (even after cleanup)
  if (!brokerName) {
    console.log(`[broker-check] Skipped - no broker name found (raw: ${rawBrokerName?.slice(0, 50) || 'none'})`);
    return { success: false, error: 'No broker name' };
  }
  
  // Fetch ALL matches for this load (for fan-out)
  const allMatchIds = await getAllMatchesForLoad(tenantId, loadEmailId);
  
  // Check for recent dedupe - if found, reuse result but still fan-out (guardrail #1)
  const recentResult = await getRecentCheckResult(tenantId, loadEmailId);
  if (recentResult) {
    console.log(`[broker-check] Dedupe hit for load ${loadEmailId} - reusing status: ${recentResult.approvalStatus}, fan-out to ${allMatchIds.length} matches`);
    
    // Fan-out existing result to any MISSING matches only (isDedupeFanout=true)
    await fanOutCreditCheckToMatches(
      tenantId,
      loadEmailId,
      allMatchIds,
      recentResult.customerId,
      brokerName,
      recentResult.mcNumber,
      recentResult.approvalStatus,
      { reason: 'dedupe_fanout' },
      true // isDedupeFanout - only fill gaps, don't overwrite existing audit data
    );
    
    return { success: true, approvalStatus: recentResult.approvalStatus };
  }
  
  // Find or create customer using RPC (searches name + alias_names)
  const { customerId, created, existingStatus, savedMcNumber, aliasLearned } = await findOrCreateCustomer(
    tenantId,
    brokerName,
    emailMcNumber
  );
  
  // DEBUG: Log customer lookup result
  console.log(`[broker-check] 🔍 DEBUG LOOKUP RESULT - load ${loadEmailId}:
    customerFound: ${customerId ? 'YES' : 'NO'}
    customerId: "${customerId || 'null'}"
    savedMcNumber: "${savedMcNumber || 'null'}"
    existingStatus: "${existingStatus || 'null'}"
    aliasLearned: ${aliasLearned}`);
  
  // Use saved MC from customer record if email didn't have one
  const mcNumber = emailMcNumber || savedMcNumber;
  
  console.log(`[broker-check] Broker: "${brokerName}" (raw: ${rawBrokerName?.slice(0, 30) || 'none'}), Email MC: ${emailMcNumber || 'none'}, Saved MC: ${savedMcNumber || 'none'}, Using MC: ${mcNumber || 'none'}, Matches: ${allMatchIds.length}${aliasLearned ? ', Alias learned!' : ''}`);
  
  // If customer doesn't have MC, we can't do OTR check
  // Guardrail #2: Don't include mc_number in row, set status='unchecked'
  if (!mcNumber) {
    console.log(`[broker-check] No MC number for broker ${brokerName}, cannot check OTR - UI shows GREY`);
    
    // Fan-out 'unchecked' status to all matches (no mc_number in row)
    await fanOutCreditCheckToMatches(
      tenantId,
      loadEmailId,
      allMatchIds,
      customerId,
      brokerName,
      null, // No MC - guardrail #2
      'unchecked',
      { reason: 'no_mc_number' }
    );
    
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
  
  // Fan-out OTR result to ALL matches
  await fanOutCreditCheckToMatches(
    tenantId,
    loadEmailId,
    allMatchIds,
    customerId,
    brokerName,
    mcNumber,
    otrResult.approvalStatus,
    { otr_result: true }
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
