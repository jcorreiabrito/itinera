/**
 * The one place that commits a change of scheduling mode.
 *
 * `setDates` turns a dream plan into a dated trip (or re-dates an existing one),
 * and `clearDates` makes a dated trip flexible again. Both write absolute
 * values rather than deltas, and both write the trip document last, so a failed
 * attempt leaves the plan recoverable instead of half-converted.
 *
 * The arithmetic is in `date-assignment.ts`; this module only turns a preview
 * into documents.
 */

import { bulkPut, getDoc, listTripDocs, nowIso, purgeManyDocs } from '../base';
import {
	anchorsFor,
	buildPlan,
	previewSetDates,
	type Anchor,
	type PlacementItem
} from '../date-assignment';
import { isDreamTrip, weekdayOf } from '../date-mode';
import { eachDateInRange, shiftIsoDate, shiftIsoDateTime } from '../datetime';
import { dayId, dreamDayId, fullTripid } from '../ids';
import type {
	AnyDoc,
	Expense,
	Flight,
	ItineraryItem,
	Reservation,
	Trip,
	TripDay
} from '../schemas';

export interface SetDatesOptions {
	/** Day 1's chosen real date. */
	startDate: string;
	/** Extra days inserted before an ordinal; must be non-decreasing. */
	offsets?: Record<number, number>;
	/** Move flights/reservations (and their linked expenses) too. */
	moveBookings?: boolean;
}

/** The ordinal a stored dream `tripDay` document represents. */
function dayOrdinal(doc: TripDay): number | null {
	if (doc.ordinal != null) return doc.ordinal;
	if (doc.date) return null;
	const match = /^day:[^:]+:dream-(\d+)$/.exec(doc._id);
	return match ? Number(match[1]) : null;
}

function hasDayMeta(doc: TripDay): boolean {
	return !!(doc.title || doc.notes || doc.weekdayHint != null);
}

function linkedToBooking(expense: Expense, bookingId: string): boolean {
	return (
		(expense.linkedType === 'flight' || expense.linkedType === 'reservation') &&
		!!expense.linkedId &&
		(expense.linkedId === bookingId || expense.linkedId.startsWith(`${bookingId}:`))
	);
}

function tripForWrite(trip: Trip, patch: Partial<Trip>): AnyDoc {
	const next = { ...trip, ...patch, updatedAt: nowIso() } as Record<string, unknown>;
	for (const [key, value] of Object.entries(next)) {
		if (value === undefined) delete next[key];
	}
	return next as unknown as AnyDoc;
}

/** PouchDB should store documents without `undefined` placeholders. */
function clean(doc: Record<string, unknown>): AnyDoc {
	for (const [key, value] of Object.entries(doc)) {
		if (value === undefined) delete doc[key];
	}
	return doc as unknown as AnyDoc;
}

/**
 * A bulk write reports per-document failures instead of rejecting. Treat any
 * failure as a failed commit so the caller can retry instead of returning a
 * "dated" trip whose day documents were never written.
 */
async function writeBatch(docs: AnyDoc[], context: string): Promise<void> {
	const results = (await bulkPut(docs)) as unknown as {
		id?: string;
		error?: boolean;
		message?: string;
	}[];
	const failure = results.find((result) => result?.error);
	if (failure) {
		throw new Error(
			`${context}: ${failure.message ?? 'bulk write failed'}${failure.id ? ` (${failure.id})` : ''}`
		);
	}
}

/**
 * Map Dream days onto real dates, or move an existing dated trip onto a new
 * range. Items keep their identity and their ordinal/date moves with them.
 */
export async function setDates(tripid: string, options: SetDatesOptions): Promise<Trip> {
	const fullId = fullTripid(tripid);
	const [trip, items, days, flights, reservations, allExpenses] = await Promise.all([
		getDoc<Trip>(fullId),
		listTripDocs<ItineraryItem>('itineraryItem', fullId),
		listTripDocs<TripDay>('tripDay', fullId),
		listTripDocs<Flight>('flight', fullId),
		listTripDocs<Reservation>('reservation', fullId),
		listTripDocs<Expense>('expense', fullId)
	]);
	if (!trip) throw new Error(`setDates: trip not found: ${tripid}`);

	const plan = buildPlan(trip, items, days);
	const anchors = anchorsFor(flights, reservations);
	const preview = previewSetDates(plan, items, options, anchors);
	if (!preview.valid) {
		throw new Error(`setDates: invalid date mapping (${preview.error ?? 'unknown'})`);
	}

	const targetByOrdinal = new Map(preview.days.map((day) => [day.ordinal, day.date] as const));
	const oldOrdinalByDate = new Map(
		plan.days.filter((day) => day.date).map((day) => [day.date as string, day.ordinal] as const)
	);
	const now = nowIso();

	// --- Items -------------------------------------------------------------
	const itemWrites: AnyDoc[] = [];
	const itemPlacementById = new Map<string, string | null>();
	for (const item of items) {
		let nextDate: string | null = item.date ?? null;
		let nextOrdinal: number | null = item.dayOrdinal ?? null;
		let changed = false;

		if (plan.mode === 'dream') {
			if (item.dayOrdinal != null) {
				nextDate = targetByOrdinal.get(item.dayOrdinal) ?? null;
				nextOrdinal = null;
				changed = nextDate !== (item.date ?? null) || nextOrdinal !== (item.dayOrdinal ?? null);
			} else if (item.date != null) {
				/*
				 * No ordinal means Ideas in dream mode. Clear a stale real date so it
				 * stays visible after the trip becomes dated — unless it already sits
				 * inside the target range, which is what a retry after a partial
				 * write looks like, and there the item must keep its assigned date.
				 */
				const insideTarget = item.date >= preview.startDate && item.date <= preview.endDate;
				if (!insideTarget) {
					nextDate = null;
					nextOrdinal = null;
					changed = true;
				}
			}
		} else {
			if (item.date != null) {
				const ordinal = oldOrdinalByDate.get(item.date);
				if (ordinal != null) {
					nextDate = targetByOrdinal.get(ordinal) ?? item.date;
					nextOrdinal = null;
					changed = nextDate !== item.date || item.dayOrdinal != null;
				} else if (item.date >= preview.startDate && item.date <= preview.endDate) {
					// A stray date outside the old plan but inside the new range stays put.
					nextDate = item.date;
					nextOrdinal = null;
					changed = item.dayOrdinal != null;
				} else {
					nextDate = null;
					nextOrdinal = null;
					changed = true;
				}
			} else if (item.dayOrdinal != null) {
				nextDate = null;
				nextOrdinal = null;
				changed = true;
			}
		}

		if (changed) {
			itemPlacementById.set(item._id, nextDate);
			itemWrites.push(
				clean({
					...item,
					date: nextDate,
					dayOrdinal: nextOrdinal,
					updatedAt: now
				})
			);
		}
	}

	// --- Day metadata ------------------------------------------------------
	const existingDayById = new Map(days.map((doc) => [doc._id, doc] as const));
	const dayWritesById = new Map<string, AnyDoc>();
	const sourceDayIds: string[] = [];

	for (const doc of days) {
		if (plan.mode === 'dream') {
			const ordinal = dayOrdinal(doc);
			if (ordinal == null) {
				sourceDayIds.push(doc._id);
				continue;
			}
			sourceDayIds.push(doc._id);
			const target = targetByOrdinal.get(ordinal);
			if (!target || !hasDayMeta(doc)) continue;
			const targetId = dayId(fullId, target);
			const existing = existingDayById.get(targetId);
			dayWritesById.set(
				targetId,
				clean({
					...doc,
					_id: targetId,
					/*
					 * Only the target document's revision is valid here. The source
					 * document's `_rev` must not travel with a new `_id`: PouchDB
					 * rejects that as an update conflict, and a bulk write reports
					 * it per document instead of throwing.
					 */
					_rev: existing?._rev,
					date: target,
					ordinal: undefined,
					updatedAt: now
				})
			);
		} else {
			const ordinal = doc.date ? oldOrdinalByDate.get(doc.date) : undefined;
			if (ordinal == null) {
				sourceDayIds.push(doc._id);
				continue;
			}
			sourceDayIds.push(doc._id);
			const target = targetByOrdinal.get(ordinal);
			if (!target) continue;
			const targetId = dayId(fullId, target);
			const existing = existingDayById.get(targetId);
			dayWritesById.set(
				targetId,
				clean({
					...doc,
					_id: targetId,
					/*
					 * Only the target document's revision is valid here. The source
					 * document's `_rev` must not travel with a new `_id`: PouchDB
					 * rejects that as an update conflict, and a bulk write reports
					 * it per document instead of throwing.
					 */
					_rev: existing?._rev,
					date: target,
					ordinal: undefined,
					updatedAt: now
				})
			);
		}
	}

	// --- Expenses ----------------------------------------------------------
	const expenseWrites = new Map<string, Expense>();
	for (const expense of allExpenses) {
		let nextDate = expense.date ?? null;
		let changed = false;

		if (expense.linkedType === 'itineraryItem' && expense.linkedId) {
			const itemId = items.find(
				(item) => expense.linkedId === item._id || expense.linkedId!.startsWith(`${item._id}:`)
			)?._id;
			if (itemId && itemPlacementById.has(itemId)) {
				nextDate = itemPlacementById.get(itemId) ?? null;
				changed = nextDate !== (expense.date ?? null);
			}
		} else if (plan.mode === 'dated' && expense.date) {
			const ordinal = oldOrdinalByDate.get(expense.date);
			if (ordinal != null) {
				nextDate = targetByOrdinal.get(ordinal) ?? expense.date;
				changed = nextDate !== expense.date;
			}
		}

		if (changed) {
			expenseWrites.set(expense._id, { ...expense, date: nextDate, updatedAt: now });
		}
	}

	// --- Bookings ----------------------------------------------------------
	const bookingWrites: AnyDoc[] = [];
	const shift = options.moveBookings ? preview.bookingShiftDays : null;
	if (shift != null && shift !== 0) {
		for (const flight of flights) {
			bookingWrites.push({
				...flight,
				segments: (flight.segments ?? []).map((segment) => ({
					...segment,
					departLocal: shiftIsoDateTime(segment.departLocal, shift) ?? segment.departLocal,
					arriveLocal: shiftIsoDateTime(segment.arriveLocal, shift) ?? segment.arriveLocal
				})),
				updatedAt: now
			} as unknown as AnyDoc);
		}
		for (const reservation of reservations) {
			bookingWrites.push({
				...reservation,
				start: shiftIsoDateTime(reservation.start, shift) ?? reservation.start,
				end: shiftIsoDateTime(reservation.end, shift) ?? reservation.end,
				updatedAt: now
			} as unknown as AnyDoc);
		}
		for (const expense of allExpenses) {
			if (!expense.linkedId || !expense.date) continue;
			const linked =
				flights.some((flight) => linkedToBooking(expense, flight._id)) ||
				reservations.some((reservation) => linkedToBooking(expense, reservation._id));
			if (!linked) continue;
			expenseWrites.set(expense._id, {
				...expense,
				date: shiftIsoDate(expense.date, shift) ?? expense.date,
				updatedAt: now
			});
		}
	}

	// --- Commit ------------------------------------------------------------
	const tripWrite = tripForWrite(trip, {
		dateMode: 'dated',
		startDate: preview.startDate,
		endDate: preview.endDate,
		dreamDayCount: undefined
	});
	const writes = [
		...itemWrites,
		...dayWritesById.values(),
		...expenseWrites.values(),
		...bookingWrites,
		tripWrite
	];
	await writeBatch(writes, 'setDates');

	const targetIds = new Set(dayWritesById.keys());
	const stale = sourceDayIds.filter((id) => !targetIds.has(id));
	if (stale.length) await purgeManyDocs(stale);

	return tripForWrite(trip, {
		dateMode: 'dated',
		startDate: preview.startDate,
		endDate: preview.endDate,
		dreamDayCount: undefined
	}) as unknown as Trip;
}

/**
 * Make a dated trip flexible again.
 *
 * The day sequence is preserved, so Day n is the nth date in the old range.
 * Bookings keep their real dates and become anchors. Items outside the range
 * move to Ideas rather than being lost; linked expenses follow their items.
 */
export async function clearDates(tripid: string): Promise<Trip> {
	const fullId = fullTripid(tripid);
	const [trip, items, days, allExpenses] = await Promise.all([
		getDoc<Trip>(fullId),
		listTripDocs<ItineraryItem>('itineraryItem', fullId),
		listTripDocs<TripDay>('tripDay', fullId),
		listTripDocs<Expense>('expense', fullId)
	]);
	if (!trip) throw new Error(`clearDates: trip not found: ${tripid}`);
	if (isDreamTrip(trip)) return trip;

	const dates = trip.startDate && trip.endDate ? eachDateInRange(trip.startDate, trip.endDate) : [];
	const ordinalByDate = new Map(dates.map((date, index) => [date, index + 1] as const));
	const now = nowIso();

	const itemWrites: AnyDoc[] = [];
	for (const item of items) {
		let nextDate: string | null = item.date ?? null;
		let nextOrdinal: number | null = item.dayOrdinal ?? null;
		let changed = false;

		if (item.date) {
			const ordinal = ordinalByDate.get(item.date);
			nextDate = null;
			nextOrdinal = ordinal ?? null;
			changed = true;
		} else if (item.dayOrdinal != null) {
			nextOrdinal = null;
			changed = true;
		}

		if (changed) {
			itemWrites.push(
				clean({
					...item,
					date: nextDate,
					dayOrdinal: nextOrdinal,
					updatedAt: now
				})
			);
		}
	}

	const existingDayById = new Map(days.map((doc) => [doc._id, doc] as const));
	const dayWritesById = new Map<string, AnyDoc>();
	const sourceDayIds: string[] = [];
	for (const doc of days) {
		if (!doc.date) continue;
		sourceDayIds.push(doc._id);
		const ordinal = ordinalByDate.get(doc.date);
		if (ordinal == null) continue;
		const targetId = dreamDayId(fullId, ordinal);
		const existing = existingDayById.get(targetId);
		dayWritesById.set(
			targetId,
			clean({
				...doc,
				_id: targetId,
				// The target id may already exist; only its revision is usable.
				_rev: existing?._rev,
				date: undefined,
				ordinal,
				weekdayHint: doc.weekdayHint ?? weekdayOf(doc.date),
				updatedAt: now
			})
		);
	}

	const expenseWrites: Expense[] = [];
	for (const expense of allExpenses) {
		if (expense.linkedType !== 'itineraryItem' || !expense.linkedId) continue;
		const itemId = items.find(
			(item) => expense.linkedId === item._id || expense.linkedId!.startsWith(`${item._id}:`)
		)?._id;
		if (!itemId) continue;
		if (expense.date == null) continue;
		expenseWrites.push({ ...expense, date: null, updatedAt: now });
	}

	const tripWrite = tripForWrite(trip, {
		dateMode: 'dream',
		startDate: undefined,
		endDate: undefined,
		dreamDayCount: Math.max(1, dates.length)
	});
	await writeBatch(
		[...itemWrites, ...dayWritesById.values(), ...expenseWrites, tripWrite],
		'clearDates'
	);

	const targetIds = new Set(dayWritesById.keys());
	const stale = sourceDayIds.filter((id) => !targetIds.has(id));
	if (stale.length) await purgeManyDocs(stale);

	return tripForWrite(trip, {
		dateMode: 'dream',
		startDate: undefined,
		endDate: undefined,
		dreamDayCount: Math.max(1, dates.length)
	}) as unknown as Trip;
}

/** Expose the same plan/preview helpers through the repository barrel. */
export { anchorsFor, buildPlan, previewSetDates };
export type { Anchor, PlacementItem };
