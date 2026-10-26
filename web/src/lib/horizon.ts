/**
 * Cross-trip horizon: the next six months, and what still needs planning.
 *
 * The home page's trip list answers "where am I going next?"; this module
 * answers the question a list of cards cannot: "which trip is still
 * unplanned?" It is pure — the page supplies the trips, today's ISO date and
 * the per-trip document counts it already reads — so the layout maths and the
 * gap rules can be pinned down in tests without a database or a clock.
 *
 * Layout is expressed as percentages of a six-month window that starts on the
 * first day of today's month. A bar's `left`/`width` are therefore directly
 * usable as CSS values, and every month column adds up to exactly 100.
 */

import { DateTime } from 'luxon';
import { dayDelta } from '$lib/db/datetime';
import type { Trip } from '$lib/db';

/** How many months the timeline covers, starting with today's month. */
const WINDOW_MONTHS = 6;

/** How many trips the compact upcoming list names. */
const UPCOMING_LIMIT = 3;

/**
 * An undated trip is not `no_itinerary`: it cannot have a day plan until it has
 * dates. A dated trip this close to departure with no items is still unplanned.
 */
const ITINERARY_WINDOW_DAYS = 14;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** The trip fields the horizon needs (a full `Trip` satisfies this). */
export type HorizonTrip = Pick<Trip, '_id' | 'title' | 'startDate' | 'endDate' | 'budget'>;

/** Child-document counts the caller reads once for all trips. */
export interface HorizonTripCounts {
	/** Itinerary items, scheduled or in the Unscheduled bucket. */
	itineraryItems: number;
	/** Checklist items, ticked or not. */
	checklistItems: number;
	/** Reservations of kind `lodging`. */
	lodgingReservations: number;
}

/** Counts keyed by full trip id; a trip with no entry counts as zero of each. */
export type HorizonCounts = Readonly<Record<string, Partial<HorizonTripCounts>>>;

/** A gap that makes a trip "still unplanned". */
export type HorizonFlag = 'no_dates' | 'no_itinerary' | 'no_checklist' | 'no_budget' | 'no_lodging';

/** Where a trip sits relative to today. */
export type HorizonTone = 'past' | 'active' | 'upcoming' | 'undated';

/** One row of the timeline. */
export interface HorizonBar {
	tripId: string;
	/** The trip's title, trimmed; empty when it has none. */
	title: string;
	startDate: string;
	endDate: string;
	tone: Exclude<HorizonTone, 'undated'>;
	/** Percentage of the window before the bar's first day. */
	left: number;
	/** Percentage of the window the bar covers; always greater than zero. */
	width: number;
}

/** One entry in the compact upcoming list. */
export interface HorizonUpcoming {
	tripId: string;
	title: string;
	startDate: string;
	endDate: string;
	tone: 'active' | 'upcoming';
	/** Calendar days from today to the start; 0 means today, negative while active. */
	daysUntil: number;
}

/** One undated trip, which cannot be placed on the timeline. */
export interface HorizonUndated {
	tripId: string;
	title: string;
}

/** One month column of the timeline. */
export interface HorizonMonth {
	/** First day of the month, ISO (`YYYY-MM-DD`). */
	start: string;
	/** Last day of the month, ISO. */
	end: string;
	days: number;
	/** Percentage of the window before this month. */
	left: number;
	/** Percentage of the window this month covers. */
	width: number;
}

/** Everything the timeline component renders. */
export interface HorizonResult {
	/** Dated trips overlapping the window, earliest first. */
	bars: HorizonBar[];
	/** Up to three current or future dated trips, earliest first. */
	upcoming: HorizonUpcoming[];
	/** Trips missing a start or end date, in the order they were given. */
	undated: HorizonUndated[];
	/** The six month columns, oldest first. */
	months: HorizonMonth[];
	/** Planning gaps per trip id; empty arrays for trips with nothing to fix. */
	flags: Record<string, HorizonFlag[]>;
}

/** A document as read by `prefixScan`, reduced to what counting needs. */
export interface PlanningDocRef {
	tripid?: string;
	kind?: string;
}

/**
 * Fold the flat document scans into per-trip counts.
 *
 * The home page loads all trips in one query; asking each repository for a
 * trip's children would add three queries per trip. Three prefix scans cover
 * every trip at once, and this turns them into the record `computeHorizon`
 * expects. Documents without a `tripid` are ignored rather than inflating an
 * `undefined` bucket.
 */
export function countPlanning(
	itinerary: readonly PlanningDocRef[],
	checklist: readonly PlanningDocRef[],
	reservations: readonly PlanningDocRef[]
): HorizonCounts {
	const counts: Record<string, HorizonTripCounts> = {};

	const bucket = (tripid: string): HorizonTripCounts => {
		counts[tripid] ??= { itineraryItems: 0, checklistItems: 0, lodgingReservations: 0 };
		return counts[tripid];
	};

	for (const doc of itinerary) {
		if (doc.tripid) bucket(doc.tripid).itineraryItems += 1;
	}
	for (const doc of checklist) {
		if (doc.tripid) bucket(doc.tripid).checklistItems += 1;
	}
	for (const doc of reservations) {
		if (doc.tripid && doc.kind === 'lodging') bucket(doc.tripid).lodgingReservations += 1;
	}

	return counts;
}

/** The trip's date range as whole ISO days, or `null` when it cannot be drawn. */
function plannedRange(trip: HorizonTrip): { start: string; end: string } | null {
	const start = trip.startDate?.slice(0, 10) ?? '';
	const end = trip.endDate?.slice(0, 10) ?? '';
	if (!ISO_DATE.test(start) || !ISO_DATE.test(end) || start > end) return null;
	return { start, end };
}

/** Where a dated trip sits relative to `today`. ISO dates compare as strings. */
function toneFor(start: string, end: string, today: string): 'past' | 'active' | 'upcoming' {
	if (today < start) return 'upcoming';
	if (today > end) return 'past';
	return 'active';
}

/** Whether the trip has any money target at all, not merely an empty object. */
function hasBudget(trip: HorizonTrip): boolean {
	const budget = trip.budget;
	if (!budget) return false;
	if ((budget.total ?? 0) > 0 || (budget.perDay ?? 0) > 0) return true;
	return Object.values(budget.byCategory ?? {}).some((amount) => amount > 0);
}

/**
 * The gaps worth naming for one dated trip.
 *
 * Past trips are history: flagging a trip that ended last week as "no
 * checklist" asks the user to fix something they can no longer act on. Undated
 * trips get their own list and only ever report their missing dates.
 */
function planningFlags(
	trip: HorizonTrip,
	range: { start: string; end: string },
	counts: HorizonTripCounts,
	today: string,
	tone: 'past' | 'active' | 'upcoming'
): HorizonFlag[] {
	if (tone === 'past') return [];

	const flags: HorizonFlag[] = [];
	// In-progress trips count as "starting soon": they are past the point where
	// an empty itinerary is harmless.
	if (counts.itineraryItems === 0 && dayDelta(today, range.start) <= ITINERARY_WINDOW_DAYS) {
		flags.push('no_itinerary');
	}
	if (counts.checklistItems === 0) flags.push('no_checklist');
	if (!hasBudget(trip)) flags.push('no_budget');
	if (counts.lodgingReservations === 0) flags.push('no_lodging');
	return flags;
}

/** A percentage rounded to three decimals, so two callers compute the same CSS. */
function percent(part: number, total: number): number {
	return Math.round((part / total) * 100 * 1000) / 1000;
}

/** Earliest start first; later end and id keep ties deterministic. */
function byStart(a: HorizonBar | HorizonUpcoming, b: HorizonBar | HorizonUpcoming): number {
	return (
		a.startDate.localeCompare(b.startDate) ||
		a.endDate.localeCompare(b.endDate) ||
		a.tripId.localeCompare(b.tripId)
	);
}

/**
 * Build the cross-trip horizon.
 *
 * @param trips all non-archived trips (archived ones have no horizon)
 * @param counts per-trip child counts, from `countPlanning`
 * @param today today's ISO date (`YYYY-MM-DD`), supplied by the caller
 */
export function computeHorizon(
	trips: readonly HorizonTrip[],
	counts: HorizonCounts,
	today: string
): HorizonResult {
	const base = DateTime.fromISO(today, { zone: 'utc' });
	if (!base.isValid) {
		return { bars: [], upcoming: [], undated: [], months: [], flags: {} };
	}

	const windowStartDate = base.startOf('month');
	const windowEndDate = windowStartDate.plus({ months: WINDOW_MONTHS }).minus({ days: 1 });
	const windowStart = windowStartDate.toISODate() ?? '';
	const windowEnd = windowEndDate.toISODate() ?? '';
	const totalDays = Math.round(windowEndDate.diff(windowStartDate, 'days').days) + 1;

	const months: HorizonMonth[] = [];
	let offsetDays = 0;
	for (let index = 0; index < WINDOW_MONTHS; index += 1) {
		const monthStart = windowStartDate.plus({ months: index });
		const monthEnd = monthStart.plus({ months: 1 }).minus({ days: 1 });
		const days = Math.round(monthEnd.diff(monthStart, 'days').days) + 1;
		const left = index === 0 ? 0 : percent(offsetDays, totalDays);
		const nextOffset = offsetDays + days;
		// The final column ends at exactly 100, so the six widths never overflow.
		const nextLeft = index === WINDOW_MONTHS - 1 ? 100 : percent(nextOffset, totalDays);
		months.push({
			start: monthStart.toISODate() ?? '',
			end: monthEnd.toISODate() ?? '',
			days,
			left,
			width: Math.round((nextLeft - left) * 1000) / 1000
		});
		offsetDays = nextOffset;
	}

	const bars: HorizonBar[] = [];
	const upcomingCandidates: HorizonUpcoming[] = [];
	const undated: HorizonUndated[] = [];
	const flags: Record<string, HorizonFlag[]> = {};

	for (const trip of trips) {
		const tripId = trip._id;
		const title = trip.title?.trim() ?? '';
		const range = plannedRange(trip);

		if (!range) {
			undated.push({ tripId, title });
			flags[tripId] = ['no_dates'];
			continue;
		}

		const tone = toneFor(range.start, range.end, today);
		const tripCounts: HorizonTripCounts = {
			itineraryItems: counts[tripId]?.itineraryItems ?? 0,
			checklistItems: counts[tripId]?.checklistItems ?? 0,
			lodgingReservations: counts[tripId]?.lodgingReservations ?? 0
		};
		flags[tripId] = planningFlags(trip, range, tripCounts, today, tone);

		if (range.end >= windowStart && range.start <= windowEnd) {
			const from = range.start < windowStart ? windowStart : range.start;
			const to = range.end > windowEnd ? windowEnd : range.end;
			const left = percent(dayDelta(windowStart, from), totalDays);
			let width = percent(dayDelta(from, to) + 1, totalDays);
			// A bar clipped at the right edge must not spill past it by a rounding
			// step, which would otherwise create page-level horizontal overflow.
			if (left + width > 100) width = Math.round((100 - left) * 1000) / 1000;
			bars.push({ tripId, title, startDate: range.start, endDate: range.end, tone, left, width });
		}

		if (tone !== 'past') {
			upcomingCandidates.push({
				tripId,
				title,
				startDate: range.start,
				endDate: range.end,
				tone,
				daysUntil: dayDelta(today, range.start)
			});
		}
	}

	bars.sort(byStart);
	upcomingCandidates.sort(byStart);

	return {
		bars,
		upcoming: upcomingCandidates.slice(0, UPCOMING_LIMIT),
		undated,
		months,
		flags
	};
}
