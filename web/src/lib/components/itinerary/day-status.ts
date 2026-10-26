import { analyseDay } from '$lib/db';
import type { ItineraryItem } from '$lib/db';
import type { DayTimeline } from '$lib/db/repositories/itinerary';

/**
 * The itinerary items a day holds, in timeline order.
 *
 * A day's lanes are two different shapes: `allDay` holds bare items while
 * `timed` holds `TimelineEntry` wrappers that may also be flights or
 * reservations. Both the page's trip-wide item list and the workspace's map
 * want only the itinerary items, so the narrowing lives here rather than being
 * repeated at each call site.
 */
export function dayItems(day: DayTimeline): ItineraryItem[] {
	const items = [...day.allDay];
	for (const entry of day.timed) {
		if (entry.kind === 'item' && entry.item) items.push(entry.item);
	}
	return items;
}

/** How many itinerary items a day holds — the number the day rail shows. */
export function dayItemCount(day: DayTimeline): number {
	return dayItems(day).length;
}

/** The worst thing `analyseDay` has to say about a day, in one word. */
export type DayStatus = 'overlap' | 'tight' | 'calm' | null;

/**
 * The day's feasibility status for compact surfaces such as the day rail.
 *
 * Mirrors `DayFeasibility`'s priority: an overlap outranks a tight hand-off,
 * and a day with no timed items has nothing to report. `null` rather than
 * `'calm'` is what keeps the rail quiet on an empty day.
 */
export function dayStatus(day: DayTimeline): DayStatus {
	const timedItems = dayItems(day).filter((item) => !item.allDay && item.startTime);
	if (timedItems.length === 0) return null;

	const report = analyseDay(timedItems);
	if (report.overlaps.length > 0) return 'overlap';
	if (report.tightGaps.length > 0) return 'tight';
	return 'calm';
}
