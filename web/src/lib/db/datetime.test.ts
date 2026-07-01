/**
 * Unit tests for $lib/db/datetime.ts
 *
 * The `t()` i18n function is mocked as an identity that returns the key,
 * so tests are independent of locale data.
 */

import { vi, describe, it, expect, beforeEach } from 'vitest';

// Mock i18n before importing datetime (which imports t at module level)
vi.mock('$lib/i18n.svelte', () => ({
  t: (key: string, params?: Record<string, string>) => {
    const template = key.endsWith('_plural') ? `${key}:{n}` : key;
    if (!params) return template;
    return Object.entries(params).reduce((s, [k, v]) => s.replace(`{${k}}`, v), template);
  }
}));

import {
  nightsBetween,
  tripDayCount,
  tripDateStatus,
  eachDateInRange,
  dayDelta,
  shiftIsoDate,
  shiftIsoDateTime,
  humanizeDays,
  legDurationMinutes,
  layoverMinutes,
  arrivalDayOffset,
  formatDuration,
  dateOf,
  minutesOfDay
} from './datetime';

describe('nightsBetween', () => {
  it('returns 0 for same day', () => {
    expect(nightsBetween('2026-06-01', '2026-06-01')).toBe(0);
  });

  it('returns correct night count', () => {
    expect(nightsBetween('2026-06-01', '2026-06-08')).toBe(7);
  });

  it('returns 0 for reversed dates', () => {
    expect(nightsBetween('2026-06-10', '2026-06-01')).toBe(0);
  });

  it('returns 0 for invalid dates', () => {
    expect(nightsBetween('invalid', '2026-06-01')).toBe(0);
  });
});

describe('tripDayCount', () => {
  it('returns nights + 1', () => {
    expect(tripDayCount('2026-06-01', '2026-06-07')).toBe(7);
  });

  it('returns 1 for same day', () => {
    expect(tripDayCount('2026-06-01', '2026-06-01')).toBe(1);
  });
});

describe('tripDateStatus', () => {
  it('returns Upcoming when today is before start', () => {
    expect(tripDateStatus('2026-07-01', '2026-07-10', '2026-06-15')).toBe('Upcoming');
  });

  it('returns Past when today is after end', () => {
    expect(tripDateStatus('2026-06-01', '2026-06-10', '2026-06-15')).toBe('Past');
  });

  it('returns Active when today is within range', () => {
    expect(tripDateStatus('2026-06-01', '2026-06-10', '2026-06-05')).toBe('Active');
  });

  it('returns Active on start date', () => {
    expect(tripDateStatus('2026-06-01', '2026-06-10', '2026-06-01')).toBe('Active');
  });

  it('returns Active on end date', () => {
    expect(tripDateStatus('2026-06-01', '2026-06-10', '2026-06-10')).toBe('Active');
  });
});

describe('eachDateInRange', () => {
  it('returns both endpoints for a 2-day range', () => {
    const result = eachDateInRange('2026-06-01', '2026-06-02');
    expect(result).toEqual(['2026-06-01', '2026-06-02']);
  });

  it('returns single date for same-day range', () => {
    expect(eachDateInRange('2026-06-01', '2026-06-01')).toEqual(['2026-06-01']);
  });

  it('returns empty for reversed range', () => {
    expect(eachDateInRange('2026-06-10', '2026-06-01')).toEqual([]);
  });

  it('returns empty for invalid dates', () => {
    expect(eachDateInRange('bad', '2026-06-01')).toEqual([]);
  });

  it('returns correct 5-day span', () => {
    const result = eachDateInRange('2026-06-01', '2026-06-05');
    expect(result).toHaveLength(5);
    expect(result[0]).toBe('2026-06-01');
    expect(result[4]).toBe('2026-06-05');
  });
});

describe('dayDelta', () => {
  it('returns positive delta', () => {
    expect(dayDelta('2026-06-01', '2026-06-05')).toBe(4);
  });

  it('returns negative delta', () => {
    expect(dayDelta('2026-06-05', '2026-06-01')).toBe(-4);
  });

  it('returns 0 for same date', () => {
    expect(dayDelta('2026-06-01', '2026-06-01')).toBe(0);
  });

  it('returns 0 for invalid dates', () => {
    expect(dayDelta('bad', '2026-06-01')).toBe(0);
  });
});

describe('shiftIsoDate', () => {
  it('shifts forward', () => {
    expect(shiftIsoDate('2026-06-01', 7)).toBe('2026-06-08');
  });

  it('shifts backward', () => {
    expect(shiftIsoDate('2026-06-08', -7)).toBe('2026-06-01');
  });

  it('returns null for null input', () => {
    expect(shiftIsoDate(null, 5)).toBeNull();
  });

  it('returns original string for invalid date', () => {
    expect(shiftIsoDate('not-a-date', 5)).toBe('not-a-date');
  });
});

describe('shiftIsoDateTime', () => {
  it('shifts datetime forward by days', () => {
    const result = shiftIsoDateTime('2026-06-01T10:30:00+02:00', 3);
    expect(result).toContain('2026-06-04');
  });

  it('returns null for null input', () => {
    expect(shiftIsoDateTime(null, 3)).toBeNull();
  });

  it('returns original for invalid datetime', () => {
    expect(shiftIsoDateTime('not-a-date', 3)).toBe('not-a-date');
  });
});

describe('humanizeDays', () => {
  it('returns today key for 0 days', () => {
    expect(humanizeDays(0)).toBe('today');
  });

  it('returns day key for 1 day', () => {
    expect(humanizeDays(1)).toBe('day');
  });

  it('returns days_plural key for 5 days', () => {
    expect(humanizeDays(5)).toContain('5');
  });

  it('rounds weeks for 14 days', () => {
    // 14 days -> 2 weeks
    const result = humanizeDays(14);
    expect(result).toContain('2');
  });

  it('rounds months for 60 days', () => {
    const result = humanizeDays(60);
    expect(result).toContain('2');
  });
});

describe('legDurationMinutes', () => {
  it('computes duration across zones', () => {
    // Depart 10:00 Rome (UTC+2), arrive 12:00 London (UTC+1) = 3 hours = 180 min
    const mins = legDurationMinutes(
      '2026-06-01T10:00',
      'Europe/Rome',
      '2026-06-01T12:00',
      'Europe/London'
    );
    expect(mins).toBe(180);
  });

  it('returns null for invalid timestamps', () => {
    expect(legDurationMinutes('bad', undefined, 'bad', undefined)).toBeNull();
  });
});

describe('layoverMinutes', () => {
  it('computes layover duration', () => {
    const mins = layoverMinutes(
      '2026-06-01T10:00',
      'Europe/London',
      '2026-06-01T12:30',
      'Europe/London'
    );
    expect(mins).toBe(150);
  });

  it('returns null for invalid timestamps', () => {
    expect(layoverMinutes('bad', undefined, 'bad', undefined)).toBeNull();
  });
});

describe('arrivalDayOffset', () => {
  it('returns 0 for same-day arrival', () => {
    expect(arrivalDayOffset('2026-06-01T22:00', '2026-06-01T23:59')).toBe(0);
  });

  it('returns 1 for next-day arrival', () => {
    expect(arrivalDayOffset('2026-06-01T23:00', '2026-06-02T01:00')).toBe(1);
  });
});

describe('formatDuration', () => {
  it('formats hours and minutes', () => {
    expect(formatDuration(175)).toBe('2h 55m');
  });

  it('formats minutes only', () => {
    expect(formatDuration(45)).toBe('45m');
  });

  it('formats hours only', () => {
    expect(formatDuration(180)).toBe('3h');
  });

  it('returns empty string for null', () => {
    expect(formatDuration(null)).toBe('');
  });

  it('handles negative durations', () => {
    expect(formatDuration(-90)).toBe('-1h 30m');
  });
});

describe('dateOf', () => {
  it('returns date portion of ISO datetime', () => {
    expect(dateOf('2026-06-01T10:30:00+00:00')).toBe('2026-06-01');
  });

  it('returns null for null input', () => {
    expect(dateOf(null)).toBeNull();
  });

  it('returns null for empty string', () => {
    expect(dateOf('')).toBeNull();
  });
});

describe('minutesOfDay', () => {
  it('parses HH:mm', () => {
    expect(minutesOfDay('08:30')).toBe(510);
  });

  it('parses full ISO datetime', () => {
    expect(minutesOfDay('2026-06-01T14:45:00')).toBe(14 * 60 + 45);
  });

  it('returns null for null', () => {
    expect(minutesOfDay(null)).toBeNull();
  });

  it('returns null for non-time string', () => {
    expect(minutesOfDay('not-a-time')).toBeNull();
  });
});
