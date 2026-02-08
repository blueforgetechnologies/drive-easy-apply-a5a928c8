/**
 * Shared types and pure utilities for broker credit checks.
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
 * Compute the 30-minute decision window start.
 * Floors the given date to the nearest 30-minute boundary.
 */
export function computeDecisionWindow(now: Date = new Date()): Date {
  const ms = now.getTime();
  const thirtyMin = 30 * 60 * 1000;
  return new Date(Math.floor(ms / thirtyMin) * thirtyMin);
}

/**
 * Sleep for a given number of milliseconds.
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
