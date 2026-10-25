/**
 * Today mode – what is happening now, what comes next, and how far through it we
 * are.
 *
 * Pure on purpose: the page owns the clock and passes the current *local* wall
 * time in, because that is how itinerary days store their times (`startTime`,
 * `departLocal`, a reservation's `start`). There is no time-zone conversion here
 * and no `Date.now()` call, so the Now card can be pinned down in tests the same
 * way `$lib/overview.ts` is.
 */

import { dateOf, minutesOfDay } from '$lib/db/datetime';
import type { Flight, Reservation } from '$lib/db';
import type { DayTimeline, TimelineEntry } from '$lib/db/repositories/itinerary';

/** Where a trip sits relative to today. */
export type TodayPhase = 'before' | 'during' | 'after' | 'nodates';

/** A timed entry's span on the day's clock, in minutes since midnight. */
export interface EntrySpan {
	start: number;
	/** `null` for a moment (a check-in, a table) rather than a span. */
	end: number | null;
}

/** The Now card's whole input, reduced to five values. */
export interface NowState {
	/** The timed entry running at the given instant, if any. */
	current: TimelineEntry | null;
	/** The next timed entry to start, if any. */
	next: TimelineEntry | null;
	/** Whole minutes until `next` starts; `null` when the day has nothing left. */
	minutesUntilNext: number | null;
	/** How far through `current` we are (`0..1`), when it has a known end. */
	progress: number | null;
	phase: TodayPhase;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The span a timeline entry occupies, in minutes since the day's midnight.
 *
 * All-day and untimed entries have no span (`null`): they are ordered by hand,
 * not by the clock, and the Now card must not treat them as "running". An item
 * or flight with no usable end is a moment from the clock's point of view — it
 * is current only in its starting minute. An arrival that crosses midnight is
 * pushed past 1440 so the span stays positive.
 */
export function entrySpan(entry: TimelineEntry): EntrySpan | null {
	if (entry.minutes == null) return null;
	const start = entry.minutes;

	if (entry.kind === 'item' && entry.item) {
		const end = minutesOfDay(entry.item.endTime);
		return { start, end: end != null && end > start ? end : null };
	}

	if (entry.kind === 'flight' && entry.flight) {
		const arrive = minutesOfDay(entry.flight.segment.arriveLocal);
		if (arrive == null) return { start, end: null };
		const dayOffset = entry.flight.computed?.arrivalDayOffset ?? 0;
		const end = arrive + Math.max(0, dayOffset) * 1440;
		return { start, end: end > start ? end : null };
	}

	return { start, end: null };
}

/** Pick the phase from the trip's own days, never from a stored flag. */
function phaseFor(days: readonly DayTimeline[], todayDate: string): TodayPhase {
	let first: string | null = null;
	let last: string | null = null;

	for (const day of days) {
		if (!day.date) continue;
		if (first === null || day.date < first) first = day.date;
		if (last === null || day.date > last) last = day.date;
	}

	if (first === null || last === null) return 'nodates';
	// A clock we cannot read should not be reported as "before" or "after".
	if (!ISO_DATE.test(todayDate)) return 'during';
	if (todayDate < first) return 'before';
	if (todayDate > last) return 'after';
	return 'during';
}

/**
 * Resolve the Now card for the trip's days at `nowIso`.
 *
 * `nowIso` is a local wall-clock ISO datetime (`YYYY-MM-DDTHH:mm:ss`); a
 * date-only value is read as midnight. Times that cannot be parsed are ignored
 * rather than guessed at: the entry simply stays out of the timed lane.
 */
export function computeNowState(days: readonly DayTimeline[], nowIso: string): NowState {
	const todayDate = dateOf(nowIso);
	const phase = todayDate ? phaseFor(days, todayDate) : 'during';
	const idle: NowState = {
		current: null,
		next: null,
		minutesUntilNext: null,
		progress: null,
		phase
	};

	if (phase !== 'during' || !todayDate || !ISO_DATE.test(todayDate)) return idle;

	const day = days.find((candidate) => candidate.date === todayDate);
	const now = minutesOfDay(nowIso) ?? 0;

	const spans = (day?.timed ?? [])
		.map((entry) => {
			const span = entrySpan(entry);
			return span ? { entry, start: span.start, end: span.end } : null;
		})
		.filter(
			(value): value is { entry: TimelineEntry; start: number; end: number | null } =>
				value !== null
		)
		.sort((a, b) => a.start - b.start);

	let current: { entry: TimelineEntry; start: number; end: number | null } | null = null;
	for (const candidate of spans) {
		if (candidate.start > now) break;
		const running =
			candidate.end == null
				? now === candidate.start
				: now >= candidate.start && now < candidate.end;
		// Overlaps are resolved towards the event that started most recently: that
		// is the one the traveller is actually in the middle of.
		if (running && (current == null || candidate.start >= current.start)) current = candidate;
	}

	const next = spans.find((candidate) => candidate.start > now) ?? null;

	return {
		current: current?.entry ?? null,
		next: next?.entry ?? null,
		minutesUntilNext: next ? next.start - now : null,
		progress:
			current?.end != null && current.end > current.start
				? Math.min(1, Math.max(0, (now - current.start) / (current.end - current.start)))
				: null,
		phase
	};
}

/** Flights with at least one leg departing on `date`. */
export function flightsOn(list: readonly Flight[], date: string): Flight[] {
	return list.filter((flight) =>
		(flight.segments ?? []).some((segment) => dateOf(segment.departLocal) === date)
	);
}

/**
 * Reservations that matter on `date`: the ones starting that day, plus any with
 * an end date that is still covering the day (a hotel on the second night, a car
 * picked up yesterday).
 */
export function reservationsOn(list: readonly Reservation[], date: string): Reservation[] {
	return list.filter((reservation) => {
		const start = dateOf(reservation.start);
		if (!start) return false;
		const end = dateOf(reservation.end);
		if (end) return start <= date && date <= end;
		return start === date;
	});
}

/**
 * The current local wall-clock time as `YYYY-MM-DDTHH:mm:ss`.
 *
 * Deliberately not `toISOString()`: that renders UTC, while every stored day
 * time is the traveller's local clock. A trip in Lisbon read from São Paulo
 * must not believe lunch is at 15:00.
 */
export function localNowIso(date: Date = new Date()): string {
	const pad = (value: number) => String(value).padStart(2, '0');
	return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}
