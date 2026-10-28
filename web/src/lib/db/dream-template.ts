/**
 * A small, hand-editable JSON format for a dream plan.
 *
 * The full trip export is a faithful document dump — ids, revisions, audit
 * fields — which is right for round-tripping a backup and wrong for editing by
 * hand. This format exposes only the plan: numbered days, weekday wishes and
 * the items on them, plus an Ideas list. Applying it changes the plan, never
 * bookings, checklists or expenses.
 *
 * Items carry their document id. Editing a downloaded template therefore
 * updates the same item instead of deleting and recreating it; an item omitted
 * from the template moves to Ideas rather than being lost.
 */

import { ulid } from 'ulid';

import { bulkPut, getDoc, listTripDocs, nowIso, purgeManyDocs } from './base';
import { SCHEMA_VERSION } from './constants';
import { buildPlan } from './date-assignment';
import { isDreamTrip, isIsoDate } from './date-mode';
import { dreamDayId, fullTripid, itineraryItemId } from './ids';
import { normalizeDocForCompare, type TripUpdateDiff } from './importer';
import type { AnyDoc, ItineraryCategory, ItineraryItem, Trip, TripDay } from './schemas';

export const DREAM_TEMPLATE_SCHEMA = 'itinera.dream-plan';
export const DREAM_TEMPLATE_VERSION = 1;

const CATEGORIES: readonly ItineraryCategory[] = [
	'sightseeing',
	'food',
	'transport',
	'lodging',
	'activity',
	'free',
	'other'
];

const WEEKDAY_NAMES = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const WEEKDAY_ALIASES: Record<string, number> = {
	mon: 1,
	monday: 1,
	tue: 2,
	tues: 2,
	tuesday: 2,
	wed: 3,
	wednesday: 3,
	thu: 4,
	thur: 4,
	thurs: 4,
	thursday: 4,
	fri: 5,
	friday: 5,
	sat: 6,
	saturday: 6,
	sun: 7,
	sunday: 7
};

/** One item in the editable format. */
export interface DreamTemplateItem {
	id?: string;
	title: string;
	notes?: string;
	category?: ItineraryCategory;
	allDay?: boolean;
	startTime?: string;
	endTime?: string;
	order?: number;
	estCost?: number;
	currency?: string;
	/** Only meaningful for an Idea: a real date that is kept for reference. */
	date?: string;
}

export interface DreamTemplateDay {
	day: number;
	title?: string;
	notes?: string;
	weekdayHint?: string | null;
	items: DreamTemplateItem[];
}

export interface DreamTemplatePayload {
	schema: typeof DREAM_TEMPLATE_SCHEMA;
	version: number;
	howTo?: string;
	trip: { title?: string };
	days: DreamTemplateDay[];
	ideas: DreamTemplateItem[];
}

function weekdayName(hint: number | null | undefined): string | null {
	if (!hint || hint < 1 || hint > 7) return null;
	return WEEKDAY_NAMES[hint - 1];
}

function parseWeekday(value: unknown, path: string): number | null {
	if (value == null || value === '') return null;
	if (typeof value === 'number') {
		if (Number.isInteger(value) && value >= 1 && value <= 7) return value;
		throw new Error(`${path}: weekdayHint must be 1–7 or a weekday name`);
	}
	if (typeof value === 'string') {
		const normalized = value.trim().toLowerCase();
		if (normalized === 'any' || normalized === 'none') return null;
		const day = WEEKDAY_ALIASES[normalized];
		if (day) return day;
	}
	throw new Error(`${path}: weekdayHint must be 1–7 or a weekday name`);
}

function serializeItem(item: ItineraryItem): DreamTemplateItem {
	const out: DreamTemplateItem = { id: item._id, title: item.title ?? '' };
	if (item.notes) out.notes = item.notes;
	if (item.category) out.category = item.category;
	if (item.allDay) out.allDay = true;
	if (item.startTime) out.startTime = item.startTime;
	if (item.endTime) out.endTime = item.endTime;
	if (item.order != null) out.order = item.order;
	if (item.estCost != null) out.estCost = item.estCost;
	if (item.currency) out.currency = item.currency;
	return out;
}

function itemOrder(a: ItineraryItem, b: ItineraryItem): number {
	if (!!a.allDay !== !!b.allDay) return a.allDay ? -1 : 1;
	return (a.order ?? 0) - (b.order ?? 0) || (a.startTime ?? '').localeCompare(b.startTime ?? '');
}

/** Build the editable payload for a dream trip. */
export function buildDreamTemplate(
	trip: Trip,
	items: readonly ItineraryItem[],
	days: readonly TripDay[]
): DreamTemplatePayload {
	if (!isDreamTrip(trip)) {
		throw new Error('buildDreamTemplate: trip is not a dream plan');
	}
	const plan = buildPlan(trip, items, days);
	const ideas = items
		.filter((item) => item.dayOrdinal == null)
		.sort(itemOrder)
		.map((item) => {
			const out = serializeItem(item);
			if (item.date) out.date = item.date;
			return out;
		});

	return {
		schema: DREAM_TEMPLATE_SCHEMA,
		version: DREAM_TEMPLATE_VERSION,
		howTo:
			'Edit the days and their items, then upload this file with “Update from JSON file”. ' +
			'New items may omit "id"; existing items keep theirs. An item you remove moves to Ideas. ' +
			'Weekday wishes use mon, tue, wed, thu, fri, sat or sun.',
		trip: { title: trip.title ?? '' },
		days: plan.days.map((day) => ({
			day: day.ordinal,
			...(day.title ? { title: day.title } : {}),
			...(day.notes ? { notes: day.notes } : {}),
			...(day.weekdayHint ? { weekdayHint: weekdayName(day.weekdayHint) } : {}),
			items: items
				.filter((item) => item.dayOrdinal === day.ordinal)
				.sort(itemOrder)
				.map(serializeItem)
		})),
		ideas
	};
}

interface ParsedItem {
	id?: string;
	title: string;
	notes?: string;
	category?: ItineraryCategory;
	allDay: boolean;
	startTime?: string;
	endTime?: string;
	order: number;
	estCost?: number;
	currency?: string;
	date?: string;
}

interface ParsedDay {
	day: number;
	title?: string;
	notes?: string;
	weekdayHint: number | null;
	items: ParsedItem[];
}

interface ParsedTemplate {
	title?: string;
	days: ParsedDay[];
	ideas: ParsedItem[];
}

function requireObject(value: unknown, path: string): Record<string, unknown> {
	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${path} must be a JSON object`);
	}
	return value as Record<string, unknown>;
}

function optionalString(value: unknown, path: string): string | undefined {
	if (value == null) return undefined;
	if (typeof value !== 'string') throw new Error(`${path} must be a string`);
	const trimmed = value.trim();
	return trimmed ? trimmed : undefined;
}

function parseItem(value: unknown, path: string, defaultOrder: number): ParsedItem {
	const raw = requireObject(value, path);
	const title = optionalString(raw.title, `${path}.title`);
	if (!title) throw new Error(`${path}.title is required`);

	let category: ItineraryCategory | undefined;
	if (raw.category != null) {
		if (
			typeof raw.category !== 'string' ||
			!CATEGORIES.includes(raw.category as ItineraryCategory)
		) {
			throw new Error(`${path}.category must be one of: ${CATEGORIES.join(', ')}`);
		}
		category = raw.category as ItineraryCategory;
	}

	let order = defaultOrder;
	if (raw.order != null) {
		if (typeof raw.order !== 'number' || !Number.isFinite(raw.order)) {
			throw new Error(`${path}.order must be a number`);
		}
		order = Math.round(raw.order);
	}

	let estCost: number | undefined;
	if (raw.estCost != null) {
		if (typeof raw.estCost !== 'number' || !Number.isFinite(raw.estCost)) {
			throw new Error(`${path}.estCost must be a number`);
		}
		estCost = raw.estCost;
	}

	let date: string | undefined;
	if (raw.date != null) {
		if (typeof raw.date !== 'string' || !isIsoDate(raw.date)) {
			throw new Error(`${path}.date must be an ISO date (YYYY-MM-DD)`);
		}
		date = raw.date;
	}

	return {
		id: optionalString(raw.id, `${path}.id`),
		title,
		notes: optionalString(raw.notes, `${path}.notes`),
		category,
		allDay: raw.allDay === true,
		startTime: optionalString(raw.startTime, `${path}.startTime`),
		endTime: optionalString(raw.endTime, `${path}.endTime`),
		order,
		estCost,
		currency: optionalString(raw.currency, `${path}.currency`),
		date
	};
}

/** Validate and normalise an uploaded dream template. */
export function parseDreamTemplate(payload: unknown): ParsedTemplate {
	const root = requireObject(payload, 'The payload');
	if (root.schema !== DREAM_TEMPLATE_SCHEMA) {
		throw new Error(`Not a dream plan: expected schema "${DREAM_TEMPLATE_SCHEMA}"`);
	}
	if (root.version != null && root.version !== DREAM_TEMPLATE_VERSION) {
		throw new Error(`Unsupported dream plan version: ${String(root.version)}`);
	}
	if (!Array.isArray(root.days) || root.days.length === 0) {
		throw new Error('A dream plan needs at least one day');
	}
	if (root.days.length > 366) throw new Error('A dream plan cannot exceed 366 days');

	const days = root.days.map((value, index) => {
		const path = `days[${index}]`;
		const raw = requireObject(value, path);
		if (typeof raw.day !== 'number' || !Number.isInteger(raw.day) || raw.day < 1) {
			throw new Error(`${path}.day must be a positive whole number`);
		}
		if (!Array.isArray(raw.items)) {
			throw new Error(`${path}.items must be an array`);
		}
		return {
			day: raw.day,
			title: optionalString(raw.title, `${path}.title`),
			notes: optionalString(raw.notes, `${path}.notes`),
			weekdayHint: parseWeekday(raw.weekdayHint, `${path}.weekdayHint`),
			items: raw.items.map((item, itemIndex) =>
				parseItem(item, `${path}.items[${itemIndex}]`, itemIndex)
			)
		} satisfies ParsedDay;
	});

	days.sort((a, b) => a.day - b.day);
	for (let index = 0; index < days.length; index += 1) {
		if (days[index].day !== index + 1) {
			throw new Error('Days must be numbered 1…N without gaps');
		}
	}

	const ideaRaw = root.ideas ?? [];
	if (!Array.isArray(ideaRaw)) throw new Error('ideas must be an array');
	const ideas = ideaRaw.map((item, index) => parseItem(item, `ideas[${index}]`, index));

	const trip = root.trip == null ? {} : requireObject(root.trip, 'trip');
	return {
		title: optionalString(trip.title, 'trip.title'),
		days,
		ideas
	};
}

/** Resolve a template item id to a full document id inside the target trip. */
function resolveItemId(value: string | undefined, tripid: string): string {
	if (!value) return itineraryItemId(tripid, ulid());
	if (value.startsWith('itin:')) {
		const expected = `itin:${tripid.replace(/^trip:/, '')}:`;
		if (!value.startsWith(expected)) {
			throw new Error(`Item id belongs to another trip: ${value}`);
		}
		return value;
	}
	if (value.includes(':')) throw new Error(`Invalid item id: ${value}`);
	return itineraryItemId(tripid, value);
}

function sameDoc(a: unknown, b: unknown): boolean {
	return (
		JSON.stringify(normalizeDocForCompare(a as Record<string, unknown>)) ===
		JSON.stringify(normalizeDocForCompare(b as Record<string, unknown>))
	);
}

function applyEditableFields(
	target: Record<string, unknown>,
	entry: ParsedItem,
	ordinal: number | null,
	now: string
): void {
	const setOrDelete = (key: string, value: unknown): void => {
		if (value === undefined) delete target[key];
		else target[key] = value;
	};
	target.title = entry.title;
	target.date = ordinal == null ? (entry.date ?? null) : null;
	target.dayOrdinal = ordinal;
	setOrDelete('notes', entry.notes);
	setOrDelete('category', entry.category);
	target.allDay = entry.allDay;
	setOrDelete('startTime', entry.startTime);
	setOrDelete('endTime', entry.endTime);
	target.order = entry.order;
	setOrDelete('estCost', entry.estCost);
	setOrDelete('currency', entry.currency);
	target.updatedAt = now;
}

/**
 * Diff and prepare a dream template against the stored plan.
 *
 * The returned `apply` writes every document the diff lists; the trip document
 * is last, so a failure leaves a recoverable plan.
 */
export async function prepareDreamTemplateDiff(
	tripid: string,
	payload: unknown
): Promise<TripUpdateDiff> {
	const fullId = fullTripid(tripid);
	const parsed = parseDreamTemplate(payload);
	const [trip, items, days] = await Promise.all([
		getDoc<Trip>(fullId),
		listTripDocs<ItineraryItem>('itineraryItem', fullId),
		listTripDocs<TripDay>('tripDay', fullId)
	]);
	if (!trip) throw new Error(`Trip not found: ${tripid}`);
	if (!isDreamTrip(trip)) {
		throw new Error('Only a dream plan can be edited this way. Make the dates flexible first.');
	}

	const now = nowIso();
	const existingById = new Map(items.map((item) => [item._id, item] as const));
	const referenced = new Set<string>();
	const added: AnyDoc[] = [];
	const updated: AnyDoc[] = [];
	const unchanged: AnyDoc[] = [];
	const movedToIdeas: AnyDoc[] = [];
	const readyToSaveDocs: AnyDoc[] = [];

	const buildItem = (entry: ParsedItem, ordinal: number | null): void => {
		const id = resolveItemId(entry.id, fullId);
		if (referenced.has(id)) throw new Error(`Item id appears twice: ${entry.id ?? id}`);
		referenced.add(id);

		const existing = existingById.get(id);
		const target: Record<string, unknown> = existing
			? { ...existing }
			: {
					_id: id,
					type: 'itineraryItem',
					tripid: fullId,
					createdAt: now,
					updatedAt: now,
					deletedAt: null,
					schemaVersion: SCHEMA_VERSION
				};
		applyEditableFields(target, entry, ordinal, now);

		if (!existing) {
			added.push(target as unknown as AnyDoc);
			readyToSaveDocs.push(target as unknown as AnyDoc);
		} else if (sameDoc(existing, target)) {
			unchanged.push(target as unknown as AnyDoc);
		} else {
			updated.push(target as unknown as AnyDoc);
			readyToSaveDocs.push(target as unknown as AnyDoc);
		}
	};

	for (const day of parsed.days) {
		for (const item of day.items) buildItem(item, day.day);
	}
	for (const idea of parsed.ideas) buildItem(idea, null);

	for (const item of items) {
		if (referenced.has(item._id)) continue;
		if (item.date == null && item.dayOrdinal == null) {
			unchanged.push(item as unknown as AnyDoc);
			continue;
		}
		const target = {
			...item,
			date: null,
			dayOrdinal: null,
			updatedAt: now
		} as unknown as AnyDoc;
		movedToIdeas.push(target);
		readyToSaveDocs.push(target);
	}

	// --- Day metadata ------------------------------------------------------
	const dayCount = parsed.days.length;
	const existingDays = new Map(days.map((doc) => [doc._id, doc] as const));
	const targetDayIds = new Set<string>();
	for (const day of parsed.days) {
		const id = dreamDayId(fullId, day.day);
		targetDayIds.add(id);
		const existing = existingDays.get(id);
		if (!existing && !day.title && !day.notes && day.weekdayHint == null) continue;

		const target: Record<string, unknown> = existing
			? { ...existing }
			: {
					_id: id,
					type: 'tripDay',
					tripid: fullId,
					createdAt: now,
					updatedAt: now,
					deletedAt: null,
					schemaVersion: SCHEMA_VERSION
				};
		target.ordinal = day.day;
		delete target.date;
		if (day.title) target.title = day.title;
		else delete target.title;
		if (day.notes) target.notes = day.notes;
		else delete target.notes;
		target.weekdayHint = day.weekdayHint;
		target.updatedAt = now;

		if (!existing) {
			added.push(target as unknown as AnyDoc);
			readyToSaveDocs.push(target as unknown as AnyDoc);
		} else if (sameDoc(existing, target)) {
			unchanged.push(target as unknown as AnyDoc);
		} else {
			updated.push(target as unknown as AnyDoc);
			readyToSaveDocs.push(target as unknown as AnyDoc);
		}
	}
	const purgeIds = [...existingDays.keys()].filter((id) => !targetDayIds.has(id));

	// --- Trip --------------------------------------------------------------
	const tripTarget: Record<string, unknown> = {
		...trip,
		title: parsed.title ?? trip.title,
		dateMode: 'dream',
		dreamDayCount: dayCount,
		updatedAt: now
	};
	delete tripTarget.startDate;
	delete tripTarget.endDate;
	if (!sameDoc(trip, tripTarget)) {
		updated.push(tripTarget as unknown as AnyDoc);
		readyToSaveDocs.push(tripTarget as unknown as AnyDoc);
	} else {
		unchanged.push(tripTarget as unknown as AnyDoc);
	}

	const isNoOp =
		added.length === 0 &&
		updated.length === 0 &&
		movedToIdeas.length === 0 &&
		purgeIds.length === 0;

	return {
		targetTripId: fullId,
		added,
		updated,
		removed: [],
		movedToIdeas,
		unchanged,
		isNoOp,
		readyToSaveDocs,
		purgeIds,
		apply: async () => {
			if (readyToSaveDocs.length) {
				const results = (await bulkPut(readyToSaveDocs)) as unknown as {
					error?: boolean;
					message?: string;
				}[];
				const failure = results.find((result) => result?.error);
				if (failure) {
					throw new Error(failure.message ?? 'Could not apply the dream plan');
				}
			}
			if (purgeIds.length) await purgeManyDocs(purgeIds);
		}
	};
}

/** Read the stored plan and build its editable payload. */
export async function dreamTemplateForTrip(tripid: string): Promise<DreamTemplatePayload> {
	const fullId = fullTripid(tripid);
	const [trip, items, days] = await Promise.all([
		getDoc<Trip>(fullId),
		listTripDocs<ItineraryItem>('itineraryItem', fullId),
		listTripDocs<TripDay>('tripDay', fullId)
	]);
	if (!trip) throw new Error(`Trip not found: ${tripid}`);
	return buildDreamTemplate(trip, items, days);
}

/** Trigger a browser download of the editable dream plan. */
export async function downloadDreamTemplate(tripid: string): Promise<void> {
	const payload = await dreamTemplateForTrip(tripid);
	const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	a.download = 'itinera-dream-plan.json';
	a.rel = 'noopener';
	document.body.appendChild(a);
	a.click();
	a.remove();
	setTimeout(() => URL.revokeObjectURL(url), 0);
}
