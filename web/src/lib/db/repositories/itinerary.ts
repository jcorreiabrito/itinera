/**
 * Itinerary repository – the day-by-day timeline (`docs/08-page-itinerary.md`).
 *
 * Merges, per day: your `itineraryItem`s, dated `flight` segments (at depart
 * + time), dated `reservation`s (check-in / check-out / staying / point), daily
 * `checklistItem`s (with a date), the per-day cost subtotal (`expense`s
 * for that date), and `tripDay` title/notes. Also the Unscheduled bucket
 * (`date = null`), reorder-within-day, move-to-day, and booking links.
 */

import { dateOf, eachDateInRange, minutesOfDay } from '../datetime';
import { createDoc, getDoc, listTripDocs, patchDoc, restoreDoc, softDeleteDoc } from '../base';
import { dayId, fullTripid, itineraryItemId } from '../ids';
import { sumExpenses, type MoneyTotals } from '../money';
import type {
  ChecklistItem,
  Expense,
  ExpenseCategory,
  Flight,
  FlightSegment,
  GeoLocation,
  ItineraryCategory,
  ItineraryItem,
  Reservation,
  Trip,
  TripDay
} from '../schemas';
import * as expenses from './expenses';
import { computeFlight, type ComputedSegment } from './flights';
import { placementsForDate, type ReservationPlacement } from './reservations';

/** Fields accepted when creating/updating an itinerary item. */
export interface NewItineraryItemInput {
  title: string;
  date?: string | null;
  allDay?: boolean;
  startTime?: string;
  endTime?: string;
  category?: ItineraryCategory;
  location?: GeoLocation;
  notes?: string;
  linkedFlightId?: string | null;
  linkedReservationId?: string | null;
  estCost?: number;
  currency?: string;
  order?: number;
}

/** Itinerary item -> expense category, for "Add as expense". */
const ITEM_EXPENSE_CATEGORY: Record<ItineraryCategory, ExpenseCategory> = {
  sightseeing: 'activities',
  food: 'food',
  transport: 'transport',
  lodging: 'lodging',
  activity: 'activities',
  free: 'other',
  other: 'other'
};

/** All itinerary items for a trip. */
export function byTrip(tripid: string): Promise<ItineraryItem[]> {
  return listTripDocs<ItineraryItem>('itineraryItem', tripid);
}

/** Items placed on a specific day. */
export async function byDay(tripid: string, date: string): Promise<ItineraryItem[]> {
  return (await byTrip(tripid)).filter((i) => i.date === date);
}

/** The Unscheduled / Ideas bucket (`date = null`). */
export async function unscheduled(tripid: string): Promise<ItineraryItem[]> {
  return (await byTrip(tripid))
    .filter((i) => i.date == null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
}

/** Fetch one itinerary item. */
export function get(id: string): Promise<ItineraryItem | null> {
  return getDoc<ItineraryItem>(id);
}

/** Create an itinerary item. */
export function create(tripid: string, input: NewItineraryItemInput): Promise<ItineraryItem> {
  return createDoc<ItineraryItem>({
    _id: itineraryItemId(tripid),
    type: 'itineraryItem',
    tripid: fullTripid(tripid),
    title: input.title,
    date: input.date ?? null,
    allDay: input.allDay ?? false,
    startTime: input.startTime,
    endTime: input.endTime,
    category: input.category,
    location: input.location,
    notes: input.notes,
    linkedFlightId: input.linkedFlightId ?? null,
    linkedReservationId: input.linkedReservationId ?? null,
    estCost: input.estCost,
    currency: input.currency,
    order: input.order ?? 0
  });
}

/** Patch an itinerary item. */
export function update(id: string, patch: Partial<NewItineraryItemInput>): Promise<ItineraryItem> {
  return patchDoc<ItineraryItem>(id, patch as Partial<ItineraryItem>);
}

/** Soft-delete an itinerary item. */
export function softDelete(id: string): Promise<ItineraryItem> {
  return softDeleteDoc<ItineraryItem>(id);
}

/** Restore a soft-deleted itinerary item. */
export function restore(id: string): Promise<ItineraryItem> {
  return restoreDoc<ItineraryItem>(id);
}

/** Move an item to a different day (or the Unscheduled bucket when `date` is null). */
export function moveToDay(id: string, date: string | null, order = 0): Promise<ItineraryItem> {
  return patchDoc<ItineraryItem>(id, { date, order });
}

/** Reorder items within a day by assigning sequential `order` values. */
export async function reorderWithinDay(orderedIds: string[]): Promise<void> {
  await Promise.all(orderedIds.map((id, index) => patchDoc<ItineraryItem>(id, { order: index })));
}

/** Link an item to a flight and/or reservation (shown on the timeline). */
export function link(
  id: string,
  links: { flightId?: string | null; reservationId?: string | null }
): Promise<ItineraryItem> {
  const patch: Partial<ItineraryItem> = {};
  if ('flightId' in links) patch.linkedFlightId = links.flightId ?? null;
  if ('reservationId' in links) patch.linkedReservationId = links.reservationId ?? null;
  return patchDoc<ItineraryItem>(id, patch);
}

/**
 * Create or update the linked `expense` from an item's estimated cost
 * ("Add as expense"). Idempotent: keyed on `itineraryItem` `itemId` through
 * `@link expenses.upsertLinkedExpense`, so repeated taps UPDATE the same linked
 * expense (estimate/category/currency/description/date from the item) instead of
 * creating duplicates, and any user-set `amountActual`/`paid`/`fxRate` are
 * preserved. The day subtotal still sums expenses, so there is no double counting.
 */
export async function addExpense(itemId: string): Promise<Expense | null> {
  const item = await get(itemId);
  if (!item || item.estCost == null || !item.tripid) return null;
  return expenses.upsertLinkedExpense({
    tripid: item.tripid,
    linkedType: 'itineraryItem',
    linkedId: itemId,
    category: ITEM_EXPENSE_CATEGORY[item.category ?? 'other'],
    amount: item.estCost,
    currency: item.currency,
    description: item.title ?? 'Activity',
    date: item.date ?? null
  });
}

// --- Day metadata (tripDay) ------------------------------------------------

/** Get the per-day metadata document, if any. */
export function getDay(tripid: string, date: string): Promise<TripDay | null> {
  return getDoc<TripDay>(dayId(tripid, date));
}

/** Upsert a day's title/notes. */
export async function setDayMeta(
  tripid: string,
  date: string,
  meta: { title?: string; notes?: string }
): Promise<TripDay> {
  const _id = dayId(tripid, date);
  const existing = await getDoc<TripDay>(_id);
  if (existing) return patchDoc<TripDay>(_id, meta);
  return createDoc<TripDay>({
    _id,
    type: 'tripDay',
    tripid: fullTripid(tripid),
    date,
    title: meta.title,
    notes: meta.notes
  });
}

// --- Timeline merge -------------------------------------------------------

/** What a timeline entry represents. */
export type TimelineEntryKind = 'item' | 'flight' | 'reservation';

/** A single entry on a day's timeline (an item, a flight leg, or a reservation). */
export interface TimelineEntry {
  kind: TimelineEntryKind;
  /** Minutes-since-midnight for sorting; `null` for untimed-but-ordered entries. */
  minutes: number | null;
  /** Manual order tiebreak. */
  order: number;
  item?: ItineraryItem;
  flight?: {
    flight: Flight;
    segment: FlightSegment;
    computed: ComputedSegment;
    segmentIndex: number;
  };
  reservation?: ReservationPlacement;
}

/** A fully-merged itinerary day. */
export interface DayTimeline {
  date: string | null;
  day: TripDay | null;
  /** Daily to-dos (checklist items with this date). */
  todos: ChecklistItem[];
  /** All-day itinerary items (top lane). */
  allDay: ItineraryItem[];
  /** Untimed-then-timed entries in display order. */
  timed: TimelineEntry[];
  /** Expenses dated this day, in home currency. */
  subtotal: MoneyTotals;
}

interface TripData {
  trip: Trip | null;
  home: string;
  items: ItineraryItem[];
  flights: { flight: Flight; computed: ReturnType<typeof computeFlight> }[];
  reservations: Reservation[];
  expenses: Expense[];
  todos: ChecklistItem[];
  days: TripDay[];
}

async function gather(tripid: string): Promise<TripData> {
  const [trip, items, flights, reservations, exps, todos, days] = await Promise.all([
    getDoc<Trip>(fullTripid(tripid)),
    byTrip(tripid),
    listTripDocs<Flight>('flight', tripid),
    listTripDocs<Reservation>('reservation', tripid),
    listTripDocs<Expense>('expense', tripid),
    listTripDocs<ChecklistItem>('checklistItem', tripid),
    listTripDocs<TripDay>('tripDay', tripid)
  ]);
  return {
    trip,
    home: trip?.homeCurrency ?? 'EUR',
    items,
    flights: flights.map((flight) => ({ flight, computed: computeFlight(flight) })),
    reservations,
    expenses: exps,
    todos: todos.filter((t) => t.date),
    days
  };
}

function buildDay(date: string, data: TripData): DayTimeline {
  const untimed: TimelineEntry[] = [];
  const timed: TimelineEntry[] = [];
  const allDay: ItineraryItem[] = [];

  // Itinerary items.
  for (const item of data.items) {
    if (item.date !== date) continue;
    if (item.allDay) {
      allDay.push(item);
      continue;
    }
    const minutes = minutesOfDay(item.startTime);
    const entry: TimelineEntry = { kind: 'item', minutes, order: item.order ?? 0, item };
    (minutes == null ? untimed : timed).push(entry);
  }

  // Flight legs at their depart day/time.
  for (const { flight, computed } of data.flights) {
    (flight.segments ?? []).forEach((segment, segmentIndex) => {
      if (dateOf(segment.departLocal) !== date) return;
      const minutes = minutesOfDay(segment.departLocal);
      const entry: TimelineEntry = {
        kind: 'flight',
        minutes,
        order: 0,
        flight: { flight, segment, computed: computed.segments[segmentIndex], segmentIndex }
      };
      (minutes == null ? untimed : timed).push(entry);
    });
  }

  // Reservations placed on this day.
  for (const placement of placementsForDate(data.reservations, date)) {
    const minutes = minutesOfDay(placement.time);
    const entry: TimelineEntry = { kind: 'reservation', minutes, order: 0, reservation: placement };
    (minutes == null ? untimed : timed).push(entry);
  }

  // All-day items follow their persisted `order` (matches the Unscheduled bucket
  // and the UI's accessible move-up/down on the all-day lane).
  allDay.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  untimed.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  timed.sort((a, b) => (a.minutes ?? 0) - (b.minutes ?? 0) || (a.order - b.order));

  const subtotal = sumExpenses(
    data.expenses.filter((e) => e.date === date),
    data.home
  );

  return {
    date,
    day: data.days.find((d) => d.date === date) ?? null,
    todos: data.todos.filter((t) => t.date === date),
    allDay,
    timed: [...untimed, ...timed],
    subtotal
  };
}

/** The merged timeline for a single day. */
export async function dayTimeline(tripid: string, date: string): Promise<DayTimeline> {
  const data = await gather(tripid);
  return buildDay(date, data);
}

/** The Unscheduled bucket as a pseudo-timeline (items only). */
function buildUnscheduled(data: TripData): DayTimeline {
  const items = data.items
    .filter((i) => i.date == null)
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  return {
    date: null,
    day: null,
    todos: [],
    allDay: items.filter((i) => i.allDay),
    timed: items
      .filter((i) => !i.allDay)
      .map((item) => ({ kind: 'item' as const, minutes: null, order: item.order ?? 0, item })),
    subtotal: { estimate: 0, actual: 0, spent: 0, unpaid: 0, missingRateCount: 0 }
  };
}

/** Every day of the trip (merged) plus the Unscheduled bucket. */
export async function tripTimeline(
  tripid: string
): Promise<{ days: DayTimeline[]; unscheduled: DayTimeline }> {
  const data = await gather(tripid);
  const dates =
    data.trip?.startDate && data.trip?.endDate
      ? eachDateInRange(data.trip.startDate, data.trip.endDate)
      : [];
  return {
    days: dates.map((date) => buildDay(date, data)),
    unscheduled: buildUnscheduled(data)
  };
}

/** The list of trip dates (inclusive), for the date strip. */
export async function dayList(tripid: string): Promise<string[]> {
  const trip = await getDoc<Trip>(fullTripid(tripid));
  if (!trip?.startDate || !trip?.endDate) return [];
  return eachDateInRange(trip.startDate, trip.endDate);
}
