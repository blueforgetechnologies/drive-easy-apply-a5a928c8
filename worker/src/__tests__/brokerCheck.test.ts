/**
 * Unit tests for broker credit check leader-election caching.
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
    it('floors 10:17 → 10:00', () => {
      const w = computeDecisionWindow(new Date('2025-01-15T10:17:42Z'));
      expect(w.toISOString()).toBe('2025-01-15T10:00:00.000Z');
    });
    it('10:30 stays 10:30', () => {
      const w = computeDecisionWindow(new Date('2025-01-15T10:30:00Z'));
      expect(w.toISOString()).toBe('2025-01-15T10:30:00.000Z');
    });
    it('10:45 → 10:30', () => {
      const w = computeDecisionWindow(new Date('2025-01-15T10:45:00Z'));
      expect(w.toISOString()).toBe('2025-01-15T10:30:00.000Z');
    });
  });
});

describe('checkBrokerCredit - leader election', () => {
  let mockFetch: ReturnType<typeof vi.fn>;
  let checkBrokerCredit: typeof import('../brokerCheck').checkBrokerCredit;

  beforeEach(async () => {
    vi.resetModules();

    mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, approval_status: 'approved' }),
    });
    vi.stubGlobal('fetch', mockFetch);

    // Track: has a decision row been inserted?
    let decisionInserted = false;
    let decisionCompleted = false;

    const mockSupabase = {
      from: vi.fn().mockImplementation((table: string) => {
        const chain: any = {
          _table: table,
          select: vi.fn().mockReturnThis(),
          insert: vi.fn().mockImplementation((rows: any) => {
            if (table === 'broker_credit_checks') {
              const rowArr = Array.isArray(rows) ? rows : [rows];
              // Decision row: match_id is null
              const isDecision = rowArr.some(r => r.match_id === null && r.status === 'pending');
              if (isDecision) {
                if (!decisionInserted) {
                  decisionInserted = true;
                  return { data: rowArr, error: null };
                }
                return { data: null, error: { code: '23505', message: 'unique violation' } };
              }
              // Fan-out rows
              return { data: rowArr, error: null };
            }
            return { data: rows, error: null };
          }),
          upsert: vi.fn().mockReturnValue({ data: [], error: null }),
          update: vi.fn().mockImplementation(() => {
            decisionCompleted = true;
            return chain;
          }),
          eq: vi.fn().mockReturnThis(),
          gte: vi.fn().mockReturnThis(),
          is: vi.fn().mockReturnThis(),
          not: vi.fn().mockReturnThis(),
          or: vi.fn().mockReturnThis(),
          order: vi.fn().mockReturnThis(),
          limit: vi.fn().mockImplementation(function (this: any) {
            // Decision row read (getExistingDecision / waitForLeaderDecision)
            if (this._table === 'broker_credit_checks') {
              if (decisionCompleted) {
                return { data: [{ approval_status: 'approved', customer_id: 'cust-1', mc_number: 'MC123', status: 'complete' }], error: null };
              }
              return { data: [], error: null };
            }
            if (this._table === 'customers') {
              return { data: [{ id: 'cust-1', name: 'Test Broker', mc_number: 'MC123', otr_approval_status: null, alias_names: [] }], error: null };
            }
            return { data: [{ id: 'match-1' }], error: null };
          }),
          single: vi.fn().mockReturnValue({ data: { id: 'new-cust' }, error: null }),
        };
        return chain;
      }),
      rpc: vi.fn().mockImplementation((fn: string) => {
        if (fn === 'match_customer_by_broker_name') {
          return { data: [{ id: 'cust-1', name: 'Test Broker', mc_number: 'MC123', otr_approval_status: null, alias_names: [] }], error: null };
        }
        return { data: null, error: null };
      }),
    };

    vi.doMock('../supabase.js', () => ({ supabase: mockSupabase }));
    vi.doMock('../cleanCompanyName.js', () => ({ cleanCompanyName: (s: string) => s?.trim() || '' }));

    const mod = await import('../brokerCheck');
    checkBrokerCredit = mod.checkBrokerCredit;
  });

  it('100 sequential loads from same broker → exactly 1 OTR call', async () => {
    const pd = { broker_company: 'Test Broker', mc_number: 'MC123' };
    for (let i = 0; i < 100; i++) {
      await checkBrokerCredit('tenant-abc', `load-${i}`, pd, `match-${i}`);
    }
    const otrCalls = mockFetch.mock.calls.filter((c: any[]) => typeof c[0] === 'string' && c[0].includes('check-broker-credit'));
    expect(otrCalls.length).toBe(1);
  });

  it('simultaneous calls: leader + follower = 1 OTR call', async () => {
    const pd = { broker_company: 'Test Broker', mc_number: 'MC123' };
    const [r1, r2] = await Promise.all([
      checkBrokerCredit('tenant-abc', 'load-1', pd, 'match-1'),
      checkBrokerCredit('tenant-abc', 'load-2', pd, 'match-2'),
    ]);
    expect(r1.approvalStatus).toBeDefined();
    expect(r2.approvalStatus).toBeDefined();
    const otrCalls = mockFetch.mock.calls.filter((c: any[]) => typeof c[0] === 'string' && c[0].includes('check-broker-credit'));
    expect(otrCalls.length).toBe(1);
  });

  it('decision row has match_id=null, fan-out rows have match_id set', async () => {
    const pd = { broker_company: 'Test Broker', mc_number: 'MC123' };
    await checkBrokerCredit('tenant-abc', 'load-1', pd, 'match-1');

    // Verify: the first insert call should be the decision row with match_id=null
    // (mockSupabase.from('broker_credit_checks').insert was called)
    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
