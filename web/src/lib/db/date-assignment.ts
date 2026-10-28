/**
 * Pure date-assignment planning for the Set dates flow.
 *
 * The sheet, the repository and the tests all need to answer the same questions
 * without touching PouchDB: what does the plan look like now, what happens if
 * Day 1 starts on this date, which weekday wishes are missed, which bookings
 * fall outside the range, and which items would be pushed back to Ideas. Keeping
 * that arithmetic here makes the preview deterministic and cheap to test.
 */

import { dateOf, dayDelta, eachDateInRange, shiftIsoDate } from './datetime';
import {
	isDreamTrip,
	dreamDayKey,
	effectiveDreamDayCount,
	isIsoDate,
	weekdayOf,
	type TripMode
} from './date-mode';
import type { Flight, Reservation, Trip, TripDay } from './schemas';

/** Only the fields planning needs, so tests can use plain objects. */
export interface PlacementItem {
	_id: string;
	date?: string | null;
	dayOrdinal?: number | null;
}

export interface PlanDay {
	ordinal: number;
	/** The day's current key: an ISO date or `dream-{n}`. */
	key: string;
	/** The real date, or `null` on a dream day. */
	date: string | null;
	weekdayHint: number | null;
	title?: string;
	notes?: string;
	itemCount: number;
	empty: boolean;
}

export interface DayPlan {
	mode: TripMode;
	days: PlanDay[];
}

/** Build the current plan from a trip, its itinerary items and its day docs. */
export function buildPlan(
	trip: Pick<Trip, 'dateMode' | 'startDate' | 'endDate' | 'dreamDayCount'>,
	items: readonly PlacementItem[],
	days: readonly Pick<TripDay, 'date' | 'ordinal' | 'weekdayHint' | 'title' | 'notes'>[] = []
): DayPlan {
	if (isDreamTrip(trip)) {
		const count = effectiveDreamDayCount(trip, days, items);
		const planDays: PlanDay[] = [];
		for (let ordinal = 1; ordinal <= count; ordinal += 1) {
			const doc = days.find((day) => !day.date && day.ordinal === ordinal);
			const itemCount = items.filter((item) => item.dayOrdinal === ordinal).length;
			planDays.push({
				ordinal,
				key: dreamDayKey(ordinal),
				date: null,
				weekdayHint: doc?.weekdayHint ?? null,
				title: doc?.title,
				notes: doc?.notes,
				itemCount,
				empty: itemCount === 0 && !doc?.title && !doc?.notes
			});
		}
		return { mode: 'dream', days: planDays };
	}

	const dates = trip.startDate && trip.endDate ? eachDateInRange(trip.startDate, trip.endDate) : [];
	const planDays = dates.map((date, index) => {
		const doc = days.find((day) => day.date === date);
		const itemCount = items.filter((item) => item.date === date).length;
		return {
			ordinal: index + 1,
			key: date,
			date,
			weekdayHint: doc?.weekdayHint ?? null,
			title: doc?.title,
			notes: doc?.notes,
			itemCount,
			empty: itemCount === 0 && !doc?.title && !doc?.notes
		};
	});
	return { mode: 'dated', days: planDays };
}

/** A real booking that pins the trip to a date. */
export interface Anchor {
	kind: 'flight' | 'reservation';
	id: string;
	label: string;
	/** Raw stored value (local ISO datetime or date), for shifting. */
	start: string;
	end: string | null;
	startDate: string;
	endDate: string;
}

function flightLabel(flight: Flight): string {
	const first = flight.segments?.[0];
	if (!first) return flight.bookingRef || 'Flight';
	const from = first.from?.code ?? first.from?.city ?? '?';
	const to = first.to?.code ?? first.to?.city ?? '?';
	const number = first.flightNumber ? `${first.flightNumber} ` : '';
	return `${number}${from} → ${to}`.trim();
}

/** Every dated flight and reservation, sorted by start date. */
export function anchorsFor(
	flights: readonly Flight[],
	reservations: readonly Reservation[]
): Anchor[] {
	const anchors: Anchor[] = [];

	for (const flight of flights) {
		const dates = (flight.segments ?? [])
			.flatMap((segment) => [dateOf(segment.departLocal), dateOf(segment.arriveLocal)])
			.filter((date): date is string => !!date && isIsoDate(date));
		if (!dates.length) continue;
		const sorted = [...dates].sort();
		const start = (flight.segments ?? []).find(
			(segment) => dateOf(segment.departLocal) === sorted[0]
		);
		const end = (flight.segments ?? []).find(
			(segment) => dateOf(segment.arriveLocal) === sorted[sorted.length - 1]
		);
		anchors.push({
			kind: 'flight',
			id: flight._id,
			label: flightLabel(flight),
			start: start?.departLocal ?? sorted[0],
			end: end?.arriveLocal ?? null,
			startDate: sorted[0],
			endDate: sorted[sorted.length - 1]
		});
	}

	for (const reservation of reservations) {
		const startDate = dateOf(reservation.start);
		const endDate = dateOf(reservation.end) ?? startDate;
		if (!startDate || !isIsoDate(startDate)) continue;
		anchors.push({
			kind: 'reservation',
			id: reservation._id,
			label: reservation.name || reservation.kind || 'Reservation',
			start: reservation.start ?? startDate,
			end: reservation.end ?? null,
			startDate,
			endDate: endDate && isIsoDate(endDate) ? endDate : startDate
		});
	}

	return anchors.sort(
		(a, b) => a.startDate.localeCompare(b.startDate) || a.label.localeCompare(b.label)
	);
}

export interface SetDatesOptions {
	/** Day 1's chosen date. */
	startDate: string;
	/** Extra days to insert before each ordinal (`0` shifts nothing). */
	offsets?: Record<number, number>;
	/** Move flights/reservations by the computed shift. */
	moveBookings?: boolean;
}

export type PreviewWarningCode =
	'weekday_missed' | 'anchor_outside' | 'items_to_ideas' | 'booking_shift';

export interface PreviewWarning {
	code: PreviewWarningCode;
	params?: Record<string, string | number>;
}

export interface PreviewDay {
	ordinal: number;
	date: string;
	weekday: number;
	hint: number | null;
	hintMet: boolean;
	itemCount: number;
	offset: number;
	empty: boolean;
}

export interface DatePreview {
	mode: TripMode;
	startDate: string;
	endDate: string;
	days: PreviewDay[];
	anchors: (Anchor & { inRange: boolean })[];
	warnings: PreviewWarning[];
	movedToIdeas: number;
	bookingShiftDays: number | null;
	valid: boolean;
	error?: 'invalid_start' | 'offsets_not_increasing';
}

function invalidPreview(
	mode: TripMode,
	startDate: string,
	error: 'invalid_start' | 'offsets_not_increasing'
): DatePreview {
	return {
		mode,
		startDate,
		endDate: '',
		days: [],
		anchors: [],
		warnings: [],
		movedToIdeas: 0,
		bookingShiftDays: null,
		valid: false,
		error
	};
}

/**
 * Map every planned day onto a real date.
 *
 * Offsets are per-day insertions: `offset[n]` pushes Day n (and only Day n)
 * later, so the sequence stays valid when offsets are non-decreasing. That one
 * rule is what lets the UI nudge a single day without having to reason about
 * collisions, and the same rule is re-checked before writing.
 */
export function previewSetDates(
	plan: DayPlan,
	items: readonly PlacementItem[],
	options: SetDatesOptions,
	anchors: readonly Anchor[] = []
): DatePreview {
	const { startDate } = options;
	if (!isIsoDate(startDate)) return invalidPreview(plan.mode, startDate, 'invalid_start');

	const offsets = options.offsets ?? {};
	const previewDays: PreviewDay[] = [];
	let previousOffset = 0;

	for (const day of plan.days) {
		const offset = offsets[day.ordinal] ?? 0;
		if (!Number.isInteger(offset) || offset < 0) {
			return invalidPreview(plan.mode, startDate, 'offsets_not_increasing');
		}
		if (offset < previousOffset) {
			return invalidPreview(plan.mode, startDate, 'offsets_not_increasing');
		}
		previousOffset = offset;

		const date = shiftIsoDate(startDate, day.ordinal - 1 + offset);
		if (!date) return invalidPreview(plan.mode, startDate, 'invalid_start');
		const weekday = weekdayOf(date) ?? 1;
		previewDays.push({
			ordinal: day.ordinal,
			date,
			weekday,
			hint: day.weekdayHint,
			hintMet: day.weekdayHint == null || weekday === day.weekdayHint,
			itemCount: day.itemCount,
			offset,
			empty: day.empty
		});
	}

	if (!previewDays.length) {
		return {
			mode: plan.mode,
			startDate,
			endDate: startDate,
			days: [],
			anchors: anchors.map((anchor) => ({ ...anchor, inRange: false })),
			warnings: [],
			movedToIdeas: 0,
			bookingShiftDays: null,
			valid: true
		};
	}

	const endDate = previewDays[previewDays.length - 1].date;

	// An anchor is in range when its [startDate, endDate] overlaps the plan.
	const previewAnchors = anchors.map((anchor) => ({
		...anchor,
		inRange: anchor.startDate <= endDate && anchor.endDate >= startDate
	}));

	const warnings: PreviewWarning[] = [];
	for (const day of previewDays) {
		if (!day.hintMet && day.hint != null) {
			warnings.push({
				code: 'weekday_missed',
				params: { ordinal: day.ordinal, date: day.date, hint: day.hint }
			});
		}
	}
	for (const anchor of previewAnchors) {
		if (!anchor.inRange) {
			warnings.push({
				code: 'anchor_outside',
				params: { label: anchor.label, startDate: anchor.startDate, endDate: anchor.endDate }
			});
		}
	}

	/*
	 * Items whose date is outside the old range are the only ones that can fall
	 * out of the plan on a re-date. Items already in Ideas are not "moved".
	 * A dream item without an ordinal is an Idea and stays one.
	 */
	let movedToIdeas = 0;
	if (plan.mode === 'dated') {
		const oldDates = new Set(
			plan.days.map((day) => day.date).filter((date): date is string => !!date)
		);
		for (const item of items) {
			if (!item.date || oldDates.has(item.date)) continue;
			if (item.date < startDate || item.date > endDate) movedToIdeas += 1;
		}
	}
	if (movedToIdeas > 0) {
		warnings.push({ code: 'items_to_ideas', params: { count: movedToIdeas } });
	}

	let bookingShiftDays: number | null = null;
	if (options.moveBookings && anchors.length > 0) {
		const baseline =
			plan.mode === 'dated'
				? (plan.days[0]?.date ?? startDate)
				: (anchors[0]?.startDate ?? startDate);
		bookingShiftDays = dayDelta(baseline, startDate);
		warnings.push({
			code: 'booking_shift',
			params: { count: anchors.length, days: bookingShiftDays }
		});
	}

	return {
		mode: plan.mode,
		startDate,
		endDate,
		days: previewDays,
		anchors: previewAnchors,
		warnings,
		movedToIdeas,
		bookingShiftDays,
		valid: true
	};
}

/**
 * Score candidate start dates by how many weekday wishes they satisfy.
 * Returns at most three, closest to the chosen start first on ties. When the
 * plan has no wishes there is nothing to optimise, so there are no suggestions.
 */
export function suggestStartDates(
	plan: DayPlan,
	chosen: string,
	anchors: readonly Anchor[] = [],
	radius = 7
): string[] {
	if (!plan.days.some((day) => day.weekdayHint != null)) return [];
	if (!isIsoDate(chosen)) return [];

	const candidates: { start: string; missed: number; outside: number; distance: number }[] = [];
	for (let shift = -radius; shift <= radius; shift += 1) {
		const start = shiftIsoDate(chosen, shift);
		if (!start) continue;
		const preview = previewSetDates(plan, [], { startDate: start }, anchors);
		if (!preview.valid) continue;
		candidates.push({
			start,
			missed: preview.days.filter((day) => !day.hintMet).length,
			outside: preview.anchors.filter((anchor) => !anchor.inRange).length,
			distance: Math.abs(shift)
		});
	}

	return candidates
		.sort(
			(a, b) =>
				a.missed - b.missed ||
				a.outside - b.outside ||
				a.distance - b.distance ||
				a.start.localeCompare(b.start)
		)
		.slice(0, 3)
		.map((candidate) => candidate.start);
}
