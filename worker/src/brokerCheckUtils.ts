/**
 * Shared types and pure utilities for broker credit checks.
 * Extracted to keep brokerCheck.ts focused and to enable unit testing.
 */

export interface BrokerCheckResult {
  success: boolean;
  approvalStatus?: string;
  customerId?: string | null;
  customerCreated?: boolean;
  aliasLearned?: boolean;
  error?: string;
}

export interface MatchedCustomer {
  id: string;
  name: string | null;
  mc_number: string | null;
  otr_approval_status: string | null;
  alias_names: string[] | null;
}

/**
 * Normalize broker name for comparison (lowercase, collapse whitespace).
 */
export function normalizeName(name?: string | null): string {
  return (name || '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/**
 * Derive a stable cache key for a broker.
 * Priority: customer_id > mc_number > normalized broker name.
 */
export function deriveBrokerKey(
  customerId: string | null | undefined,
  mcNumber: string | null | undefined,
  brokerName: string
): string {
  if (customerId) return `cust:${customerId}`;
  if (mcNumber) return `mc:${mcNumber}`;
  return `name:${normalizeName(brokerName)}`;
}

/**
 * Hash (tenant_id, broker_key) into a 32-bit signed integer
 * suitable for pg_advisory_lock.
 *
 * Uses FNV-1a for speed and low collision rate.
 */
export function hashBrokerKey(tenantId: string, brokerKey: string): number {
  const input = `${tenantId}::${brokerKey}`;
  let hash = 0x811c9dc5; // FNV offset basis
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = (hash * 0x01000193) | 0; // FNV prime, keep 32-bit
  }
  return hash;
}
