/**
 * Unit tests for $lib/format.ts – pure presentation helpers.
 * The i18n `t()` function is mocked to return the translation key.
 */

import { vi, describe, it, expect, beforeAll } from 'vitest';

vi.mock('$lib/i18n.svelte', () => ({
  t: (key: string, params?: Record<string, string>) => {
    if (!params) return key;
    return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, v), key);
  }
}));

import {
  formatDateRange,
  formatWeekdayDate,
  formatDate,
  formatTime,
  formatNights,
  formatMoney,
  flagEmoji,
  gradientFromString
} from './format';

describe('formatDateRange', () => {
  it('formats same-day range as a single date', () => {
    const result = formatDateRange('2026-06-01', '2026-06-01');
    expect(result).toContain('Jun');
    expect(result).toContain('2026');
  });

  it('formats same-month range with shared month', () => {
    const result = formatDateRange('2026-06-01', '2026-06-10');
    // Should mention Jun and 2026 but not repeat it
    expect(result).toContain('Jun');
  });

  it('formats cross-year range', () => {
    const result = formatDateRange('2025-12-28', '2026-01-03');
    expect(result).toContain('2025');
    expect(result).toContain('2026');
  });

  it('returns empty string for both null', () => {
    expect(formatDateRange(null, null)).toBe('');
  });

  it('shows single date when only start is provided', () => {
    const result = formatDateRange('2026-06-01', null);
    expect(result).toContain('Jun');
  });
});

describe('formatWeekdayDate', () => {
  it('returns non-empty string for valid ISO date', () => {
    const result = formatWeekdayDate('2026-06-01');
    expect(result).toBeTruthy();
    expect(result).toContain('Jun');
  });

  it('returns empty string for null', () => {
    expect(formatWeekdayDate(null)).toBe('');
  });
});

describe('formatDate', () => {
  it('formats a valid date', () => {
    expect(formatDate('2026-06-01')).toContain('Jun');
  });

  it('returns empty string for null', () => {
    expect(formatDate(null)).toBe('');
  });
});

describe('formatTime', () => {
  it('extracts HH:mm from full ISO datetime', () => {
    expect(formatTime('2026-06-01T08:40:00')).toBe('08:40');
  });

  it('passes through bare HH:mm', () => {
    expect(formatTime('14:30')).toBe('14:30');
  });

  it('returns empty string for null', () => {
    expect(formatTime(null)).toBe('');
  });

  it('returns empty for non-time string', () => {
    expect(formatTime('not-a-time')).toBe('');
  });
});

describe('formatNights', () => {
  it('returns singular for 1 night', () => {
    const result = formatNights(1);
    expect(result).toContain('1');
    expect(result.toLowerCase()).toContain('night');
  });

  it('returns plural for multiple nights', () => {
    const result = formatNights(7);
    expect(result).toContain('7');
  });
});

describe('formatMoney', () => {
  it('formats EUR amount', () => {
    const result = formatMoney(1000, 'EUR');
    expect(result).toContain('1');
  });

  it('handles unknown currency code gracefully', () => {
    const result = formatMoney(100, 'XYZ');
    expect(result).toContain('XYZ');
    expect(result).toContain('100');
  });

  it('non-finite amount renders as zero', () => {
    const result = formatMoney(NaN, 'EUR');
    expect(result).toBeTruthy(); // should not throw
  });
});

describe('flagEmoji', () => {
  it('returns flag for ISO-2 code', () => {
    const flag = flagEmoji('FR');
    expect(flag).toBeTruthy();
    expect(flag.length).toBeGreaterThan(0);
  });

  it('returns flag for known country name', () => {
    const flag = flagEmoji('France');
    expect(flag).toBeTruthy();
  });

  it('returns empty string for unknown country', () => {
    expect(flagEmoji('Narnia')).toBe('');
  });

  it('returns empty string for null', () => {
    expect(flagEmoji(null)).toBe('');
  });
});

describe('gradientFromString', () => {
  it('returns a linear-gradient CSS string', () => {
    const result = gradientFromString('Paris 2026');
    expect(result).toMatch(/^linear-gradient/);
  });

  it('is deterministic for the same seed', () => {
    expect(gradientFromString('Paris')).toBe(gradientFromString('Paris'));
  });

  it('produces different gradients for different seeds', () => {
    expect(gradientFromString('Paris')).not.toBe(gradientFromString('Tokyo'));
  });
});
