/**
 * Flights repository – multi-leg bookings (`docs/10-page-flights.md`).
 *
 * A flight is one booking with one or more segments, edited as a unit. Times are
 * stored local – timezone per endpoint, so durations / layovers / "+1 day"
 * crossings compute correctly across zones (via `datetime.ts`). Setting a `cost`
 * upserts a single linked `expense` (`category = transport`) so the budget never
 * double-counts; clearing it removes that expense.
 */

import { FLIGHT_EXPENSE_CATEGORY } from '../constants';
import {
  arrivalDayOffset,
  dateOf,
  formatDuration,
  layoverMinutes,
  legDurationMinutes,
  minutesOfDay
} from '../datetime';
import { createDoc, getDoc, listTripDocs, patchDoc, restoreDoc, softDeleteDoc } from '../base';
import { flightId, fullTripid, parseId } from '../ids';
import type { Attachment, ExpenseCategory, Flight, FlightSegment } from '../schemas';
import * as attachments from './attachments';
import { removeLinkedExpense, upsertLinkedExpense } from './expenses';

/** Fields accepted when creating/replacing a flight booking. */
export interface NewFlightInput {
  segments: FlightSegment[];
  bookingRef?: string;
  checkInUrl?: string;
  cost?: number | null;
  currency?: string;
  notes?: string;
  attachmentIds?: string[];
  order?: number;
}

/** Compact route string "BCN → FCO" from first origin to last destination. */
export function route(flight: Flight): string {
  const segs = flight.segments ?? [];
  if (segs.length === 0) return '';
  const from = segs[0].from?.code ?? segs[0].from?.city ?? '';
  const to = segs[segs.length - 1].to?.code ?? segs[segs.length - 1].to?.city ?? '';
  return `${from} → ${to}`;
}

function firstDepartLocal(flight: Flight): string | undefined {
  return flight.segments?.[0]?.departLocal;
}

/** Sort key: the booking's first departure (local), for chronological listing. */
function departKey(flight: Flight): string {
  return firstDepartLocal(flight) ?? '';
}

/** All flights for a trip, sorted by first departure. */
export async function byTrip(tripid: string): Promise<Flight[]> {
  const flights = await listTripDocs<Flight>('flight', tripid);
  return flights.sort((a, b) => departKey(a).localeCompare(departKey(b)));
}

/** Fetch one flight. */
export function get(id: string): Promise<Flight | null> {
  return getDoc<Flight>(id);
}

/** Keep the linked transport expense in step with the flight's cost. */
async function syncCost(flight: Flight): Promise<void> {
  const tripid = flight.tripid;
  if (!tripid) return;
  if (flight.cost != null) {
    await upsertLinkedExpense({
      tripid,
      linkedType: 'flight',
      linkedId: flight._id,
      category: FLIGHT_EXPENSE_CATEGORY as ExpenseCategory,
      amount: flight.cost,
      currency: flight.currency,
      description: `Flight ${route(flight)}`.trim(),
      date: dateOf(firstDepartLocal(flight))
    });
  } else {
    await removeLinkedExpense(tripid, 'flight', flight._id);
  }
}

/** Create a flight booking; upserts a linked expense when a cost is given. */
export async function create(tripid: string, input: NewFlightInput): Promise<Flight> {
  const _id = flightId(tripid);
  const flight = await createDoc<Flight>({
    _id,
    type: 'flight',
    tripid: fullTripid(tripid),
    segments: input.segments,
    bookingRef: input.bookingRef,
    checkInUrl: input.checkInUrl,
    cost: input.cost ?? undefined,
    currency: input.currency,
    notes: input.notes,
    attachmentIds: input.attachmentIds ?? [],
    order: input.order ?? 0
  });
  await syncCost(flight);
  return flight;
}

/** Patch a flight (segments edited as a unit); re-syncs the linked expense. */
export async function update(id: string, patch: Partial<NewFlightInput>): Promise<Flight> {
  const flight = await patchDoc<Flight>(id, patch as Partial<Flight>);
  await syncCost(flight);
  return flight;
}

/** Soft-delete a flight and its linked expense. */
export async function softDelete(id: string): Promise<Flight> {
  const flight = await softDeleteDoc<Flight>(id);
  if (flight.tripid) await removeLinkedExpense(flight.tripid, 'flight', id);
  return flight;
}

/** Restore a soft-deleted flight (re-creates its linked expense if it had a cost). */
export async function restore(id: string): Promise<Flight> {
  const flight = await restoreDoc<Flight>(id);
  await syncCost(flight);
  return flight;
}

/** Reorder flights within a trip by assigning sequential `order` values. */
export async function reorder(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, index) => patchDoc<Flight>(id, { order: index })));
}

/** A segment with its time-zone-aware computed values. */
export interface ComputedSegment extends FlightSegment {
  durationMinutes: number | null;
  durationText: string;
  /** Calendar days the arrival is after departure (1 = "+1"). */
  arrivalDayOffset: number;
}

/** A layover between two consecutive segments. */
export interface ComputedLayover {
  minutes: number | null;
  text: string;
  /** True when the connection changes airport (codes differ). */
  changeAirport: boolean;
  /** True when the layover is implausibly short (< 45m) or negative. */
  tight: boolean;
}

/** A flight with all derived display values. */
export interface ComputedFlight {
  segments: ComputedSegment[];
  layovers: ComputedLayover[];
  totalDurationMinutes: number | null;
  route: string;
  stops: number;
}

/** Derive durations, layovers, "+1 day" markers and the route label. */
export function computeFlight(flight: Flight): ComputedFlight {
  const segs = flight.segments ?? [];
  const segments: ComputedSegment[] = segs.map((seg) => {
    const durationMinutes = legDurationMinutes(
      seg.departLocal ?? '',
      seg.from?.tz,
      seg.arriveLocal ?? '',
      seg.to?.tz
    );
    return {
      ...seg,
      durationMinutes,
      durationText: formatDuration(durationMinutes),
      arrivalDayOffset: arrivalDayOffset(seg.departLocal ?? '', seg.arriveLocal ?? '')
    };
  });

  const layovers: ComputedLayover[] = [];
  for (let i = 0; i < segs.length - 1; i++) {
    const prev = segs[i];
    const next = segs[i + 1];
    const minutes = layoverMinutes(
      prev.arriveLocal ?? '',
      prev.to?.tz,
      next.departLocal ?? '',
      next.from?.tz
    );
    layovers.push({
      minutes,
      text: formatDuration(minutes),
      changeAirport: (prev.to?.code ?? '') !== (next.from?.code ?? ''),
      tight: minutes != null && minutes < 45
    });
  }

  const total = segments.reduce<number | null>((sum, s) => {
    if (s.durationMinutes == null) return sum;
    return (sum ?? 0) + s.durationMinutes;
  }, null);

  return {
    segments,
    layovers,
    totalDurationMinutes: total,
    route: route(flight),
    stops: Math.max(0, segs.length - 1)
  };
}

/** List the boarding-pass / e-ticket attachments for a flight. */
export function listAttachments(flightId: string): Promise<Attachment[]> {
  const tripid = parseId(flightId).tripid;
  if (!tripid) return Promise.resolve([]);
  return attachments.forOwner(tripid, flightId);
}

/** Attach a (already-created) attachment id to a flight's `attachmentIds`. */
export async function linkAttachment(flightId: string, attId: string): Promise<Flight> {
  return patchDoc<Flight>(flightId, (doc) => ({
    attachmentIds: [...new Set([...(doc.attachmentIds ?? []), attId])]
  }));
}

/** Remove an attachment id from a flight's `attachmentIds`. */
export async function unlinkAttachment(flightId: string, attId: string): Promise<Flight> {
  return patchDoc<Flight>(flightId, (doc) => ({
    attachmentIds: (doc.attachmentIds ?? []).filter((id) => id !== attId)
  }));
}

/** Stable time-of-day sort for a flight segment (used by the itinerary merge). */
export function segmentMinutesOfDay(seg: FlightSegment): number | null {
  return minutesOfDay(seg.departLocal);
}
