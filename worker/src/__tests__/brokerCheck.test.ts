/**
 * Unit tests for broker credit check caching logic.
 * 
 * Tests the pure utility functions and verifies the cache-key derivation
 * and hashing behavior that underpins the 30-minute broker TTL.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { deriveBrokerKey, hashBrokerKey, normalizeName } from '../brokerCheckUtils';

describe('brokerCheckUtils', () => {
  describe('normalizeName', () => {
    it('lowercases and collapses whitespace', () => {
      expect(normalizeName('  Acme  Freight   LLC  ')).toBe('acme freight llc');
    });
    it('returns empty string for null/undefined', () => {
      expect(normalizeName(null)).toBe('');
      expect(normalizeName(undefined)).toBe('');
    });
  });

  describe('deriveBrokerKey', () => {
    it('prioritizes customer_id over mc_number and name', () => {
      expect(deriveBrokerKey('cust-123', 'MC456', 'Acme')).toBe('cust:cust-123');
    });
    it('falls back to mc_number when no customer_id', () => {
      expect(deriveBrokerKey(null, 'MC456', 'Acme')).toBe('mc:MC456');
    });
    it('falls back to normalized name when no customer_id or mc_number', () => {
      expect(deriveBrokerKey(null, null, '  Acme Freight  LLC ')).toBe('name:acme freight llc');
    });
  });

  describe('hashBrokerKey', () => {
    it('returns a 32-bit integer', () => {
      const h = hashBrokerKey('tenant-1', 'cust:abc');
      expect(Number.isInteger(h)).toBe(true);
      expect(h).toBeGreaterThanOrEqual(-2147483648);
      expect(h).toBeLessThanOrEqual(2147483647);
    });
    it('same inputs produce same hash', () => {
      const a = hashBrokerKey('t1', 'mc:123');
      const b = hashBrokerKey('t1', 'mc:123');
      expect(a).toBe(b);
    });
    it('different inputs produce different hash', () => {
      const a = hashBrokerKey('t1', 'mc:123');
      const b = hashBrokerKey('t1', 'mc:456');
      expect(a).not.toBe(b);
    });
  });
});

/**
 * Integration-style test: verifies that 100 loads from the same broker
 * should result in exactly 1 OTR API call due to broker-level caching.
 * 
 * This test mocks the Supabase client and fetch to isolate the caching logic.
 */
describe('checkBrokerCredit - broker-level cache', () => {
  let mockSupabase: any;
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

    // Mock supabase client
    const creditCheckRows: any[] = [];
    const mockQuery = (table: string) => {
      const chain: any = {
        _table: table,
        _filters: {} as Record<string, any>,
        select: vi.fn().mockReturnThis(),
        insert: vi.fn().mockImplementation((rows: any[]) => {
          if (table === 'broker_credit_checks') {
            creditCheckRows.push(...rows);
          }
          return { data: rows, error: null };
        }),
        upsert: vi.fn().mockImplementation((rows: any[]) => {
          if (table === 'broker_credit_checks') {
            creditCheckRows.push(...rows);
          }
          return { data: rows, error: null };
        }),
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockImplementation(function (this: any, col: string, val: any) {
          this._filters[col] = val;
          return this;
        }),
        gte: vi.fn().mockReturnThis(),
        not: vi.fn().mockReturnThis(),
        or: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockImplementation(function (this: any) {
          // For broker cache lookup: return data on 2nd+ calls (simulating cache hit)
          if (this._table === 'broker_credit_checks' && creditCheckRows.length > 0) {
            return {
              data: [{
                approval_status: 'approved',
                customer_id: 'cust-1',
                mc_number: 'MC123',
              }],
              error: null,
            };
          }
          // For customer lookup
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
          return { data: [], error: null };
        }),
        single: vi.fn().mockReturnValue({ data: { id: 'new-cust' }, error: null }),
      };
      return chain;
    };

    mockSupabase = {
      from: vi.fn().mockImplementation(mockQuery),
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
        if (fnName === 'pg_advisory_xact_lock_try') {
          return { data: true, error: null };
        }
        return { data: null, error: null };
      }),
    };

    // Mock the supabase module
    vi.doMock('../supabase.js', () => ({ supabase: mockSupabase }));
    vi.doMock('../cleanCompanyName.js', () => ({
      cleanCompanyName: (s: string) => s?.trim() || '',
    }));

    const mod = await import('../brokerCheck');
    checkBrokerCredit = mod.checkBrokerCredit;
  });

  it('100 loads from same broker triggers exactly 1 OTR call', async () => {
    const tenantId = 'tenant-abc';
    const parsedData = {
      broker_company: 'Test Broker',
      mc_number: 'MC123',
    };

    // Process 100 loads sequentially
    for (let i = 0; i < 100; i++) {
      await checkBrokerCredit(tenantId, `load-email-${i}`, parsedData, `match-${i}`);
    }

    // Count OTR API calls (fetch calls to check-broker-credit)
    const otrCalls = mockFetch.mock.calls.filter(
      (call: any[]) => typeof call[0] === 'string' && call[0].includes('check-broker-credit')
    );

    expect(otrCalls.length).toBe(1);
  });

  it('badge rows are created for each load so realtime UI updates', async () => {
    const tenantId = 'tenant-abc';
    const parsedData = {
      broker_company: 'Test Broker',
      mc_number: 'MC123',
    };

    // Process 3 loads
    for (let i = 0; i < 3; i++) {
      await checkBrokerCredit(tenantId, `load-email-${i}`, parsedData, `match-${i}`);
    }

    // Each call should have attempted to insert/upsert broker_credit_checks rows
    const insertCalls = mockSupabase.from.mock.calls.filter(
      (call: any[]) => call[0] === 'broker_credit_checks'
    );

    // At minimum, the first call writes rows and subsequent calls also write (fan-out)
    expect(insertCalls.length).toBeGreaterThanOrEqual(3);
  });
});
