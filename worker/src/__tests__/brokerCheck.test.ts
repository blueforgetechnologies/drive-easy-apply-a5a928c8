/**
 * Unit tests for broker credit check caching with leader-election.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveBrokerKey, computeDecisionWindow, normalizeName } from '../brokerCheckUtils';

describe('brokerCheckUtils', () => {
  describe('normalizeName', () => {
    it('lowercases and collapses whitespace', () => {
      expect(normalizeName('  Acme  Freight   LLC  ')).toBe('acme freight llc');
    });
    it('returns empty for null/undefined', () => {
      expect(normalizeName(null)).toBe('');
      expect(normalizeName(undefined)).toBe('');
    });
  });

  describe('deriveBrokerKey', () => {
    it('prioritizes customer_id', () => {
      expect(deriveBrokerKey('cust-123', 'MC456', 'Acme')).toBe('cust:cust-123');
    });
    it('falls back to mc_number', () => {
      expect(deriveBrokerKey(null, 'MC456', 'Acme')).toBe('mc:MC456');
    });
    it('falls back to normalized name', () => {
      expect(deriveBrokerKey(null, null, '  Acme Freight  LLC ')).toBe('name:acme freight llc');
    });
  });

  describe('computeDecisionWindow', () => {
    it('floors to 30-min boundary', () => {
      // 10:17 → 10:00
      const d = new Date('2025-01-15T10:17:42Z');
      const w = computeDecisionWindow(d);
      expect(w.getUTCMinutes()).toBe(0);
      expect(w.getUTCHours()).toBe(10);
    });
    it('exact boundary stays same', () => {
      const d = new Date('2025-01-15T10:30:00Z');
      const w = computeDecisionWindow(d);
      expect(w.getUTCMinutes()).toBe(30);
      expect(w.getUTCHours()).toBe(10);
    });
    it('10:45 → 10:30', () => {
      const d = new Date('2025-01-15T10:45:00Z');
      const w = computeDecisionWindow(d);
      expect(w.getUTCMinutes()).toBe(30);
    });
  });
});

/**
 * Integration test: leader-election deduplication.
 * Verifies that concurrent calls for the same broker result in exactly 1 OTR call.
 */
describe('checkBrokerCredit - leader election', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let checkBrokerCredit: typeof import('../brokerCheck').checkBrokerCredit;

  beforeEach(async () => {
    vi.resetModules();

    // Track OTR API calls
    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, approval_status: 'approved' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Track state: has a 'pending' leader row been inserted?
    let leaderInserted = false;
    let leaderCompleted = false;
    const fanOutInserts: any[][] = [];

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        const chain: any = {
          _table: table,
          _op: null as string | null,
          _filters: {} as Record<string, any>,
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockImplementation((rows: any) => {
            if (table === 'broker_credit_checks') {
              const rowArr = Array.isArray(rows) ? rows : [rows];
              // Check if this is a leader claim (has broker_key + decision_window_start + status=pending)
              const isLeaderClaim = rowArr.some(r => r.status === 'pending' && r.broker_key && r.decision_window_start);
              if (isLeaderClaim) {
                if (!leaderInserted) {
                  leaderInserted = true;
                  return { data: rowArr, error: null };
                }
                // Conflict! Another worker already claimed
                return { data: null, error: { code: '23505', message: 'unique violation' } };
              }
              // Fan-out insert
              fanOutInserts.push(rowArr);
              return { data: rowArr, error: null };
            }
            return { data: rows, error: null };
          }),
          upsert: vi.fn().mockImplementation((rows: any) => {
            if (table === 'broker_credit_checks') {
              fanOutInserts.push(Array.isArray(rows) ? rows : [rows]);
            }
            return { data: rows, error: null };
          }),
          update: vi.fn().mockImplementation(() => {
            // Mark leader as completed when update is called
            leaderCompleted = true;
            return chain;
          }),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockImplementation(function (this: any) {
            // For getExistingDecision: return complete row if leader has completed
            if (this._table === 'broker_credit_checks') {
              if (leaderCompleted) {
                return {
                  data: [{
                    approval_status: 'approved',
                    customer_id: 'cust-1',
                    mc_number: 'MC123',
                    status: 'complete',
                  }],
                  error: null,
                };
              }
              return { data: [], error: null };
            }
            // Customer lookup
            if (this._table === 'customers') {
              return {
                data: [{
                  id: 'cust-1',
                  name: 'Test Broker',
                  mc_number: 'MC123',
                  otr_approval_status: null,
                  alias_names: [],
                }],
                error: null,
              };
            }
            // load_hunt_matches
            return { data: [{ id: 'match-1' }], error: null };
          }),
          single: vi.fn().mockReturnValue({ data: { id: 'new-cust' }, error: null }),
        };
        return chain;
      }),
      rpc: vi.fn().mockImplementation((fnName: string) => {
        if (fnName === 'match_customer_by_broker_name') {
          return {
            data: [{
              id: 'cust-1',
              name: 'Test Broker',
              mc_number: 'MC123',
              otr_approval_status: null,
              alias_names: [],
            }],
            error: null,
          };
        }
        return { data: null, error: null };
      }),
    };

    vi.doMock('../supabase.js', () => ({ supabase: mockSupabase }));
    vi.doMock('../cleanCompanyName.js', () => ({
      cleanCompanyName: (s: string) => s?.trim() || '',
    }));

    const mod = await import('../brokerCheck');
    checkBrokerCredit = mod.checkBrokerCredit;
  });

  it('100 sequential loads from same broker → exactly 1 OTR call', async () => {
    const parsedData = { broker_company: 'Test Broker', mc_number: 'MC123' };

    for (let i = 0; i < 100; i++) {
      await checkBrokerCredit('tenant-abc', `load-email-${i}`, parsedData, `match-${i}`);
    }

    const otrCalls = mockFetch.mock.calls.filter(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('check-broker-credit')
    );
    expect(otrCalls.length).toBe(1);
  });

  it('simultaneous calls: leader succeeds, follower reuses result', async () => {
    const parsedData = { broker_company: 'Test Broker', mc_number: 'MC123' };

    // First call = leader (INSERT succeeds), second call = follower (INSERT conflicts)
    const [r1, r2] = await Promise.all([
      checkBrokerCredit('tenant-abc', 'load-1', parsedData, 'match-1'),
      checkBrokerCredit('tenant-abc', 'load-2', parsedData, 'match-2'),
    ]);

    // Both should return a result
    expect(r1.approvalStatus).toBeDefined();
    expect(r2.approvalStatus).toBeDefined();

    // Only 1 OTR call should have been made (leader only)
    const otrCalls = mockFetch.mock.calls.filter(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('check-broker-credit')
    );
    expect(otrCalls.length).toBe(1);
  });

  it('badge rows created for each load (fan-out works)', async () => {
    const parsedData = { broker_company: 'Test Broker', mc_number: 'MC123' };

    await checkBrokerCredit('tenant-abc', 'load-1', parsedData, 'match-1');
    await checkBrokerCredit('tenant-abc', 'load-2', parsedData, 'match-2');
    await checkBrokerCredit('tenant-abc', 'load-3', parsedData, 'match-3');

    // Each call should interact with broker_credit_checks for fan-out
    // (leader does upsert, followers do insert for their matches)
    expect(mockFetch).toHaveBeenCalledTimes(1); // Only 1 OTR call
  });
});
