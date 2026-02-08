/**
 * Broker Credit Check Module
 * 
 * Concurrency model — "Leader Election" via UNIQUE insert on decision rows:
 *   Decision row: match_id=NULL, load_email_id=NULL, broker_key + decision_window_start set
 *   Fan-out rows: per-match, drive UI badge via realtime
 *   
 *   Partial unique index: (tenant_id, broker_key, decision_window_start) WHERE match_id IS NULL
 *   guarantees exactly one decision per broker per 30-min window.
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

const FOLLOWER_MAX_WAIT_MS = 5000;
const FOLLOWER_POLL_MS = 250;

// ─── Leader election ─────────────────────────────────────────────────────────

/**
 * Decision row shape (match_id=NULL, load_email_id=NULL).
 * This is what the partial unique index covers.
 */
function buildDecisionRow(
  tenantId: string,
  brokerKey: string,
  windowStartIso: string,
  brokerName: string,
  customerId: string | null,
  mcNumber: string | null,
  status: string,
  approvalStatus: string,
): Record<string, unknown> {
  const row: Record<string, unknown> = {
    tenant_id: tenantId,
    broker_key: brokerKey,
    decision_window_start: windowStartIso,
    match_id: null,          // ← decision row marker
    load_email_id: null,     // ← decision row marker
    status,
    approval_status: approvalStatus,
    broker_name: brokerName,
    customer_id: customerId,
    checked_at: new Date().toISOString(),
  };
  if (mcNumber) row.mc_number = mcNumber;
  return row;
}

/**
 * Attempt INSERT of a decision row (match_id=NULL).
 * Returns 'leader' if INSERT succeeds, 'follower' on unique conflict, 'error' otherwise.
 */
async function tryClaimLeader(
  tenantId: string,
  brokerKey: string,
  windowStartIso: string,
  customerId: string | null,
  brokerName: string,
  mcNumber: string | null
): Promise<'leader' | 'follower' | 'error'> {
  const row = buildDecisionRow(
    tenantId, brokerKey, windowStartIso, brokerName, customerId, mcNumber,
    'pending', 'pending'
  );

  const { error } = await supabase.from('broker_credit_checks').insert(row);

  if (!error) return 'leader';
  if (error.code === '23505') return 'follower';

  console.error(`[broker-check] Leader claim error:`, error);
  return 'error';
}

/**
 * Leader: update decision row to 'complete' with final approval_status.
 */
async function completeDecision(
  tenantId: string,
  brokerKey: string,
  windowStartIso: string,
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
    .eq('decision_window_start', windowStartIso)
    .is('match_id', null);

  if (error) console.error(`[broker-check] completeDecision failed:`, error);
}

/**
 * Leader: mark decision as error.
 */
async function errorDecision(
  tenantId: string,
  brokerKey: string,
  windowStartIso: string,
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
    .eq('decision_window_start', windowStartIso)
    .is('match_id', null);
}

/**
 * Read the decision row deterministically (match_id IS NULL).
 */
async function readDecisionRow(
  tenantId: string,
  brokerKey: string,
  windowStartIso: string
): Promise<{ approvalStatus: string; customerId: string | null; mcNumber: string | null; status: string } | null> {
  const { data } = await supabase
    .from('broker_credit_checks')
    .select('approval_status, customer_id, mc_number, status')
    .eq('tenant_id', tenantId)
    .eq('broker_key', brokerKey)
    .eq('decision_window_start', windowStartIso)
    .is('match_id', null)
    .order('checked_at', { ascending: false })
    .limit(1);

  return data?.[0] ?? null;
}

/**
 * Check for a completed decision in the current window (cache hit).
 */
async function getExistingDecision(
  tenantId: string,
  brokerKey: string,
  windowStartIso: string
): Promise<{ approvalStatus: string; customerId: string | null; mcNumber: string | null } | null> {
  const row = await readDecisionRow(tenantId, brokerKey, windowStartIso);
  if (row && row.status === 'complete') {
    return { approvalStatus: row.approvalStatus, customerId: row.customerId, mcNumber: row.mcNumber };
  }
  return null;
}

/**
 * Follower: poll decision row until complete/error, or timeout.
 * On timeout returns 'pending' (not 'unchecked') to avoid false GREY.
 */
async function waitForLeaderDecision(
  tenantId: string,
  brokerKey: string,
  windowStartIso: string
): Promise<{ approvalStatus: string; customerId: string | null; mcNumber: string | null }> {
  const deadline = Date.now() + FOLLOWER_MAX_WAIT_MS;

  while (Date.now() < deadline) {
    const row = await readDecisionRow(tenantId, brokerKey, windowStartIso);
    if (row && (row.status === 'complete' || row.status === 'error')) {
      return {
        approvalStatus: row.approvalStatus || 'unchecked',
        customerId: row.customerId,
        mcNumber: row.mcNumber,
      };
    }
    await sleep(FOLLOWER_POLL_MS);
  }

  console.warn(`[broker-check] Follower timeout for broker_key="${brokerKey}"`);
  // Return 'pending' instead of 'unchecked' to avoid false GREY badge
  return { approvalStatus: 'pending', customerId: null, mcNumber: null };
}

// ─── Fan-out (per-match rows for UI badge) ───────────────────────────────────

async function getExistingCheckedMatchIds(
  tenantId: string,
  loadEmailId: string
): Promise<Set<string>> {
  const { data } = await supabase
    .from('broker_credit_checks')
    .select('match_id')
    .eq('tenant_id', tenantId)
    .eq('load_email_id', loadEmailId)
    .not('match_id', 'is', null);

  return new Set((data || []).map(r => r.match_id).filter(Boolean));
}

async function getAllMatchesForLoad(
  tenantId: string,
  loadEmailId: string
): Promise<string[]> {
  const { data, error } = await supabase
    .from('load_hunt_matches')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('load_email_id', loadEmailId);

  if (error) {
    console.error(`[broker-check] Failed to fetch matches:`, error);
    return [];
  }
  return (data || []).map(m => m.id);
}

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
    const existing = await getExistingCheckedMatchIds(tenantId, loadEmailId);
    targetMatchIds = matchIds.filter(id => !existing.has(id));
    if (targetMatchIds.length === 0) {
      console.log(`[broker-check] Fan-out: all ${matchIds.length} matches covered`);
      return;
    }
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
    : await supabase.from('broker_credit_checks').upsert(rows, {
        onConflict: 'tenant_id,load_email_id,match_id',
        ignoreDuplicates: false,
      });

  if (error) {
    if (isCacheFanout && error.code === '23505') return;
    console.error(`[broker-check] Fan-out failed:`, error);
  } else {
    console.log(`[broker-check] Fan-out: ${targetMatchIds.length} matches for load ${loadEmailId}`);
  }
}

// ─── Customer helpers ────────────────────────────────────────────────────────

async function findCustomerByBrokerName(tenantId: string, brokerName: string): Promise<MatchedCustomer | null> {
  const { data, error } = await supabase.rpc('match_customer_by_broker_name', {
    p_tenant_id: tenantId,
    p_broker_name: brokerName,
  });
  if (error) {
    console.error(`[broker-check] RPC error:`, error);
    return null;
  }
  return (data as MatchedCustomer[] | null)?.[0] ?? null;
}

async function learnAliasIfNew(tenantId: string, customer: MatchedCustomer, brokerName: string): Promise<boolean> {
  const nb = normalizeName(brokerName);
  if (nb === normalizeName(customer.name)) return false;
  const aliases = customer.alias_names ?? [];
  if (aliases.some(a => normalizeName(a) === nb)) return false;

  const { error } = await supabase
    .from('customers')
    .update({ alias_names: [...aliases, brokerName.trim()] })
    .eq('tenant_id', tenantId)
    .eq('id', customer.id);

  if (error) { console.error(`[broker-check] alias update failed:`, error); return false; }
  console.log(`[broker-check] Learned alias "${brokerName.trim()}" for "${customer.name}"`);
  return true;
}

async function findOrCreateCustomer(
  tenantId: string, brokerName: string, mcNumber: string | null | undefined
): Promise<{ customerId: string | null; created: boolean; savedMcNumber: string | null; aliasLearned: boolean }> {
  const matched = await findCustomerByBrokerName(tenantId, brokerName);
  if (matched) {
    const al = await learnAliasIfNew(tenantId, matched, brokerName);
    return { customerId: matched.id, created: false, savedMcNumber: matched.mc_number || null, aliasLearned: al };
  }

  if (mcNumber) {
    const { data: byMc } = await supabase
      .from('customers')
      .select('id, mc_number, otr_approval_status, name, alias_names')
      .eq('tenant_id', tenantId).eq('mc_number', mcNumber).limit(1);

    if (byMc?.[0]) {
      const c = byMc[0] as MatchedCustomer;
      const al = await learnAliasIfNew(tenantId, c, brokerName);
      return { customerId: c.id, created: false, savedMcNumber: c.mc_number || null, aliasLearned: al };
    }

    const { data: nc, error: ce } = await supabase
      .from('customers')
      .insert({ tenant_id: tenantId, name: brokerName, mc_number: mcNumber, customer_type: 'broker', status: 'active', otr_approval_status: 'unchecked' })
      .select('id').single();

    if (ce) {
      if (ce.code === '23505') {
        const { data: ex } = await supabase.from('customers').select('id, mc_number').eq('tenant_id', tenantId)
          .or(`name.ilike.%${brokerName}%,mc_number.eq.${mcNumber}`).limit(1);
        return { customerId: ex?.[0]?.id || null, created: false, savedMcNumber: ex?.[0]?.mc_number || null, aliasLearned: false };
      }
      console.error(`[broker-check] Customer create failed:`, ce);
      return { customerId: null, created: false, savedMcNumber: null, aliasLearned: false };
    }
    console.log(`[broker-check] Created customer: ${brokerName} (MC: ${mcNumber})`);
    return { customerId: nc?.id || null, created: true, savedMcNumber: mcNumber, aliasLearned: false };
  }

  return { customerId: null, created: false, savedMcNumber: null, aliasLearned: false };
}

// ─── OTR API ─────────────────────────────────────────────────────────────────

async function callOtrCheck(
  tenantId: string, mcNumber: string, brokerName: string,
  customerId: string | null, loadEmailId: string, matchId: string | null
): Promise<{ success: boolean; approvalStatus: string; error?: string }> {
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/check-broker-credit`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${SUPABASE_SERVICE_KEY}` },
      body: JSON.stringify({ tenant_id: tenantId, mc_number: mcNumber, broker_name: brokerName, customer_id: customerId, load_email_id: loadEmailId, match_id: matchId, force_check: true }),
    });
    if (!res.ok) {
      const t = await res.text();
      if (res.status === 404) return { success: true, approvalStatus: 'not_found' };
      return { success: false, approvalStatus: 'unchecked', error: t };
    }
    const r = await res.json() as { success?: boolean; approval_status?: string };
    return { success: r.success ?? false, approvalStatus: r.approval_status || 'unchecked' };
  } catch (e) {
    console.error(`[broker-check] OTR call failed:`, e);
    return { success: false, approvalStatus: 'unchecked', error: e instanceof Error ? e.message : 'Unknown' };
  }
}

// ─── Main ────────────────────────────────────────────────────────────────────

export async function checkBrokerCredit(
  tenantId: string, loadEmailId: string, parsedData: any, matchId?: string | null
): Promise<BrokerCheckResult> {
  const rawBrokerName = parsedData.broker_company || parsedData.broker || parsedData.customer;
  const brokerName = cleanCompanyName(rawBrokerName);
  const emailMcNumber = parsedData.mc_number;

  if (!brokerName) {
    console.log(`[broker-check] Skipped - no broker name`);
    return { success: false, error: 'No broker name' };
  }

  const allMatchIds = await getAllMatchesForLoad(tenantId, loadEmailId);
  const { customerId, created, savedMcNumber, aliasLearned } = await findOrCreateCustomer(tenantId, brokerName, emailMcNumber);
  const mcNumber = emailMcNumber || savedMcNumber;
  const brokerKey = deriveBrokerKey(customerId, mcNumber, brokerName);
  const windowStartIso = computeDecisionWindow().toISOString();

  console.log(`[broker-check] Broker: "${brokerName}", broker_key: "${brokerKey}", MC: ${mcNumber || 'none'}, Matches: ${allMatchIds.length}`);

  // No MC → unchecked
  if (!mcNumber) {
    console.log(`[broker-check] cache_miss broker_key="${brokerKey}" tenant="${tenantId}" reason=no_mc`);
    await fanOutCreditCheckToMatches(tenantId, loadEmailId, allMatchIds, customerId, brokerName, brokerKey, null, 'unchecked', { reason: 'no_mc_number' });
    return { success: true, approvalStatus: 'unchecked', customerId, customerCreated: created, aliasLearned };
  }

  // ── Cache hit? ──
  const cached = await getExistingDecision(tenantId, brokerKey, windowStartIso);
  if (cached) {
    console.log(`[broker-check] cache_hit broker_key="${brokerKey}" tenant="${tenantId}" status="${cached.approvalStatus}"`);
    await fanOutCreditCheckToMatches(tenantId, loadEmailId, allMatchIds, cached.customerId ?? customerId, brokerName, brokerKey, cached.mcNumber ?? mcNumber, cached.approvalStatus, { reason: 'cache_hit' }, true);
    return { success: true, approvalStatus: cached.approvalStatus, customerId, customerCreated: created, aliasLearned };
  }

  // ── Leader election ──
  console.log(`[broker-check] cache_miss broker_key="${brokerKey}" tenant="${tenantId}" → leader claim`);
  const role = await tryClaimLeader(tenantId, brokerKey, windowStartIso, customerId, brokerName, mcNumber);

  if (role === 'leader') {
    console.log(`[broker-check] LEADER broker_key="${brokerKey}" → calling OTR`);
    const otr = await callOtrCheck(tenantId, mcNumber, brokerName, customerId, loadEmailId, matchId || null);

    if (otr.success) {
      await completeDecision(tenantId, brokerKey, windowStartIso, otr.approvalStatus, { otr_result: true });
    } else {
      await errorDecision(tenantId, brokerKey, windowStartIso, otr.error || 'unknown');
    }

    await fanOutCreditCheckToMatches(tenantId, loadEmailId, allMatchIds, customerId, brokerName, brokerKey, mcNumber, otr.approvalStatus, { otr_result: true });
    return { success: otr.success, approvalStatus: otr.approvalStatus, customerId, customerCreated: created, aliasLearned, error: otr.error };

  } else if (role === 'follower') {
    console.log(`[broker-check] FOLLOWER broker_key="${brokerKey}" → waiting`);
    const decision = await waitForLeaderDecision(tenantId, brokerKey, windowStartIso);

    await fanOutCreditCheckToMatches(tenantId, loadEmailId, allMatchIds, decision.customerId ?? customerId, brokerName, brokerKey, decision.mcNumber ?? mcNumber, decision.approvalStatus, { reason: 'follower_reuse' }, true);
    return { success: true, approvalStatus: decision.approvalStatus, customerId, customerCreated: created, aliasLearned };

  } else {
    // Error fallback → direct OTR call
    console.warn(`[broker-check] Leader claim error, falling back to direct OTR`);
    const otr = await callOtrCheck(tenantId, mcNumber, brokerName, customerId, loadEmailId, matchId || null);
    await fanOutCreditCheckToMatches(tenantId, loadEmailId, allMatchIds, customerId, brokerName, brokerKey, mcNumber, otr.approvalStatus, { fallback: true });
    return { success: otr.success, approvalStatus: otr.approvalStatus, customerId, customerCreated: created, aliasLearned, error: otr.error };
  }
}

export function triggerBrokerCheck(tenantId: string, loadEmailId: string, parsedData: any, matchId?: string | null): void {
  checkBrokerCredit(tenantId, loadEmailId, parsedData, matchId)
    .then(r => {
      if (r.customerCreated) console.log(`[broker-check] Created customer for ${parsedData.broker_company || parsedData.broker}`);
      if (r.aliasLearned) console.log(`[broker-check] Learned new alias`);
      if (r.approvalStatus) console.log(`[broker-check] Status for load ${loadEmailId}: ${r.approvalStatus}`);
    })
    .catch(err => console.error(`[broker-check] Error (non-blocking):`, err));
}
