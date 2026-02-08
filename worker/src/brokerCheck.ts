/**
 * Broker Credit Check Module
 * 
 * Checks broker factoring approval via OTR Solutions API
 * and auto-creates customers when MC numbers are found.
 * 
 * Uses RPC match_customer_by_broker_name to search both name AND alias_names.
 * Learns new alias names automatically when broker names differ.
 * 
 * Concurrency model — "Leader Election" via UNIQUE insert:
 *   1. Compute 30-min decision_window_start for (tenant_id, broker_key)
 *   2. Attempt INSERT with status='pending'
 *      - Success → Leader: call OTR, UPDATE status='complete'
 *      - Conflict → Follower: poll until status='complete', reuse result
 *   3. Fan-out result to all match rows so UI badges update instantly
 */

import { supabase } from './supabase.js';
import { cleanCompanyName } from './cleanCompanyName.js';
import {
  normalizeName,
  deriveBrokerKey,
  computeDecisionWindow,
  sleep,
  type MatchedCustomer,
  type BrokerCheckResult,
} from './brokerCheckUtils.js';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

/** Max time a follower will wait for the leader to complete (ms) */
const FOLLOWER_MAX_WAIT_MS = 5000;
/** Polling interval for follower waiting on leader (ms) */
const FOLLOWER_POLL_MS = 250;

// ─── DB helpers ──────────────────────────────────────────────────────────────

/**
 * Attempt to claim "leader" status for a broker decision window.
 * Returns:
 *   'leader'   – INSERT succeeded, caller should call OTR
 *   'follower' – INSERT conflicted, another worker is handling it
 *   'error'    – unexpected DB error
 */
async function tryClaimLeader(
  tenantId: string,
  brokerKey: string,
  windowStart: Date,
  customerId: string | null,
  brokerName: string,
  mcNumber: string | null,
  loadEmailId: string,
  matchId: string | null
): Promise<'leader' | 'follower' | 'error'> {
  const row: Record<string, unknown> = {
    tenant_id: tenantId,
    broker_key: brokerKey,
    decision_window_start: windowStart.toISOString(),
    status: 'pending',
    approval_status: 'pending',
    broker_name: brokerName,
    customer_id: customerId,
    load_email_id: loadEmailId,
    match_id: matchId,
    checked_at: new Date().toISOString(),
  };
  if (mcNumber) row.mc_number = mcNumber;

  const { error } = await supabase
    .from('broker_credit_checks')
    .insert(row);

  if (!error) return 'leader';

  // 23505 = unique_violation → another worker already inserted
  if (error.code === '23505') return 'follower';

  console.error(`[broker-check] Leader claim insert error:`, error);
  return 'error';
}

/**
 * Leader: update the decision row with the OTR result.
 */
async function completeDecision(
  tenantId: string,
  brokerKey: string,
  windowStart: Date,
  approvalStatus: string,
  rawResponse: Record<string, unknown> | null
): Promise<void> {
  const { error } = await supabase
    .from('broker_credit_checks')
    .update({
      approval_status: approvalStatus,
      status: 'complete',
      raw_response: rawResponse,
      checked_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('broker_key', brokerKey)
    .eq('decision_window_start', windowStart.toISOString());

  if (error) {
    console.error(`[broker-check] Failed to complete decision:`, error);
  }
}

/**
 * Leader: mark decision as error so followers don't wait forever.
 */
async function errorDecision(
  tenantId: string,
  brokerKey: string,
  windowStart: Date,
  errorMsg: string
): Promise<void> {
  await supabase
    .from('broker_credit_checks')
    .update({
      approval_status: 'unchecked',
      status: 'error',
      raw_response: { error: errorMsg } as any,
      checked_at: new Date().toISOString(),
    })
    .eq('tenant_id', tenantId)
    .eq('broker_key', brokerKey)
    .eq('decision_window_start', windowStart.toISOString());
}

/**
 * Follower: poll for the leader's decision to complete.
 * Returns the approval_status once complete, or 'unchecked' on timeout.
 */
async function waitForLeaderDecision(
  tenantId: string,
  brokerKey: string,
  windowStart: Date
): Promise<{ approvalStatus: string; customerId: string | null; mcNumber: string | null }> {
  const deadline = Date.now() + FOLLOWER_MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const { data } = await supabase
      .from('broker_credit_checks')
      .select('approval_status, customer_id, mc_number, status')
      .eq('tenant_id', tenantId)
      .eq('broker_key', brokerKey)
      .eq('decision_window_start', windowStart.toISOString())
      .limit(1);

    const row = data?.[0];
    if (row) {
      if (row.status === 'complete' || row.status === 'error') {
        return {
          approvalStatus: row.approval_status || 'unchecked',
          customerId: row.customer_id,
          mcNumber: row.mc_number,
        };
      }
    }

    await sleep(FOLLOWER_POLL_MS);
  }

  console.warn(`[broker-check] Follower timed out waiting for leader (broker_key="${brokerKey}")`);
  return { approvalStatus: 'unchecked', customerId: null, mcNumber: null };
}

/**
 * Check for a completed decision in the current 30-min window (cache hit).
 */
async function getExistingDecision(
  tenantId: string,
  brokerKey: string,
  windowStart: Date
): Promise<{ approvalStatus: string; customerId: string | null; mcNumber: string | null } | null> {
  const { data } = await supabase
    .from('broker_credit_checks')
    .select('approval_status, customer_id, mc_number, status')
    .eq('tenant_id', tenantId)
    .eq('broker_key', brokerKey)
    .eq('decision_window_start', windowStart.toISOString())
    .eq('status', 'complete')
    .limit(1);

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
 * These per-match rows drive the UI badge via realtime.
 */
async function fanOutCreditCheckToMatches(
  tenantId: string,
  loadEmailId: string,
  matchIds: string[],
  customerId: string | null,
  brokerName: string,
  brokerKey: string,
  mcNumber: string | null,
  approvalStatus: string,
  rawResponse: Record<string, unknown> | null,
  isCacheFanout: boolean = false
): Promise<void> {
  if (matchIds.length === 0) return;

  let targetMatchIds = matchIds;
  if (isCacheFanout) {
    const existingMatchIds = await getExistingCheckedMatchIds(tenantId, loadEmailId);
    targetMatchIds = matchIds.filter(id => !existingMatchIds.has(id));
    if (targetMatchIds.length === 0) {
      console.log(`[broker-check] Cache fan-out: all ${matchIds.length} matches already have checks`);
      return;
    }
    console.log(`[broker-check] Cache fan-out: filling ${targetMatchIds.length} of ${matchIds.length} matches`);
  }

  const rows = targetMatchIds.map(matchId => {
    const row: Record<string, unknown> = {
      tenant_id: tenantId,
      customer_id: customerId,
      broker_name: brokerName,
      broker_key: brokerKey,
      approval_status: approvalStatus,
      status: 'complete',
      load_email_id: loadEmailId,
      match_id: matchId,
      raw_response: rawResponse,
      checked_at: new Date().toISOString(),
    };
    if (mcNumber) row.mc_number = mcNumber;
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
      console.log(`[broker-check] Cache fan-out: race-condition duplicate (safe)`);
      return;
    }
    console.error(`[broker-check] Fan-out failed:`, error);
  } else {
    console.log(`[broker-check] Fan-out: ${targetMatchIds.length} matches for load ${loadEmailId}`);
  }
}

// ─── Customer helpers ────────────────────────────────────────────────────────

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

  return (data as MatchedCustomer[] | null)?.[0] ?? null;
}

async function learnAliasIfNew(
  tenantId: string,
  customer: MatchedCustomer,
  brokerName: string
): Promise<boolean> {
  const normalizedBroker = normalizeName(brokerName);
  if (normalizedBroker === normalizeName(customer.name)) return false;

  const aliases = customer.alias_names ?? [];
  if (aliases.some(a => normalizeName(a) === normalizedBroker)) return false;

  const { error } = await supabase
    .from('customers')
    .update({ alias_names: [...aliases, brokerName.trim()] })
    .eq('tenant_id', tenantId)
    .eq('id', customer.id);

  if (error) {
    console.error(`[broker-check] Failed to update alias_names:`, error);
    return false;
  }

  console.log(`[broker-check] Learned alias "${brokerName.trim()}" for "${customer.name}"`);
  return true;
}

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

    console.log(`[broker-check] Created customer: ${brokerName} (MC: ${mcNumber})`);
    return { customerId: newCustomer?.id || null, created: true, existingStatus: null, savedMcNumber: mcNumber, aliasLearned: false };
  }

  return { customerId: null, created: false, existingStatus: null, savedMcNumber: null, aliasLearned: false };
}

// ─── OTR API ─────────────────────────────────────────────────────────────────

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
      if (response.status === 404) return { success: true, approvalStatus: 'not_found' };
      return { success: false, approvalStatus: 'unchecked', error: errorText };
    }

    const result = await response.json() as { success?: boolean; approval_status?: string };
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
 * Check broker credit with leader-election concurrency control.
 *
 * Flow:
 * 1. Resolve broker identity → derive broker_key
 * 2. Compute 30-min decision_window_start
 * 3. Check for existing 'complete' decision → cache_hit
 * 4. If miss: try INSERT 'pending' row (leader election)
 *    - Leader: call OTR → UPDATE 'complete'
 *    - Follower: poll until 'complete'
 * 5. Fan-out result to all match rows → instant UI badge
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
    console.log(`[broker-check] Skipped - no broker name (raw: ${rawBrokerName?.slice(0, 50) || 'none'})`);
    return { success: false, error: 'No broker name' };
  }

  const allMatchIds = await getAllMatchesForLoad(tenantId, loadEmailId);

  // Resolve customer
  const { customerId, created, savedMcNumber, aliasLearned } = await findOrCreateCustomer(
    tenantId, brokerName, emailMcNumber
  );

  const mcNumber = emailMcNumber || savedMcNumber;
  const brokerKey = deriveBrokerKey(customerId, mcNumber, brokerName);
  const windowStart = computeDecisionWindow();

  console.log(`[broker-check] Broker: "${brokerName}", broker_key: "${brokerKey}", MC: ${mcNumber || 'none'}, Matches: ${allMatchIds.length}${aliasLearned ? ', Alias learned!' : ''}`);

  // No MC → can't call OTR, write unchecked rows for badge
  if (!mcNumber) {
    console.log(`[broker-check] cache_miss broker_key="${brokerKey}" tenant="${tenantId}" reason=no_mc`);
    await fanOutCreditCheckToMatches(
      tenantId, loadEmailId, allMatchIds, customerId, brokerName, brokerKey,
      null, 'unchecked', { reason: 'no_mc_number' }
    );
    return { success: true, approvalStatus: 'unchecked', customerId, customerCreated: created, aliasLearned };
  }

  // ── Step 1: Check for existing complete decision (fast cache hit) ──
  const existing = await getExistingDecision(tenantId, brokerKey, windowStart);
  if (existing) {
    console.log(`[broker-check] cache_hit broker_key="${brokerKey}" tenant="${tenantId}" status="${existing.approvalStatus}"`);
    await fanOutCreditCheckToMatches(
      tenantId, loadEmailId, allMatchIds, existing.customerId ?? customerId,
      brokerName, brokerKey, existing.mcNumber ?? mcNumber, existing.approvalStatus,
      { reason: 'broker_cache_hit', broker_key: brokerKey },
      true // isCacheFanout
    );
    return { success: true, approvalStatus: existing.approvalStatus, customerId, customerCreated: created, aliasLearned };
  }

  // ── Step 2: Leader election via UNIQUE insert ──
  console.log(`[broker-check] cache_miss broker_key="${brokerKey}" tenant="${tenantId}" → attempting leader claim`);

  const role = await tryClaimLeader(
    tenantId, brokerKey, windowStart, customerId, brokerName, mcNumber, loadEmailId, matchId || null
  );

  let approvalStatus: string;

  if (role === 'leader') {
    // ── Leader: call OTR, then update decision row ──
    console.log(`[broker-check] LEADER for broker_key="${brokerKey}" → calling OTR`);
    const otrResult = await callOtrCheck(
      tenantId, mcNumber, brokerName, customerId, loadEmailId, matchId || null
    );
    approvalStatus = otrResult.approvalStatus;

    if (otrResult.success) {
      await completeDecision(tenantId, brokerKey, windowStart, approvalStatus, { otr_result: true });
    } else {
      await errorDecision(tenantId, brokerKey, windowStart, otrResult.error || 'unknown');
    }

    // Fan-out to ALL matches (leader writes fresh rows)
    await fanOutCreditCheckToMatches(
      tenantId, loadEmailId, allMatchIds, customerId, brokerName, brokerKey,
      mcNumber, approvalStatus, { otr_result: true, broker_key: brokerKey }
    );

    return {
      success: otrResult.success,
      approvalStatus,
      customerId,
      customerCreated: created,
      aliasLearned,
      error: otrResult.error,
    };

  } else if (role === 'follower') {
    // ── Follower: wait for leader to complete ──
    console.log(`[broker-check] FOLLOWER for broker_key="${brokerKey}" → waiting for leader`);
    const decision = await waitForLeaderDecision(tenantId, brokerKey, windowStart);
    approvalStatus = decision.approvalStatus;

    // Fan-out cached result to this load's matches
    await fanOutCreditCheckToMatches(
      tenantId, loadEmailId, allMatchIds, decision.customerId ?? customerId,
      brokerName, brokerKey, decision.mcNumber ?? mcNumber, approvalStatus,
      { reason: 'follower_reuse', broker_key: brokerKey },
      true // isCacheFanout
    );

    return { success: true, approvalStatus, customerId, customerCreated: created, aliasLearned };

  } else {
    // ── Error: fall back to calling OTR directly ──
    console.warn(`[broker-check] Leader claim error for broker_key="${brokerKey}", falling back to direct OTR call`);
    const otrResult = await callOtrCheck(
      tenantId, mcNumber, brokerName, customerId, loadEmailId, matchId || null
    );

    await fanOutCreditCheckToMatches(
      tenantId, loadEmailId, allMatchIds, customerId, brokerName, brokerKey,
      mcNumber, otrResult.approvalStatus, { otr_result: true, fallback: true }
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
}

/**
 * Trigger broker check (fire-and-forget, called after matching).
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
        console.log(`[broker-check] Created customer for ${parsedData.broker_company || parsedData.broker}`);
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
