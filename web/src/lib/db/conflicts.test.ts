/**
 * Unit tests for $lib/db/conflicts.ts – last-write-wins conflict resolution.
 */

import { describe, it, expect } from 'vitest';
import {
  revHash,
  revGeneration,
  compareRevisions,
  pickWinner,
  planConflictResolution
} from './conflicts';
import type { RevEntry } from './conflicts';

describe('revHash', () => {
  it('extracts the hash part', () => {
    expect(revHash('3-abc123')).toBe('abc123');
  });

  it('returns the whole string when no dash', () => {
    expect(revHash('noDash')).toBe('noDash');
  });
});

describe('revGeneration', () => {
  it('extracts the generation number', () => {
    expect(revGeneration('3-abc')).toBe(3);
  });

  it('returns 0 when no dash', () => {
    expect(revGeneration('noDash')).toBe(0);
  });
});

describe('compareRevisions', () => {
  it('later updatedAt wins', () => {
    const a: RevEntry = { _rev: '1-aaa', updatedAt: '2026-06-02T00:00:00Z' };
    const b: RevEntry = { _rev: '1-bbb', updatedAt: '2026-06-01T00:00:00Z' };
    expect(compareRevisions(a, b)).toBeGreaterThan(0);
  });

  it('earlier updatedAt loses', () => {
    const a: RevEntry = { _rev: '1-aaa', updatedAt: '2026-06-01T00:00:00Z' };
    const b: RevEntry = { _rev: '1-bbb', updatedAt: '2026-06-02T00:00:00Z' };
    expect(compareRevisions(a, b)).toBeLessThan(0);
  });

  it('tied updatedAt resolves by rev hash', () => {
    const a: RevEntry = { _rev: '1-zzz', updatedAt: '2026-06-01T00:00:00Z' };
    const b: RevEntry = { _rev: '1-aaa', updatedAt: '2026-06-01T00:00:00Z' };
    expect(compareRevisions(a, b)).toBeGreaterThan(0); // 'zzz' > 'aaa'
  });

  it('equal revs return 0', () => {
    const a: RevEntry = { _rev: '1-aaa', updatedAt: '2026-06-01T00:00:00Z' };
    expect(compareRevisions(a, a)).toBe(0);
  });
});

describe('pickWinner', () => {
  it('returns the single entry when only one', () => {
    const e: RevEntry = { _rev: '1-aaa', updatedAt: '2026-06-01T00:00:00Z' };
    expect(pickWinner([e])).toBe(e);
  });

  it('picks the entry with the latest updatedAt', () => {
    const a: RevEntry = { _rev: '1-aaa', updatedAt: '2026-06-01T00:00:00Z' };
    const b: RevEntry = { _rev: '1-bbb', updatedAt: '2026-06-02T00:00:00Z' };
    expect(pickWinner([a, b])).toBe(b);
  });

  it('prefers preferRev on a tie', () => {
    const a: RevEntry = { _rev: '1-aaa', updatedAt: '2026-06-01T00:00:00Z' };
    const b: RevEntry = { _rev: '1-bbb', updatedAt: '2026-06-01T00:00:00Z' };
    expect(pickWinner([a, b], { preferRev: '1-aaa' })).toBe(a);
  });

  it('picks highest hash on tie without preferRev', () => {
    const a: RevEntry = { _rev: '1-zzz', updatedAt: '2026-06-01T00:00:00Z' };
    const b: RevEntry = { _rev: '1-aaa', updatedAt: '2026-06-01T00:00:00Z' };
    expect(pickWinner([a, b])).toBe(a); // 'zzz' > 'aaa'
  });

  it('throws for empty array', () => {
    expect(() => pickWinner([])).toThrow();
  });
});

describe('planConflictResolution', () => {
  it('winner is default when it has the latest updatedAt', () => {
    const def: RevEntry = { _rev: '2-def', updatedAt: '2026-06-02T00:00:00Z' };
    const conf: RevEntry = { _rev: '1-conf', updatedAt: '2026-06-01T00:00:00Z' };
    const plan = planConflictResolution(def, [conf]);
    expect(plan.winner).toBe(def);
    expect(plan.rewriteWinner).toBe(false);
    expect(plan.losers).toContain(conf);
  });

  it('winner is conflict branch when it has the latest updatedAt', () => {
    const def: RevEntry = { _rev: '1-def', updatedAt: '2026-06-01T00:00:00Z' };
    const conf: RevEntry = { _rev: '2-conf', updatedAt: '2026-06-02T00:00:00Z' };
    const plan = planConflictResolution(def, [conf]);
    expect(plan.winner).toBe(conf);
    expect(plan.rewriteWinner).toBe(true);
    expect(plan.losers).toContain(def);
  });

  it('clearRevs contains the conflict branch revisions', () => {
    const def: RevEntry = { _rev: '2-def', updatedAt: '2026-06-02T00:00:00Z' };
    const conf: RevEntry = { _rev: '1-conf', updatedAt: '2026-06-01T00:00:00Z' };
    const plan = planConflictResolution(def, [conf]);
    expect(plan.clearRevs).toEqual(['1-conf']);
  });

  it('handles no conflict branches (already resolved)', () => {
    const def: RevEntry = { _rev: '1-def', updatedAt: '2026-06-01T00:00:00Z' };
    const plan = planConflictResolution(def, []);
    expect(plan.winner).toBe(def);
    expect(plan.losers).toHaveLength(0);
    expect(plan.clearRevs).toHaveLength(0);
  });
});
