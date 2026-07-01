/**
 * Unit tests for $lib/db/money.ts – pure money math helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  convertToHome,
  expenseAmounts,
  sumExpenses,
  rollupByDay,
  rollupByCategory,
  budgetRemaining,
  budgetUsedFraction,
  roundMoney
} from './money';

describe('convertToHome', () => {
  it('passes through same-currency amounts unchanged', () => {
    expect(convertToHome(100, 'EUR', 'EUR')).toBe(100);
  });

  it('returns null for null amount', () => {
    expect(convertToHome(null, 'EUR', 'EUR')).toBeNull();
  });

  it('multiplies by fxRate for foreign currency', () => {
    expect(convertToHome(100, 'USD', 'EUR', 0.9)).toBeCloseTo(90);
  });

  it('returns null when foreign currency has no fxRate', () => {
    expect(convertToHome(100, 'USD', 'EUR', null)).toBeNull();
  });

  it('returns null when currency is null (treated as same-currency)', () => {
    // null currency => treated as same-currency, amount passes through
    expect(convertToHome(50, null, 'EUR')).toBe(50);
  });
});

describe('expenseAmounts', () => {
  it('computes same-currency expense correctly', () => {
    const result = expenseAmounts(
      { amountEstimate: 100, amountActual: 80, currency: 'EUR' },
      'EUR'
    );
    expect(result.estimate).toBe(100);
    expect(result.actual).toBe(80);
    expect(result.spent).toBe(80); // actual ?? estimate
    expect(result.missingRate).toBe(false);
  });

  it('sets missingRate when foreign currency has no fxRate', () => {
    const result = expenseAmounts(
      { amountEstimate: 100, currency: 'USD', fxRate: null },
      'EUR'
    );
    expect(result.missingRate).toBe(true);
    expect(result.estimate).toBeNull();
  });

  it('spent falls back to estimate when actual is null', () => {
    const result = expenseAmounts({ amountEstimate: 50, currency: 'EUR' }, 'EUR');
    expect(result.spent).toBe(50);
  });
});

describe('sumExpenses', () => {
  const EUR = 'EUR';

  it('sums estimate and actual correctly', () => {
    const exps = [
      { amountEstimate: 100, amountActual: 80, currency: EUR },
      { amountEstimate: 50, amountActual: 40, currency: EUR }
    ];
    const totals = sumExpenses(exps, EUR);
    expect(totals.estimate).toBe(150);
    expect(totals.actual).toBe(120);
  });

  it('counts unpaid amounts separately', () => {
    const exps = [
      { amountActual: 100, currency: EUR, paid: false },
      { amountActual: 50, currency: EUR, paid: true }
    ];
    const totals = sumExpenses(exps, EUR);
    expect(totals.unpaid).toBe(100);
    expect(totals.spent).toBe(150);
  });

  it('tracks missing rate count', () => {
    const exps = [
      { amountEstimate: 100, currency: 'USD', fxRate: null },
      { amountEstimate: 50, currency: EUR }
    ];
    const totals = sumExpenses(exps, EUR);
    expect(totals.missingRateCount).toBe(1);
  });

  it('applies per_person multiplier', () => {
    const exps = [
      { amountActual: 100, currency: EUR, paid: false, costType: 'per_person' as const }
    ];
    const totals = sumExpenses(exps, EUR, 3);
    expect(totals.spent).toBe(300);
  });

  it('returns zero totals for empty list', () => {
    const totals = sumExpenses([], EUR);
    expect(totals.estimate).toBe(0);
    expect(totals.actual).toBe(0);
    expect(totals.missingRateCount).toBe(0);
  });
});

describe('rollupByDay', () => {
  it('groups expenses by date', () => {
    const exps = [
      { amountActual: 10, currency: 'EUR', date: '2026-06-01' },
      { amountActual: 20, currency: 'EUR', date: '2026-06-01' },
      { amountActual: 30, currency: 'EUR', date: '2026-06-02' }
    ];
    const rollup = rollupByDay(exps, 'EUR');
    expect(rollup.days).toHaveLength(2);
    const june1 = rollup.days.find((d) => d.date === '2026-06-01')!;
    expect(june1.totals.actual).toBe(30);
  });

  it('places undated expenses in the undated bucket', () => {
    const exps = [{ amountActual: 99, currency: 'EUR', date: null }];
    const rollup = rollupByDay(exps, 'EUR');
    expect(rollup.days).toHaveLength(0);
    expect(rollup.undated.actual).toBe(99);
  });

  it('returns days in ascending date order', () => {
    const exps = [
      { amountActual: 1, currency: 'EUR', date: '2026-06-03' },
      { amountActual: 1, currency: 'EUR', date: '2026-06-01' }
    ];
    const rollup = rollupByDay(exps, 'EUR');
    expect(rollup.days[0].date).toBe('2026-06-01');
    expect(rollup.days[1].date).toBe('2026-06-03');
  });
});

describe('rollupByCategory', () => {
  it('groups by category', () => {
    const exps = [
      { amountActual: 50, currency: 'EUR', category: 'food' },
      { amountActual: 30, currency: 'EUR', category: 'food' },
      { amountActual: 100, currency: 'EUR', category: 'transport' }
    ];
    const result = rollupByCategory(exps, 'EUR');
    expect(result['food'].actual).toBe(80);
    expect(result['transport'].actual).toBe(100);
  });

  it('uses other for missing category', () => {
    const exps = [{ amountActual: 10, currency: 'EUR' }];
    const result = rollupByCategory(exps, 'EUR');
    expect(result['other']).toBeDefined();
  });
});

describe('budgetRemaining', () => {
  it('returns total - spent', () => {
    expect(budgetRemaining(200, 500)).toBe(300);
  });

  it('returns negative when over budget', () => {
    expect(budgetRemaining(600, 500)).toBe(-100);
  });

  it('returns null when no budget', () => {
    expect(budgetRemaining(200, null)).toBeNull();
  });
});

describe('budgetUsedFraction', () => {
  it('returns correct fraction', () => {
    expect(budgetUsedFraction(250, 500)).toBeCloseTo(0.5);
  });

  it('returns null when no budget', () => {
    expect(budgetUsedFraction(100, null)).toBeNull();
  });

  it('returns null when budget is zero', () => {
    expect(budgetUsedFraction(100, 0)).toBeNull();
  });
});

describe('roundMoney', () => {
  it('rounds to 2 decimals', () => {
    expect(roundMoney(1.005)).toBe(1.01);
  });

  it('leaves already-rounded values unchanged', () => {
    expect(roundMoney(10.5)).toBe(10.5);
  });
});
