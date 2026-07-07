/**
 * Unit tests for $lib/overview.ts – pure overview/dashboard helpers.
 */

import { describe, it, expect } from 'vitest';
import {
  entryTimeLabel,
  computeNextUp,
  summarizeReservations,
  nextFlightIndex
} from './overview';
import type { Reservation, Flight } from '$lib/db';

// ---------------------------------------------------------------------------
// Helpers to build minimal timeline fixtures
// ---------------------------------------------------------------------------

function makeTimedEntry(date: string, minutes: number, title: string) {
  return {
    kind: 'item' as const,
    minutes,
    item: { title, location: null, allDay: false } as any
  };
}

function makeAllDayEntry(title: string) {
  return { title, location: null, allDay: true } as any;
}

function makeDayTimeline(date: string, timed: any[] = [], allDay: any[] = []) {
  return { date, timed, allDay } as any;
}

function makeReservation(id: string, kind: string, start: string | null): Reservation {
  return {
    _id: id,
    type: 'reservation',
    kind: kind as any,
    name: `Res ${id}`,
    start: start as any,
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    schemaVersion: 1,
    deletedAt: null,
    details: {},
    attachmentIds: [],
    order: 0,
    costType: 'total'
  } as Reservation;
}

function makeFlight(id: string, departLocal: string): Flight {
  return {
    _id: id,
    type: 'flight',
    segments: [{ departLocal, airline: 'Test' } as any],
    createdAt: '2026-01-01T00:00:00Z',
    updatedAt: '2026-01-01T00:00:00Z',
    schemaVersion: 1,
    deletedAt: null,
    attachmentIds: [],
    order: 0,
    costType: 'total'
  } as Flight;
}

// ---------------------------------------------------------------------------

describe('entryTimeLabel', () => {
  it('formats minutes correctly', () => {
    expect(entryTimeLabel(8 * 60 + 40)).toBe('08:40');
  });

  it('returns empty string for null', () => {
    expect(entryTimeLabel(null)).toBe('');
  });

  it('pads single-digit hours and minutes', () => {
    expect(entryTimeLabel(9 * 60 + 5)).toBe('09:05');
  });
});

describe('computeNextUp', () => {
  const now = new Date('2026-06-05T09:00:00').getTime();

  it('returns null for empty days', () => {
    expect(computeNextUp([], now)).toBeNull();
  });

  it('returns null when all events are in the past', () => {
    const days = [
      makeDayTimeline('2026-06-04', [makeTimedEntry('2026-06-04', 8 * 60, 'Breakfast')])
    ];
    expect(computeNextUp(days, now)).toBeNull();
  });

  it('returns the nearest upcoming timed event', () => {
    const days = [
      makeDayTimeline('2026-06-05', [
        makeTimedEntry('2026-06-05', 10 * 60, 'Lunch'),  // 10:00 today
        makeTimedEntry('2026-06-05', 14 * 60, 'Tour')   // 14:00 today
      ])
    ];
    const result = computeNextUp(days, now);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Lunch');
  });

  it('includes all-day items', () => {
    const days = [
      makeDayTimeline('2026-06-06', [], [makeAllDayEntry('Free day')])
    ];
    const result = computeNextUp(days, now);
    expect(result).not.toBeNull();
    expect(result!.title).toBe('Free day');
  });
});

describe('summarizeReservations', () => {
  const now = new Date('2026-06-05T09:00:00').getTime();

  it('counts by kind', () => {
    const list = [
      makeReservation('1', 'lodging', '2026-06-10T14:00:00'),
      makeReservation('2', 'lodging', '2026-06-15T14:00:00'),
      makeReservation('3', 'car', '2026-06-12T09:00:00')
    ];
    const summary = summarizeReservations(list, now);
    expect(summary.total).toBe(3);
    const lodging = summary.counts.find((c) => c.kind === 'lodging');
    expect(lodging?.count).toBe(2);
  });

  it('picks the nearest future check-in', () => {
    const list = [
      makeReservation('1', 'lodging', '2026-06-10T14:00:00'),
      makeReservation('2', 'lodging', '2026-06-08T14:00:00') // nearest
    ];
    const summary = summarizeReservations(list, now);
    expect(summary.nextCheckIn?.reservation._id).toBe('2');
  });

  it('ignores past reservations for nextCheckIn', () => {
    const list = [makeReservation('1', 'lodging', '2026-06-01T14:00:00')];
    const summary = summarizeReservations(list, now);
    expect(summary.nextCheckIn).toBeNull();
  });

  it('handles empty list', () => {
    const summary = summarizeReservations([], now);
    expect(summary.total).toBe(0);
    expect(summary.nextCheckIn).toBeNull();
  });
});

describe('nextFlightIndex', () => {
  const now = new Date('2026-06-05T09:00:00').getTime();

  it('returns index of first future flight', () => {
    const flights = [
      makeFlight('1', '2026-06-04T08:00'),  // past
      makeFlight('2', '2026-06-06T08:00'),  // future
      makeFlight('3', '2026-06-07T08:00')   // future
    ];
    expect(nextFlightIndex(flights, now)).toBe(1);
  });

  it('returns -1 when all flights are past', () => {
    const flights = [makeFlight('1', '2026-06-04T08:00')];
    expect(nextFlightIndex(flights, now)).toBe(-1);
  });

  it('returns -1 for empty list', () => {
    expect(nextFlightIndex([], now)).toBe(-1);
  });

  it('returns 0 when first flight is in the future', () => {
    const flights = [makeFlight('1', '2026-06-06T08:00')];
    expect(nextFlightIndex(flights, now)).toBe(0);
  });
});
