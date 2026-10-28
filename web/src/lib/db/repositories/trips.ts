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
import { clampDreamDayCount, isDreamTrip, resolveDateMode, type TripMode } from '../date-mode';
import {
	bulkPut,
	createDoc,
	getDoc,
	listTripDocs,
	nowIso,
	patchDoc,
	purgeManyDocs,
	rangeScan,
	restoreDoc,
	softDeleteDoc
} from '../base';
import {
	allTripsRange,
	bareTripUid,
	dayId,
	dreamDayId,
	fullTripid,
	parseId,
	tripid as buildTripId
} from '../ids';
import type {
	AnyDoc,
	Budget,
	Destination,
	Flight,
	ItineraryItem,
	Reservation,
	Trip,
	TripDay
} from '../schemas';

/** Display status including the manual Archived state and dream plans. */
export type TripStatus = TripDateStatus | 'Archived' | 'Planning' | 'Dream';

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
	startDate?: string;
	endDate?: string;
	homeCurrency: string;
	dateMode?: TripMode;
	dreamDayCount?: number;
	destinations?: Destination[];
	primaryTimezone?: string;
	budget?: Budget;
	notes?: string;
	tags?: string[];
	coverImageAttId?: string | null;
	travelerCount?: number;
	stage?: 'planning' | 'confirmed';
}

/** Mutable trip fields. */
export type TripPatch = Partial<Omit<NewTripInput, never>> & {
	archived?: boolean;
};

/** List filter + search options for Home. */
export interface TripListOptions {
	filter?: 'all' | 'upcoming' | 'active' | 'past' | 'archived' | 'dream';
	search?: string;
	/** Reference "today" (ISO date) for status derivation; defaults to the real today. */
	today?: string;
}

/** Trips bucketed into the Home sections. */
export interface TripSections {
	active: TripWithDerived[];
	upcoming: TripWithDerived[];
	planning: TripWithDerived[];
	dreams: TripWithDerived[];
	past: TripWithDerived[];
	archived: TripWithDerived[];
}

/** Derive a trip's display status from its archived flag + dates. */
export function deriveStatus(trip: Trip, today: string = todayIso()): TripStatus {
	if (trip.archived) return 'Archived';
	if (isDreamTrip(trip)) return 'Dream';
	if (trip.stage === 'planning') return 'Planning';
	if (!trip.startDate || !trip.endDate) return 'Upcoming';
	return tripDateStatus(trip.startDate, trip.endDate, today);
}

function withDerived(trip: Trip, today: string): TripWithDerived {
	const dream = isDreamTrip(trip);
	const start = trip.startDate ?? today;
	const end = trip.endDate ?? today;
	const dreamDayCount = clampDreamDayCount(trip.dreamDayCount ?? 1);
	return {
		...trip,
		derived: {
			status: deriveStatus(trip, today),
			nights: dream ? 0 : nightsBetween(start, end),
			dayCount: dream ? dreamDayCount : tripDayCount(start, end),
			countdown: dream ? '' : countdownText(start, end, today)
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
						: opts.filter === 'archived'
							? 'Archived'
							: opts.filter === 'dream'
								? 'Dream'
								: 'Planning';
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
	const byTitle = (a: TripWithDerived, b: TripWithDerived) =>
		(a.title ?? '').localeCompare(b.title ?? '');

	return {
		active: all.filter((t) => t.derived.status === 'Active').sort(byEndAsc),
		upcoming: all.filter((t) => t.derived.status === 'Upcoming').sort(byStartAsc),
		planning: all.filter((t) => t.derived.status === 'Planning').sort(byStartAsc),
		dreams: all.filter((t) => t.derived.status === 'Dream').sort(byTitle),
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
	const mode: TripMode = input.dateMode ?? (input.startDate || input.endDate ? 'dated' : 'dream');
	const dream = mode === 'dream';
	const dreamDayCount = dream ? clampDreamDayCount(input.dreamDayCount ?? 1) : undefined;
	const doc: Omit<Trip, 'createdAt' | 'updatedAt' | 'deletedAt' | '_schemaVersion' | '_rev'> = {
		_id,
		type: 'trip',
		title: input.title,
		startDate: dream ? undefined : (input.startDate ?? ''),
		endDate: dream ? undefined : (input.endDate ?? ''),
		dateMode: mode,
		dreamDayCount,
		homeCurrency: input.homeCurrency,
		destinations: input.destinations ?? [],
		primaryTimezone: input.primaryTimezone,
		archived: false,
		budget: input.budget,
		notes: input.notes,
		tags: input.tags ?? [],
		stage: input.stage ?? 'confirmed',
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

/** Set the stage of a trip (planning or confirmed). */
export function setStage(id: string, stage: 'planning' | 'confirmed'): Promise<Trip> {
	return patchDoc<Trip>(fullTripid(id), { stage });
}

/**
 * Resize a dream plan.
 *
 * Growing only changes the count, so the new days start empty. Shrinking never
 * deletes an item: anything on a removed ordinal moves to Ideas, which is also
 * what the confirmation copy promises. Day metadata above the new count is
 * purged because it no longer describes anything, and the trip document is
 * written last so a retry after a partial failure converges.
 */
export async function setDreamDayCount(id: string, count: number): Promise<Trip> {
	const fullId = fullTripid(id);
	const trip = await getDoc<Trip>(fullId);
	if (!trip) throw new Error(`setDreamDayCount: trip not found: ${id}`);
	if (!isDreamTrip(trip)) throw new Error('setDreamDayCount: trip is not a dream plan');

	const next = clampDreamDayCount(count);
	const now = nowIso();

	const [items, days] = await Promise.all([
		listTripDocs<ItineraryItem>('itineraryItem', fullId),
		listTripDocs<TripDay>('tripDay', fullId)
	]);

	const removedItems = items.filter((item) => item.dayOrdinal != null && item.dayOrdinal > next);
	if (removedItems.length) {
		await bulkPut(
			removedItems.map((item) => ({
				...item,
				date: null,
				dayOrdinal: null,
				updatedAt: now
			}))
		);
	}

	const removedDays = days.filter((doc) => {
		const ordinal = dayOrdinalOf(doc);
		return ordinal != null && ordinal > next;
	});
	if (removedDays.length) {
		await purgeManyDocs(removedDays.map((doc) => doc._id));
	}

	return patchDoc<Trip>(fullId, { dateMode: 'dream', dreamDayCount: next });
}

/** The ordinal a dream `tripDay` document represents, from its field or id. */
function dayOrdinalOf(doc: TripDay): number | null {
	if (doc.ordinal != null) return doc.ordinal;
	if (doc.date) return null;
	const match = /^day:[^:]+:dream-(\d+)$/.exec(doc._id);
	return match ? Number(match[1]) : null;
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

/**
 * Permanently delete a trip and every document that belongs to it.
 *
 * Purging only the trip leaves its days, items, flights, reservations, expenses
 * and attachments soft-deleted in the Trash forever: their trip is gone, so
 * nothing links to them any more, and restoring one produces an orphan nobody
 * can reach. The children go with the parent.
 */
export async function purge(id: string): Promise<void> {
	const fullId = fullTripid(id);
	const childIds: string[] = [];
	for (const type of TRIP_CHILD_TYPES) {
		const docs = await listTripDocs<AnyDoc>(type, fullId, { includeDeleted: true });
		childIds.push(...docs.map((doc) => doc._id));
	}
	await purgeManyDocs([...childIds, fullId]);
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
 * A dream plan stays a dream plan unless `newStartDate` is given, in which case
 * the copy becomes dated: Day n lands on `newStartDate + (n - 1)`. A dated
 * source keeps its existing shift behaviour. Checklist items are reset to
 * unchecked; linked ids (itinerary + flight/reservation, expense + booking) are
 * remapped to the new copies. Attachments are not copied.
 */
export async function duplicate(sourceId: string, opts: DuplicateOptions = {}): Promise<Trip> {
	const source = await get(sourceId);
	if (!source) throw new Error(`duplicate: trip not found: ${sourceId}`);

	const sourceMode = resolveDateMode(source);
	const dreamCount = clampDreamDayCount(source.dreamDayCount ?? 1);
	const dreamCopy = sourceMode === 'dream' && !opts.newStartDate;
	const convertDream = sourceMode === 'dream' && !!opts.newStartDate;

	const startDate = dreamCopy
		? null
		: convertDream
			? (opts.newStartDate ?? todayIso())
			: (shiftIsoDate(
					source.startDate,
					opts.newStartDate && source.startDate ? dayDelta(source.startDate, opts.newStartDate) : 0
				) ??
				source.startDate ??
				todayIso());
	const endDate = dreamCopy
		? null
		: convertDream
			? (shiftIsoDate(startDate, dreamCount - 1) ?? startDate)
			: (shiftIsoDate(
					source.endDate,
					opts.newStartDate && source.startDate ? dayDelta(source.startDate, opts.newStartDate) : 0
				) ??
				source.endDate ??
				todayIso());

	const datedDelta =
		!dreamCopy && !convertDream && opts.newStartDate && source.startDate
			? dayDelta(source.startDate, opts.newStartDate)
			: convertDream
				? await anchorShift(sourceId, startDate ?? todayIso())
				: 0;

	const dateByOrdinal = new Map<number, string>();
	if (convertDream) {
		for (let ordinal = 1; ordinal <= dreamCount; ordinal += 1) {
			const date = shiftIsoDate(startDate, ordinal - 1);
			if (date) dateByOrdinal.set(ordinal, date);
		}
	}

	// 1. The new trip.
	const newTrip = await create({
		title: opts.title ?? `${source.title} (copy)`,
		startDate: startDate ?? undefined,
		endDate: endDate ?? undefined,
		dateMode: dreamCopy ? 'dream' : 'dated',
		dreamDayCount: dreamCopy ? dreamCount : undefined,
		homeCurrency: source.homeCurrency ?? 'EUR',
		destinations: source.destinations,
		primaryTimezone: source.primaryTimezone,
		stage: source.stage ?? 'confirmed',
		budget: (opts.budgetTargets ?? true) ? source.budget : undefined,
		notes: source.notes,
		tags: source.tags
	});
	const newTripid = newTrip._id;
	const ctx: CopyContext = {
		newTripid,
		dreamCopy,
		convertDream,
		dateByOrdinal,
		delta: datedDelta,
		startDate
	};

	// 2. Collect children to copy and assign new ids first (so links remap).
	const idMap = new Map<string, string>();
	const sourceChildren: AnyDoc[] = [];
	for (const type of TRIP_CHILD_TYPES) {
		if (!shouldInclude(type, opts)) continue;
		const docs = await listTripDocs<AnyDoc>(type, sourceId);
		for (const doc of docs) {
			idMap.set(doc._id, remapChildId(type, doc, ctx));
			sourceChildren.push(doc);
		}
	}

	// 3. Transform each child onto the new trip.
	const now = nowIso();
	const copies = sourceChildren.map((doc) => transformChild(doc, idMap, ctx, now));
	if (copies.length) await bulkPut(copies);

	return newTrip;
}

interface CopyContext {
	newTripid: string;
	dreamCopy: boolean;
	convertDream: boolean;
	dateByOrdinal: Map<number, string>;
	/** Day shift for real-dated children (bookings, expenses, to-dos). */
	delta: number;
	startDate: string | null;
}

/** The earliest dated booking, used to align bookings when a dream becomes dated. */
async function anchorShift(sourceId: string, targetStart: string): Promise<number> {
	const [flights, reservations] = await Promise.all([
		listTripDocs<Flight>('flight', sourceId),
		listTripDocs<Reservation>('reservation', sourceId)
	]);
	const dates: string[] = [];
	for (const flight of flights) {
		for (const segment of flight.segments ?? []) {
			const date = segment.departLocal?.slice(0, 10);
			if (date) dates.push(date);
		}
	}
	for (const reservation of reservations) {
		const date = reservation.start?.slice(0, 10);
		if (date) dates.push(date);
	}
	if (!dates.length) return 0;
	return dayDelta(dates.sort()[0], targetStart);
}

function remapChildId(type: TripChildType, doc: AnyDoc, ctx: CopyContext): string {
	const bare = bareTripUid(ctx.newTripid);
	if (type === 'tripDay') {
		const ordinal = dayOrdinalOf(doc as TripDay);
		if (ctx.dreamCopy) return dreamDayId(ctx.newTripid, ordinal ?? 1);
		if (ctx.convertDream) {
			return dayId(ctx.newTripid, ctx.dateByOrdinal.get(ordinal ?? 1) ?? ctx.startDate ?? '');
		}
		const date = shiftIsoDate((doc as { date?: string }).date, ctx.delta) ?? '';
		return dayId(ctx.newTripid, date);
	}
	const { prefix, id: childUid } = parseId(doc._id);
	return `${prefix}:${bare}:${childUid}`;
}

function transformChild(
	doc: AnyDoc,
	idMap: Map<string, string>,
	ctx: CopyContext,
	now: string
): AnyDoc {
	const next = { ...doc } as Record<string, unknown>;
	next._id = idMap.get(doc._id)!;
	delete next._rev;
	next.tripid = ctx.newTripid;
	next.createdAt = now;
	next.updatedAt = now;
	next.deletedAt = null;

	// Shift any date-ish fields.
	if (typeof next.date === 'string') next.date = shiftIsoDate(next.date, ctx.delta);
	if (typeof next.dueDate === 'string') next.dueDate = shiftIsoDate(next.dueDate, ctx.delta);
	if (typeof next.start === 'string') next.start = shiftIsoDateTime(next.start, ctx.delta);
	if (typeof next.end === 'string') next.end = shiftIsoDateTime(next.end, ctx.delta);

	switch (doc.type) {
		case 'tripDay': {
			const ordinal = dayOrdinalOf(doc as TripDay);
			if (ctx.dreamCopy) {
				delete next.date;
				next.ordinal = ordinal ?? 1;
			} else if (ctx.convertDream) {
				next.date = ctx.dateByOrdinal.get(ordinal ?? 1) ?? ctx.startDate ?? '';
				delete next.ordinal;
			} else {
				delete next.ordinal;
			}
			break;
		}
		case 'checklistItem':
			next.done = false;
			next.doneAt = null;
			break;
		case 'itineraryItem': {
			const item = doc as ItineraryItem;
			if (ctx.dreamCopy) {
				next.date = null;
				next.dayOrdinal = item.dayOrdinal ?? null;
			} else if (ctx.convertDream) {
				next.date =
					item.dayOrdinal != null
						? (ctx.dateByOrdinal.get(item.dayOrdinal) ?? ctx.startDate)
						: null;
				delete next.dayOrdinal;
			} else {
				delete next.dayOrdinal;
			}
			if (item.linkedFlightId) next.linkedFlightId = idMap.get(item.linkedFlightId) ?? null;
			if (item.linkedReservationId)
				next.linkedReservationId = idMap.get(item.linkedReservationId) ?? null;
			break;
		}
		case 'flight': {
			const flight = doc as Flight;
			next.segments = (flight.segments ?? []).map((seg) => ({
				...seg,
				departLocal: shiftIsoDateTime(seg.departLocal, ctx.delta) ?? seg.departLocal,
				arriveLocal: shiftIsoDateTime(seg.arriveLocal, ctx.delta) ?? seg.arriveLocal
			}));
			next.attachmentIds = [];
			break;
		}
		case 'reservation': {
			(next as { attachmentIds?: string[] }).attachmentIds = [];
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
