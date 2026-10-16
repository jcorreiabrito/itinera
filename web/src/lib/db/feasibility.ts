/**
 * Day feasibility – the arithmetic a plan has to survive.
 *
 * A day can be impossible in ways the eye skips over when the list is long:
 * two things booked for the same hour, a museum that ends after the train
 * leaves, a gap of four minutes to cross a city. Nothing here knows about
 * travel times or opening hours — it only knows what the plan itself claims, so
 * it reports the contradictions the plan contains rather than judging the plan.
 *
 * Pure, like `money.ts` and `pace.ts`: testable without PouchDB and reusable by
 * the itinerary, the print view and a future Today screen.
 */

import { minutesOfDay } from './datetime';

/** The fields of one scheduled entry this module reads. */
export interface ScheduledEntry {
	_id?: string;
	title?: string | null;
	/** `HH:mm`, `HH:mm:ss` or a full ISO datetime. */
	startTime?: string | null;
	endTime?: string | null;
	/** All-day entries take no part in the schedule and are never flagged. */
	allDay?: boolean | null;
	order?: number | null;
}

/** One entry with its times resolved to minutes-since-midnight. */
export interface TimedEntry {
	entry: ScheduledEntry;
	start: number;
	end: number;
}

/** Two entries that cannot both happen as written. */
export interface Overlap {
	a: TimedEntry;
	b: TimedEntry;
	/** Minutes the two share. */
	minutes: number;
}

/** Two entries that follow each other with less room than `minTransferMinutes`. */
export interface TightGap {
	before: TimedEntry;
	after: TimedEntry;
	/** Minutes between the end of one and the start of the next. */
	minutes: number;
}

/** The verdict for one day. */
export interface DayFeasibility {
	/** Entries with a usable start time, in order. */
	timed: TimedEntry[];
	/** Entries that claim a time the module cannot read, or none at all. */
	unscheduled: ScheduledEntry[];
	overlaps: Overlap[];
	tightGaps: TightGap[];
	/** First start to last end, in minutes. */
	spanMinutes: number;
	/** Sum of the durations — the time the day actually claims to fill. */
	scheduledMinutes: number;
	/** True when any overlap exists: the day cannot happen as written. */
	conflicted: boolean;
}

/** Options for {@link analyseDay}. */
export interface DayOptions {
	/** Below this many minutes between two entries, the hand-off is flagged. */
	minTransferMinutes?: number;
}

const DEFAULT_TRANSFER_MINUTES = 15;

/**
 * An end time is optional, and plenty of items are "lunch at 13:00" with no
 * stated finish. Those get a nominal duration rather than an infinite one:
 * treating them as zero-length hides the overlap with the 13:30 tour, and
 * treating them as open-ended flags everything after them.
 */
const ASSUMED_DURATION_MINUTES = 60;

function resolve(entry: ScheduledEntry): TimedEntry | null {
	const start = minutesOfDay(entry.startTime);
	if (start == null) return null;
	const end = minutesOfDay(entry.endTime);
	// An end before the start is a typo, not a negative duration.
	return { entry, start, end: end != null && end > start ? end : start + ASSUMED_DURATION_MINUTES };
}

/** Order by start time, then by the itinerary's own `order`. */
function byStart(a: TimedEntry, b: TimedEntry): number {
	if (a.start !== b.start) return a.start - b.start;
	return (a.entry.order ?? 0) - (b.entry.order ?? 0);
}

/**
 * Check one day's plan against itself.
 *
 * Overlaps are reported in full rather than stopped at the first: a day with
 * three clashing bookings is one mistake made three ways, and the person fixing
 * it wants to see all of them at once.
 */
export function analyseDay(
	entries: ScheduledEntry[],
	{ minTransferMinutes = DEFAULT_TRANSFER_MINUTES }: DayOptions = {}
): DayFeasibility {
	const timed: TimedEntry[] = [];
	const unscheduled: ScheduledEntry[] = [];

	for (const entry of entries) {
		if (entry.allDay) continue;
		const resolved = resolve(entry);
		if (resolved) timed.push(resolved);
		else unscheduled.push(entry);
	}
	timed.sort(byStart);

	const overlaps: Overlap[] = [];
	const tightGaps: TightGap[] = [];

	for (let i = 0; i < timed.length; i++) {
		for (let j = i + 1; j < timed.length; j++) {
			const a = timed[i];
			const b = timed[j];
			// Sorted by start, so an overlap is the shared tail of `a` and `b`.
			const shared = Math.min(a.end, b.end) - b.start;
			if (shared > 0) overlaps.push({ a, b, minutes: shared });
		}
	}

	for (let i = 1; i < timed.length; i++) {
		const before = timed[i - 1];
		const after = timed[i];
		const gap = after.start - before.end;
		// A negative gap is an overlap, already reported as one.
		if (gap >= 0 && gap < minTransferMinutes) tightGaps.push({ before, after, minutes: gap });
	}

	const scheduledMinutes = timed.reduce((total, t) => total + (t.end - t.start), 0);
	const spanMinutes = timed.length ? timed[timed.length - 1].end - timed[0].start : 0;

	return {
		timed,
		unscheduled,
		overlaps,
		tightGaps,
		spanMinutes,
		scheduledMinutes,
		conflicted: overlaps.length > 0
	};
}
