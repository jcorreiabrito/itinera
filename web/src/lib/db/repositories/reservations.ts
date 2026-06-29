/**
 * Reservations repository – lodging, car, restaurant, activity, transport, other
 * (`docs/11-page-reservations.md`).
 *
 * Common fields + a kind-specific `details` object. Setting a `cost` upserts a
 * linked `expense` with the category mapped by kind (lodging=lodging,
 * car=transport, transport=transport, restaurant=food, activity=activities, other=other),
 * so the budget counts each booking once. Dated reservations expose a placement
 * for the itinerary timeline (check-in / check-out / staying / point).
 */

import { RESERVATION_EXPENSE_CATEGORY } from '../constants';
import { dateOf, minutesOfDay, nightsBetween } from '../datetime';
import { createDoc, getDoc, listTripDocs, patchDoc, restoreDoc, softDeleteDoc } from './base';
import { fullTripid, parseId, reservationId } from './ids';
import type {
  Attachment,
  ExpenseCategory,
  GeoLocation,
  Reservation,
  ReservationContact,
  ReservationDetails,
  ReservationKind
} from '../schemas';
import * as attachments from './attachments';
import { removeLinkedExpense, upsertLinkedExpense } from './expenses';

/** Fields accepted when creating/updating a reservation. */
export interface NewReservationInput {
  kind: ReservationKind;
  name: string;
  start?: string | null;
  end?: string | null;
  location?: GeoLocation;
  confirmation?: string;
  cost?: number | null;
  currency?: string;
  contact?: ReservationContact;
  details?: ReservationDetails;
  notes?: string;
  attachmentIds?: string[];
  order?: number;
}

/** Derived nights for a lodging reservation (0 when dates are missing). */
export function lodgingNights(res: Reservation): number {
  if (res.kind !== 'lodging' || !res.start || !res.end) return 0;
  const start = dateOf(res.start);
  const end = dateOf(res.end);
  return start && end ? nightsBetween(start, end) : 0;
}

/** Fold derived fields (lodging nights) into `details` before persisting. */
function withDerivedDetails(input: NewReservationInput): Record<string, unknown> {
  const details = { ...(input.details ?? {}) } as Record<string, unknown>;
  if (input.kind === 'lodging' && input.start && input.end) {
    const start = dateOf(input.start);
    const end = dateOf(input.end);
    if (start && end) details.nights = nightsBetween(start, end);
  }
  return details;
}

/** All reservations for a trip, sorted by start datetime. */
export async function byTrip(tripid: string): Promise<Reservation[]> {
  const list = await listTripDocs<Reservation>('reservation', tripid);
  return list.sort((a, b) => (a.start ?? '').localeCompare(b.start ?? ''));
}

/** Fetch one reservation. */
export function get(id: string): Promise<Reservation | null> {
  return getDoc<Reservation>(id);
}

/** Expense category for a reservation kind. */
export function expenseCategoryForKind(kind: ReservationKind): ExpenseCategory {
  return (RESERVATION_EXPENSE_CATEGORY[kind] ?? 'other') as ExpenseCategory;
}

async function syncCost(res: Reservation): Promise<void> {
  const tripid = res.tripid;
  if (!tripid || !res.kind) return;
  if (res.cost != null) {
    await upsertLinkedExpense({
      tripid,
      linkedType: 'reservation',
      linkedId: res._id,
      category: expenseCategoryForKind(res.kind),
      amount: res.cost,
      currency: res.currency,
      description: res.name ?? 'Reservation',
      date: dateOf(res.start)
    });
  } else {
    await removeLinkedExpense(tripid, 'reservation', res._id);
  }
}

/** Create a reservation; upserts a linked expense when a cost is given. */
export async function create(tripid: string, input: NewReservationInput): Promise<Reservation> {
  const _id = reservationId(tripid);
  const res = await createDoc<Reservation>({
    _id,
    type: 'reservation',
    tripid: fullTripid(tripid),
    kind: input.kind,
    name: input.name,
    start: input.start ?? null,
    end: input.end ?? null,
    location: input.location,
    confirmation: input.confirmation,
    cost: input.cost ?? undefined,
    currency: input.currency,
    contact: input.contact,
    details: withDerivedDetails(input),
    notes: input.notes,
    attachmentIds: input.attachmentIds ?? [],
    order: input.order ?? 0
  });
  await syncCost(res);
  return res;
}

/** Patch a reservation; recomputes lodging nights and re-syncs the linked expense. */
export async function update(
  id: string,
  patch: Partial<NewReservationInput>
): Promise<Reservation> {
  const next: Partial<Reservation> = { ...(patch as Partial<Reservation>) };
  // Recompute derived details if anything affecting them changed.
  if (patch.details || patch.start || patch.end || patch.kind) {
    const current = await get(id);
    if (current) {
      next.details = withDerivedDetails({
        kind: patch.kind ?? current.kind ?? 'other',
        name: patch.name ?? current.name ?? '',
        start: patch.start ?? current.start,
        end: patch.end ?? current.end,
        details: patch.details ?? (current.details as ReservationDetails)
      });
    }
  }
  const res = await patchDoc<Reservation>(id, next);
  await syncCost(res);
  return res;
}

/** Soft-delete a reservation and its linked expense. */
export async function softDelete(id: string): Promise<Reservation> {
  const res = await softDeleteDoc<Reservation>(id);
  if (res.tripid) await removeLinkedExpense(res.tripid, 'reservation', id);
  return res;
}

/** Restore a soft-deleted reservation. */
export async function restore(id: string): Promise<Reservation> {
  const res = await restoreDoc<Reservation>(id);
  await syncCost(res);
  return res;
}

/** Reorder reservations by assigning sequential `order` values. */
export async function reorder(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, index) => patchDoc<Reservation>(id, { order: index })));
}

/** How a reservation sits on a given itinerary day. */
export type ReservationPlacementKind = 'checkIn' | 'checkOut' | 'staying' | 'point';

/** A reservation placed onto a specific itinerary day. */
export interface ReservationPlacement {
  reservation: Reservation;
  placement: ReservationPlacementKind;
  /** Local time-of-day for ordering on the timeline (`HH:mm`-ish), if any. */
  time: string | null;
}

/**
 * Reservations that appear on a given itinerary date. Lodging spans surface as
 * * checkIn on the start day, * checkOut on the end day, and * staying* in
 * between; other kinds surface as a single `point` on their start date.
 */
export async function datedForItinerary(
  tripid: string,
  date: string
): Promise<ReservationPlacement[]> {
  const list = await byTrip(tripid);
  return placementsForDate(list, date);
}

/** Pure placement computation over an in-memory reservation list (for the merge). */
export function placementsForDate(
  list: readonly Reservation[],
  date: string
): ReservationPlacement[] {
  const placements: ReservationPlacement[] = [];

  for (const res of list) {
    const startDate = dateOf(res.start);
    const endDate = dateOf(res.end);

    if (res.kind === 'lodging' && startDate && endDate) {
      if (date === startDate) {
        placements.push({ reservation: res, placement: 'checkIn', time: res.start ?? null });
      } else if (date === endDate) {
        placements.push({ reservation: res, placement: 'checkOut', time: res.end ?? null });
      } else if (date > startDate && date < endDate) {
        placements.push({ reservation: res, placement: 'staying', time: null });
      }
    } else if (startDate === date) {
      placements.push({ reservation: res, placement: 'point', time: res.start ?? null });
    }
  }

  return placements.sort((a, b) => (minutesOfDay(a.time) ?? 1e9) - (minutesOfDay(b.time) ?? 1e9));
}

/** List the voucher / confirmation attachments for a reservation. */
export function listAttachments(reservationId: string): Promise<Attachment[]> {
  const tripid = parseId(reservationId).tripid;
  if (!tripid) return Promise.resolve([]);
  return attachments.forOwner(tripid, reservationId);
}

/** Attach an attachment id to a reservation's `attachmentIds`. */
export function linkAttachment(reservationId: string, attId: string): Promise<Reservation> {
  return patchDoc<Reservation>(reservationId, (doc) => ({
    attachmentIds: [...new Set([...(doc.attachmentIds ?? []), attId])]
  }));
}

/** Remove an attachment id from a reservation's `attachmentIds`. */
export function unlinkAttachment(reservationId: string, attId: string): Promise<Reservation> {
  return patchDoc<Reservation>(reservationId, (doc) => ({
    attachmentIds: (doc.attachmentIds ?? []).filter((id) => id !== attId)
  }));
}
