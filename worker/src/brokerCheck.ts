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
 * - 30-minute broker-level TTL cache: keyed by (tenant_id, broker_key)
 *   where broker_key = customer_id > mc_number > normalized broker name
 * - pg_advisory_lock prevents concurrent OTR calls for the same broker
 * - Fan-out: ALL matches for a load_email_id receive the SAME approval_status
 * - If no MC number, rows are written without mc_number (UI shows GREY)
 */

import { supabase } from './supabase.js';
import { cleanCompanyName } from './cleanCompanyName.js';
import {
  normalizeName,
  deriveBrokerKey,
  hashBrokerKey,
  type MatchedCustomer,
  type BrokerCheckResult,
} from './brokerCheckUtils.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** TTL for broker-level OTR cache (30 minutes) */
const BROKER_CACHE_TTL_MS = 30 * 60 * 1000;

// ─── DB helpers ──────────────────────────────────────────────────────────────

/**
 * Acquire a pg_advisory_lock for (tenant_id, broker_key) to serialize OTR calls.
 * Returns true if lock was acquired successfully.
 */
async function acquireAdvisoryLock(tenantId: string, brokerKey: string): Promise<boolean> {
  const lockId = hashBrokerKey(tenantId, brokerKey);
  const { data, error } = await supabase.rpc('pg_advisory_xact_lock_try', { lock_id: lockId });
  if (error) {
    console.warn(`[broker-check] Advisory lock RPC error (non-fatal, proceeding):`, error.message);
    return true; // Fail-open: proceed without lock
  }
  return data !== false;
}

/**
 * Check broker-level cache: find most recent credit check for this broker
 * within the TTL window, regardless of which load_email triggered it.
 */
async function getBrokerCacheHit(
  tenantId: string,
  brokerKey: string,
  customerId: string | null,
  mcNumber: string | null,
  brokerName: string
): Promise<{ approvalStatus: string; customerId: string | null; mcNumber: string | null } | null> {
  const cutoff = new Date(Date.now() - BROKER_CACHE_TTL_MS).toISOString();

  // Build query matching ANY of the broker_key dimensions
  let query = supabase
    .from('broker_credit_checks')
    .select('approval_status, customer_id, mc_number')
    .eq('tenant_id', tenantId)
    .gte('checked_at', cutoff)
    .order('checked_at', { ascending: false })
    .limit(1);

  // Match by the strongest identifier available (same priority as broker_key derivation)
  if (customerId) {
    query = query.eq('customer_id', customerId);
  } else if (mcNumber) {
    query = query.eq('mc_number', mcNumber);
  } else {
    query = query.eq('broker_name', brokerName);
  }

  const { data } = await query;

  if (data && data.length > 0) {
    return {
      approvalStatus: data[0].approval_status,
      customerId: data[0].customer_id,
      mcNumber: data[0].mc_number,
    };
  }
  return null;
}

/**
 * Fetch existing match_ids that already have broker_credit_checks for a load_email_id.
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
 * 
 * @param isCacheFanout - If true, only insert MISSING matches (don't overwrite existing audit data)
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
  isCacheFanout: boolean = false
): Promise<void> {
  if (matchIds.length === 0) {
    console.log(`[broker-check] No matches to fan-out for load ${loadEmailId}`);
    return;
  }

  let targetMatchIds = matchIds;
  if (isCacheFanout) {
    const existingMatchIds = await getExistingCheckedMatchIds(tenantId, loadEmailId);
    targetMatchIds = matchIds.filter(id => !existingMatchIds.has(id));

    if (targetMatchIds.length === 0) {
      console.log(`[broker-check] Cache fan-out: all ${matchIds.length} matches already have checks`);
      return;
    }
    console.log(`[broker-check] Cache fan-out: filling gaps for ${targetMatchIds.length} of ${matchIds.length} matches`);
  }

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
    if (mcNumber) {
      row.mc_number = mcNumber;
    }
    return row;
  });

  const { error } = isCacheFanout
    ? await supabase.from('broker_credit_checks').insert(rows)
    : await supabase
        .from('broker_credit_checks')
        .upsert(rows, {
          onConflict: 'tenant_id,load_email_id,match_id',
          ignoreDuplicates: false,
        });

  if (error) {
    if (isCacheFanout && error.code === '23505') {
      console.log(`[broker-check] Cache fan-out: race-condition duplicate (safe to ignore)`);
      return;
    }
    console.error(`[broker-check] Fan-out ${isCacheFanout ? 'insert' : 'upsert'} failed:`, error);
  } else {
    console.log(`[broker-check] Fan-out complete: ${targetMatchIds.length} matches for load ${loadEmailId}`);
  }
}

// ─── Customer helpers ────────────────────────────────────────────────────────

/**
 * Find customer using RPC that searches BOTH name AND alias_names.
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

  const rows = data as MatchedCustomer[] | null;
  return rows?.[0] ?? null;
}

/**
 * Learn new alias if broker name differs from saved customer name.
 */
async function learnAliasIfNew(
  tenantId: string,
  customer: MatchedCustomer,
  brokerName: string
): Promise<boolean> {
  const normalizedBroker = normalizeName(brokerName);
  const normalizedCustomerName = normalizeName(customer.name);

  if (normalizedBroker === normalizedCustomerName) return false;

  const aliases = customer.alias_names ?? [];
  if (aliases.some(a => normalizeName(a) === normalizedBroker)) return false;

  const trimmedBroker = brokerName.trim();
  const { error } = await supabase
    .from('customers')
    .update({ alias_names: [...aliases, trimmedBroker] })
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
  // Step 1: Try RPC match (name + alias_names)
  const matchedCustomer = await findCustomerByBrokerName(tenantId, brokerName);

  if (matchedCustomer) {
    const aliasLearned = await learnAliasIfNew(tenantId, matchedCustomer, brokerName);
    return {
      customerId: matchedCustomer.id,
      created: false,
      existingStatus: matchedCustomer.otr_approval_status,
      savedMcNumber: matchedCustomer.mc_number || null,
      aliasLearned,
    };
  }

  // Step 2: If no name match but MC exists, try MC lookup
  if (mcNumber) {
    const { data: existingByMc } = await supabase
      .from('customers')
      .select('id, mc_number, otr_approval_status, name, alias_names')
      .eq('tenant_id', tenantId)
      .eq('mc_number', mcNumber)
      .limit(1);

    if (existingByMc && existingByMc.length > 0) {
      const customer = existingByMc[0] as MatchedCustomer;
      const aliasLearned = await learnAliasIfNew(tenantId, customer, brokerName);
      return {
        customerId: customer.id,
        created: false,
        existingStatus: customer.otr_approval_status,
        savedMcNumber: customer.mc_number || null,
        aliasLearned,
      };
    }

    // Step 3: Create new customer
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

  return { customerId: null, created: false, existingStatus: null, savedMcNumber: null, aliasLearned: false };
}

// ─── OTR API ─────────────────────────────────────────────────────────────────

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
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

// ─── Main entry point ────────────────────────────────────────────────────────

/**
 * Main function: Check broker credit for a load email after matches are created.
 * 
 * Flow:
 * 1. Resolve broker identity (customer_id / mc_number / name)
 * 2. Derive broker_key for cache lookup
 * 3. Acquire advisory lock on (tenant_id, broker_key)
 * 4. Check broker-level cache (30-min TTL)
 *    - cache_hit  → reuse decision, fan-out to matches
 *    - cache_miss → call OTR once, fan-out result
 * 5. Release lock (automatic with advisory xact lock)
 */
export async function checkBrokerCredit(
  tenantId: string,
  loadEmailId: string,
  parsedData: any,
  matchId?: string | null
): Promise<BrokerCheckResult> {
  const rawBrokerName = parsedData.broker_company || parsedData.broker || parsedData.customer;
  const brokerName = cleanCompanyName(rawBrokerName);
  const emailMcNumber = parsedData.mc_number;

  if (!brokerName) {
    console.log(`[broker-check] Skipped - no broker name found (raw: ${rawBrokerName?.slice(0, 50) || 'none'})`);
    return { success: false, error: 'No broker name' };
  }

  // Fetch ALL matches for fan-out
  const allMatchIds = await getAllMatchesForLoad(tenantId, loadEmailId);

  // Resolve customer identity
  const { customerId, created, existingStatus, savedMcNumber, aliasLearned } = await findOrCreateCustomer(
    tenantId,
    brokerName,
    emailMcNumber
  );

  const mcNumber = emailMcNumber || savedMcNumber;

  // Derive broker_key for cache: customer_id > mc_number > normalized name
  const brokerKey = deriveBrokerKey(customerId, mcNumber, brokerName);

  console.log(`[broker-check] Broker: "${brokerName}", broker_key: "${brokerKey}", MC: ${mcNumber || 'none'}, Matches: ${allMatchIds.length}${aliasLearned ? ', Alias learned!' : ''}`);

  // If no MC, can't call OTR — write unchecked rows for UI
  if (!mcNumber) {
    console.log(`[broker-check] cache_miss broker_key="${brokerKey}" tenant_id="${tenantId}" reason=no_mc`);
    await fanOutCreditCheckToMatches(
      tenantId, loadEmailId, allMatchIds, customerId, brokerName,
      null, 'unchecked', { reason: 'no_mc_number' }
    );
    return { success: true, approvalStatus: 'unchecked', customerId, customerCreated: created, aliasLearned };
  }

  // ── Advisory lock + cache check ──
  const lockAcquired = await acquireAdvisoryLock(tenantId, brokerKey);
  if (!lockAcquired) {
    console.log(`[broker-check] Could not acquire advisory lock for broker_key="${brokerKey}", proceeding anyway`);
  }

  // Check broker-level cache (30-min TTL)
  const cached = await getBrokerCacheHit(tenantId, brokerKey, customerId, mcNumber, brokerName);

  if (cached) {
    console.log(`[broker-check] cache_hit broker_key="${brokerKey}" tenant_id="${tenantId}" status="${cached.approvalStatus}"`);

    // Fan-out cached result to any missing match rows (instant badge update)
    await fanOutCreditCheckToMatches(
      tenantId, loadEmailId, allMatchIds, cached.customerId ?? customerId,
      brokerName, cached.mcNumber ?? mcNumber, cached.approvalStatus,
      { reason: 'broker_cache_hit', broker_key: brokerKey },
      true // isCacheFanout — only fill gaps
    );

    return { success: true, approvalStatus: cached.approvalStatus, customerId, customerCreated: created, aliasLearned };
  }

  // cache_miss → call OTR once
  console.log(`[broker-check] cache_miss broker_key="${brokerKey}" tenant_id="${tenantId}" → calling OTR`);

  const otrResult = await callOtrCheck(
    tenantId, mcNumber, brokerName, customerId, loadEmailId, matchId || null
  );

  // Fan-out fresh OTR result to ALL matches
  await fanOutCreditCheckToMatches(
    tenantId, loadEmailId, allMatchIds, customerId, brokerName,
    mcNumber, otrResult.approvalStatus, { otr_result: true, broker_key: brokerKey }
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
 * Non-blocking, fire-and-forget.
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
