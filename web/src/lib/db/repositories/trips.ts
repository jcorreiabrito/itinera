/**
 * Trips repository – Home (all trips) and the trip shell.
 *
 * Covers: list with derived status/countdown + section bucketing + text search,
 * * get, create, update, archive/unarchive, soft delete/restore, deep-copy
 * * **duplicate** (with optional date shift + child copying), and the cover image
 * * reference. See `docs/06-page-home.md` and `docs/07-page-trip-overview.md`.
 */

import { TRIP_CHILD_TYPES, type TripChildType } from '../constants';
import {
  countdownText,
  dayDelta,
  nightsBetween,
  shiftIsoDate,
  shiftIsoDateTime,
  todayIso,
  tripDateStatus,
  tripDayCount,
  type TripDateStatus
} from '../datetime';
import {
  bulkPut,
  createDoc,
  getDoc,
  listTripDocs,
  nowIso,
  patchDoc,
  rangeScan,
  restoreDoc,
  softDeleteDoc
} from '../base';
import { allTripsRange, bareTripUid, dayId, fullTripid, parseId, tripid as buildTripId } from '../ids';
import type {
  AnyDoc,
  Budget,
  Destination,
  Flight,
  ItineraryItem,
  Reservation,
  Trip
} from '../schemas';

/** Display status including the manual Archived state. */
export type TripStatus = TripDateStatus | 'Archived';

/** Values computed from a trip's dates (never stored). */
export interface TripDerived {
  status: TripStatus;
  nights: number;
  dayCount: number;
  countdown: string;
}

/** A trip with its derived display values attached. */
export type TripWithDerived = Trip & { derived: TripDerived };

/** Fields required/allowed when creating a trip. */
export interface NewTripInput {
  title: string;
  startDate: string;
  endDate: string;
  homeCurrency: string;
  destinations?: Destination[];
  primaryTimezone?: string;
  budget?: Budget;
  notes?: string;
  tags?: string[];
  coverImageAttId?: string | null;
  travelerCount?: number;
}

/** Mutable trip fields. */
export type TripPatch = Partial<Omit<NewTripInput, never>> & {
  archived?: boolean;
};

/** List filter + search options for Home. */
export interface TripListOptions {
  filter?: 'all' | 'upcoming' | 'active' | 'past' | 'archived';
  search?: string;
  /** Reference "today" (ISO date) for status derivation; defaults to the real today. */
  today?: string;
}

/** Trips bucketed into the Home sections. */
export interface TripSections {
  active: TripWithDerived[];
  upcoming: TripWithDerived[];
  past: TripWithDerived[];
  archived: TripWithDerived[];
}

/** Derive a trip's display status from its archived flag + dates. */
export function deriveStatus(trip: Trip, today: string = todayIso()): TripStatus {
  if (trip.archived) return 'Archived';
  if (!trip.startDate || !trip.endDate) return 'Upcoming';
  return tripDateStatus(trip.startDate, trip.endDate, today);
}

function withDerived(trip: Trip, today: string): TripWithDerived {
  const start = trip.startDate ?? today;
  const end = trip.endDate ?? today;
  return {
    ...trip,
    derived: {
      status: deriveStatus(trip, today),
      nights: nightsBetween(start, end),
      dayCount: tripDayCount(start, end),
      countdown: countdownText(start, end, today)
    }
  };
}

function matchesSearch(trip: Trip, query: string): boolean {
  const q = query.toLowerCase();
  if (trip.title?.toLowerCase().includes(q)) return true;
  if (trip.tags?.some((t) => t.toLowerCase().includes(q))) return true;
  return (
    trip.destinations?.some(
      (d) => d.name?.toLowerCase().includes(q) || d.country?.toLowerCase().includes(q)
    ) ?? false
  );
}

/** All trips, derived + filtered + searched, sorted by start date ascending. */
export async function list(opts: TripListOptions = {}): Promise<TripWithDerived[]> {
  const today = opts.today ?? todayIso();
  const docs = await rangeScan<Trip>(allTripsRange());
  let trips = docs.map((t) => withDerived(t, today));

  if (opts.filter && opts.filter !== 'all') {
    const wanted =
      opts.filter === 'upcoming'
        ? 'Upcoming'
        : opts.filter === 'active'
          ? 'Active'
          : opts.filter === 'past'
            ? 'Past'
            : 'Archived';
    trips = trips.filter((t) => t.derived.status === wanted);
  }
  const search = opts.search?.trim();
  if (search) {
    trips = trips.filter((t) => matchesSearch(t, search));
  }
  return trips.sort((a, b) => (a.startDate ?? '').localeCompare(b.startDate ?? ''));
}

/** Trips bucketed and sorted exactly as the Home sections require. */
export async function sections(today: string = todayIso()): Promise<TripSections> {
  const all = await list({ today });
  const byStartAsc = (a: TripWithDerived, b: TripWithDerived) =>
    (a.startDate ?? '').localeCompare(b.startDate ?? '');
  const byEndDesc = (a: TripWithDerived, b: TripWithDerived) =>
    (b.endDate ?? '').localeCompare(a.endDate ?? '');
  const byEndAsc = (a: TripWithDerived, b: TripWithDerived) =>
    (a.endDate ?? '').localeCompare(b.endDate ?? '');

  return {
    active: all.filter((t) => t.derived.status === 'Active').sort(byEndAsc),
    upcoming: all.filter((t) => t.derived.status === 'Upcoming').sort(byStartAsc),
    past: all.filter((t) => t.derived.status === 'Past').sort(byEndDesc),
    archived: all.filter((t) => t.derived.status === 'Archived').sort(byEndDesc)
  };
}

/** Fetch a single trip document. */
export function get(id: string): Promise<Trip | null> {
  return getDoc<Trip>(fullTripid(id));
}

/** Fetch a single trip with derived values. */
export async function getWithDerived(
  id: string,
  today: string = todayIso()
): Promise<TripWithDerived | null> {
  const trip = await get(id);
  return trip ? withDerived(trip, today) : null;
}

/** Create a new trip. Returns the stored document (with `_id`/`_rev`). */
export async function create(input: NewTripInput): Promise<Trip> {
  const _id = buildTripId();
  const doc: Omit<Trip, 'createdAt' | 'updatedAt' | 'deletedAt' | '_schemaVersion' | '_rev'> = {
    _id,
    type: 'trip',
    title: input.title,
    startDate: input.startDate,
    endDate: input.endDate,
    homeCurrency: input.homeCurrency,
    destinations: input.destinations ?? [],
    primaryTimezone: input.primaryTimezone,
    archived: false,
    budget: input.budget,
    notes: input.notes,
    tags: input.tags ?? [],
    coverImageAttId: input.coverImageAttId ?? null,
    travelerCount: input.travelerCount ?? 1
  };
  return createDoc<Trip>(doc);
}

/** Patch trip-level fields. */
export function update(id: string, patch: TripPatch): Promise<Trip> {
  return patchDoc<Trip>(fullTripid(id), patch as Partial<Trip>);
}

/** Archive a trip (manual flag + timestamp). */
export function archive(id: string): Promise<Trip> {
  return patchDoc<Trip>(fullTripid(id), { archived: true, archivedAt: nowIso() });
}

/** Unarchive a trip. */
export function unarchive(id: string): Promise<Trip> {
  return patchDoc<Trip>(fullTripid(id), { archived: false, archivedAt: null });
}

/** Soft-delete a trip and all its child documents (Trash can restore the trip). */
export async function softDelete(id: string): Promise<Trip> {
  const fullId = fullTripid(id);
  const deletedTrip = await softDeleteDoc<Trip>(fullId);
  const now = nowIso();
  for (const type of TRIP_CHILD_TYPES) {
    const docs = await listTripDocs<AnyDoc>(type, fullId);
    if (docs.length) {
      await bulkPut(docs.map((d) => ({ ...d, deletedAt: now, updatedAt: now })));
    }
  }
  return deletedTrip;
}

/** Restore a soft-deleted trip and all its child documents. */
export async function restore(id: string): Promise<Trip> {
  const fullId = fullTripid(id);
  const restoredTrip = await restoreDoc<Trip>(fullId);
  const now = nowIso();
  for (const type of TRIP_CHILD_TYPES) {
    const docs = await listTripDocs<AnyDoc>(type, fullId, { includeDeleted: true });
    const toRestore = docs.filter((d) => d.deletedAt != null);
    if (toRestore.length) {
      await bulkPut(toRestore.map((d) => ({ ...d, deletedAt: null, updatedAt: now })));
    }
  }
  return restoredTrip;
}

/** Set (or clear) the cover image attachment reference. */
export function setCover(id: string, attId: string | null): Promise<Trip> {
  return patchDoc<Trip>(fullTripid(id), { coverImageAttId: attId });
}

/** What to copy when duplicating a trip (mirrors the Home duplicate sheet). */
export interface DuplicateOptions {
  /** Title for the copy (defaults to `<title> (copy)`). */
  title?: string;
  /** Shift all dates so the copy starts on this ISO date. */
  newStartDate?: string;
  /** Copy checklist items (reset to unchecked). Default true. */
  checklist?: boolean;
  /** Copy itinerary structure + day notes (shifted). Default true. */
  itinerary?: boolean;
  /** Copy reservations (shifted). Default false. */
  reservations?: boolean;
  /** Copy flights (shifted). Default false. */
  flights?: boolean;
  /** Copy the budget targets. Default true. */
  budgetTargets?: boolean;
  /** Copy expenses. Default false. */
  expenses?: boolean;
}

const INCLUDE_BY_DEFAULT: Record<TripChildType, boolean> = {
  tripDay: true,
  itineraryItem: true,
  checklistItem: true,
  flight: false,
  reservation: false,
  expense: false,
  attachment: false
};

function shouldInclude(type: TripChildType, opts: DuplicateOptions): boolean {
  switch (type) {
    case 'checklistItem':
      return opts.checklist ?? true;
    case 'itineraryItem':
    case 'tripDay':
      return opts.itinerary ?? true;
    case 'reservation':
      return opts.reservations ?? false;
    case 'flight':
      return opts.flights ?? false;
    case 'expense':
      return opts.expenses ?? false;
    case 'attachment':
      return false;
    default:
      return INCLUDE_BY_DEFAULT[type];
  }
}

/**
 * Deep-copy a trip and selected children under fresh ids.
 *
 * Dates are shifted so the copy starts on `newStartDate` (when given); checklist
 * * items are reset to unchecked; linked ids (itinerary + flight/reservation,
 * * expense + booking) are remapped to the new copies. Attachments are not copied.
 */
export async function duplicate(sourceId: string, opts: DuplicateOptions = {}): Promise<Trip> {
  const source = await get(sourceId);
  if (!source) throw new Error(`duplicate: trip not found: ${sourceId}`);

  const delta =
    opts.newStartDate && source.startDate ? dayDelta(source.startDate, opts.newStartDate) : 0;

  // 1. The new trip.
  const newTrip = await create({
    title: opts.title ?? `${source.title} (copy)`,
    startDate: shiftIsoDate(source.startDate, delta) ?? source.startDate ?? todayIso(),
    endDate: shiftIsoDate(source.endDate, delta) ?? source.endDate ?? todayIso(),
    homeCurrency: source.homeCurrency ?? 'EUR',
    destinations: source.destinations,
    primaryTimezone: source.primaryTimezone,
    budget: (opts.budgetTargets ?? true) ? source.budget : undefined,
    notes: source.notes,
    tags: source.tags
  });
  const newTripid = newTrip._id;

  // 2. Collect children to copy and assign new ids first (so links remap).
  const idMap = new Map<string, string>();
  const sourceChildren: AnyDoc[] = [];
  for (const type of TRIP_CHILD_TYPES) {
    if (!shouldInclude(type, opts)) continue;
    const docs = await listTripDocs<AnyDoc>(type, sourceId);
    for (const doc of docs) {
      const newId = remapChildId(type, doc, newTripid, delta);
      idMap.set(doc._id, newId);
      sourceChildren.push(doc);
    }
  }

  // 3. Transform each child onto the new trip.
  const now = nowIso();
  const copies = sourceChildren.map((doc) => transformChild(doc, idMap, newTripid, delta, now));
  if (copies.length) await bulkPut(copies);

  return newTrip;
}

function remapChildId(type: TripChildType, doc: AnyDoc, newTripid: string, delta: number): string {
  const bare = bareTripUid(newTripid);
  if (type === 'tripDay') {
    const date = shiftIsoDate((doc as { date?: string }).date, delta) ?? '';
    return dayId(newTripid, date);
  }
  const { prefix, id: childUid } = parseId(doc._id);
  return `${prefix}:${bare}:${childUid}`;
}

function transformChild(
  doc: AnyDoc,
  idMap: Map<string, string>,
  newTripid: string,
  delta: number,
  now: string
): AnyDoc {
  const next = { ...doc } as Record<string, unknown>;
  next._id = idMap.get(doc._id)!;
  delete next._rev;
  next.tripid = newTripid;
  next.createdAt = now;
  next.updatedAt = now;
  next.deletedAt = null;

  // Shift any date-ish fields.
  if (typeof next.date === 'string') next.date = shiftIsoDate(next.date, delta);
  if (typeof next.dueDate === 'string') next.dueDate = shiftIsoDate(next.dueDate, delta);
  if (typeof next.start === 'string') next.start = shiftIsoDateTime(next.start, delta);
  if (typeof next.end === 'string') next.end = shiftIsoDateTime(next.end, delta);

  switch (doc.type) {
    case 'checklistItem':
      next.done = false;
      next.doneAt = null;
      break;
    case 'itineraryItem': {
      const item = doc as ItineraryItem;
      if (item.linkedFlightId) next.linkedFlightId = idMap.get(item.linkedFlightId) ?? null;
      if (item.linkedReservationId)
        next.linkedReservationId = idMap.get(item.linkedReservationId) ?? null;
      break;
    }
    case 'flight': {
      const flight = doc as Flight;
      next.segments = (flight.segments ?? []).map((seg) => ({
        ...seg,
        departLocal: shiftIsoDateTime(seg.departLocal, delta) ?? seg.departLocal,
        arriveLocal: shiftIsoDateTime(seg.arriveLocal, delta) ?? seg.arriveLocal
      }));
      next.attachmentIds = [];
      break;
    }
    case 'reservation': {
      (next as { attachmentIds?: string[] }).attachmentIds = [];
      const res = doc as Reservation;
      void res;
      break;
    }
    case 'expense': {
      const linkedId = (doc as { linkedId?: string }).linkedId;
      if (linkedId) next.linkedId = idMap.get(linkedId) ?? null;
      break;
    }
    default:
      break;
  }
  return next as unknown as AnyDoc;
}
