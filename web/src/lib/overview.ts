/**
 * Pure helpers for the Overview dashboard.
 *
 * They reduce the merged itinerary timeline and the booking lists into the small
 * summaries the read-only widgets render (Next up, Reservations counts + next
 * check-in, the next flight). Kept free of rendering so they are easy to test.
 */

import type { Flight, Reservation } from '$lib/db';
import type { itinerary } from '$lib/db';

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function isoFor(date: string, minutes: number | null): string {
  if (minutes == null) return date;
  return `${date}T${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

function whenMsFor(date: string, minutes: number | null): number {
  const ms = Date.parse(isoFor(date, minutes));
  return Number.isNaN(ms) ? Number.POSITIVE_INFINITY : ms;
}

export type NextUpKind = 'item' | 'flight' | 'reservation';

export interface NextUpEntry {
  kind: NextUpKind;
  title: string;
  location: string | null;
  /** ISO datetime (or bare date for all-day) for relative/absolute display. */
  whenIso: string;
  date: string;
}

function describe(entry: itinerary.TimelineEntry): {
  kind: NextUpKind;
  title: string;
  location: string | null;
} {
  if (entry.kind === 'flight' && entry.flight) {
    const seg = entry.flight.segment;
    const to = seg.to?.city ?? seg.to?.code;
    return {
      kind: 'flight',
      title: to ? `Flight to ${to}` : 'Flight',
      location: seg.from?.city ?? seg.from?.code ?? null
    };
  }

  if (entry.kind === 'reservation' && entry.reservation) {
    const res = entry.reservation.reservation;
    return {
      kind: 'reservation',
      title: res.name ?? 'Reservation',
      location: res.location?.name ?? null
    };
  }

  const item = entry.item;
  return { kind: 'item', title: item?.title ?? 'Untitled', location: item?.location?.name ?? null };
}

/** Public form of `@link describe` for the Today's-plan widget. */
export function describeTimelineEntry(entry: itinerary.TimelineEntry): {
  kind: NextUpKind;
  title: string;
  location: string | null;
} {
  return describe(entry);
}

/** `HH:mm` label for a timeline entry's minutes-of-day (empty when untimed). */
export function entryTimeLabel(minutes: number | null): string {
  if (minutes == null) return '';
  return `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
}

interface Candidate extends NextUpEntry {
  whenMs: number;
}

/** The single nearest upcoming event across the merged timeline, or `null`. */
export function computeNextUp(days: itinerary.DayTimeline[], nowMs: number): NextUpEntry | null {
  const candidates: Candidate[] = [];

  for (const day of days) {
    if (!day.date) continue;
    const date = day.date;

    for (const entry of day.timed) {
      if (entry.minutes == null) continue;
      const d = describe(entry);
      candidates.push({
        ...d,
        date,
        whenIso: isoFor(date, entry.minutes),
        whenMs: whenMsFor(date, entry.minutes)
      });
    }

    for (const item of day.allDay) {
      candidates.push({
        kind: 'item',
        title: item.title ?? 'Untitled',
        location: item.location?.name ?? null,
        date,
        whenIso: date,
        whenMs: whenMsFor(date, null)
      });
    }
  }

  const next = candidates.filter((c) => c.whenMs >= nowMs).sort((a, b) => a.whenMs - b.whenMs)[0];

  if (!next) return null;
  const { whenMs: _ignored, ...entry } = next;
  return entry;
}

export interface ReservationSummary {
  total: number;
  counts: { kind: string; count: number }[];
  nextCheckIn: { reservation: Reservation; whenIso: string } | null;
}

/** Counts by kind + the nearest future check-in (by `start`). */
export function summarizeReservations(list: Reservation[], nowMs: number): ReservationSummary {
  const counts = new Map<string, number>();
  let nextCheckIn: { reservation: Reservation; whenIso: string } | null = null;
  let bestMs = Number.POSITIVE_INFINITY;

  for (const res of list) {
    const kind = res.kind ?? 'other';
    counts.set(kind, (counts.get(kind) ?? 0) + 1);

    if (res.start) {
      const ms = Date.parse(res.start);
      if (!Number.isNaN(ms) && ms >= nowMs && ms < bestMs) {
        bestMs = ms;
        nextCheckIn = { reservation: res, whenIso: res.start };
      }
    }
  }

  return {
    total: list.length,
    counts: [...counts.entries()]
      .map(([kind, count]) => ({ kind, count }))
      .sort((a, b) => b.count - a.count),
    nextCheckIn
  };
}

/** Index of the next future flight (list assumed sorted by first departure). */
export function nextFlightIndex(flights: Flight[], nowMs: number): number {
  for (let i = 0; i < flights.length; i++) {
    const depart = flights[i].segments?.[0]?.departLocal;
    if (depart) {
      const ms = Date.parse(depart);
      if (!Number.isNaN(ms) && ms >= nowMs) return i;
    }
  }
  return -1;
}
