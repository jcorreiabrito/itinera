import { describe, expect, it } from 'vitest';
import type { ItineraryItem } from '$lib/db';
import type { DayTimeline, TimelineEntry } from '$lib/db/repositories/itinerary';
import { dayItemCount, dayItems, dayStatus } from './day-status';

let seq = 0;

function item(over: Partial<ItineraryItem> = {}): ItineraryItem {
	seq += 1;
	return { _id: `item-${seq}`, type: 'itineraryItem', order: 0, ...over } as ItineraryItem;
}

function timed(entry: ItineraryItem): TimelineEntry {
	return { kind: 'item', minutes: 540, order: 0, item: entry };
}

function day(over: Partial<DayTimeline> = {}): DayTimeline {
	return {
		key: '2026-10-25',
		kind: 'dated',
		date: '2026-10-25',
		ordinal: 1,
		weekdayHint: null,
		day: null,
		todos: [],
		allDay: [],
		timed: [],
		subtotal: { estimate: 0, actual: 0, spent: 0, unpaid: 0, missingRateCount: 0 },
		...over
	};
}

describe('dayItems', () => {
	it('collects all-day items and item entries, ignoring flights and reservations', () => {
		const breakfast = item({ title: 'Breakfast' });
		const museum = item({ title: 'Museum' });
		const flight = item({ title: 'Flight' });

		const result = dayItems(
			day({
				allDay: [breakfast],
				timed: [
					timed(museum),
					{ kind: 'flight', minutes: 600, order: 1 },
					{ kind: 'reservation', minutes: 720, order: 2 },
					timed(flight)
				]
			})
		);

		expect(result.map((entry) => entry._id)).toEqual([breakfast._id, museum._id, flight._id]);
	});

	it('is empty for an empty day', () => {
		expect(dayItems(day())).toEqual([]);
	});
});

describe('dayItemCount', () => {
	it('counts all-day and item entries but not other timeline kinds', () => {
		const count = dayItemCount(
			day({
				allDay: [item(), item()],
				timed: [timed(item()), { kind: 'flight', minutes: 600, order: 1 }]
			})
		);

		expect(count).toBe(3);
	});

	it('is zero when nothing is planned', () => {
		expect(dayItemCount(day())).toBe(0);
	});
});

describe('dayStatus', () => {
	it('is null when the day has no timed items', () => {
		expect(dayStatus(day({ allDay: [item()] }))).toBeNull();
		expect(dayStatus(day())).toBeNull();
	});

	it('reports an overlap ahead of a tight gap', () => {
		const status = dayStatus(
			day({
				timed: [
					timed(item({ startTime: '09:00', endTime: '10:30' })),
					timed(item({ startTime: '10:00', endTime: '11:00' })),
					timed(item({ startTime: '11:10', endTime: '12:00' }))
				]
			})
		);

		expect(status).toBe('overlap');
	});

	it('reports a tight gap when entries do not overlap', () => {
		const status = dayStatus(
			day({
				timed: [
					timed(item({ startTime: '09:00', endTime: '10:00' })),
					timed(item({ startTime: '10:10', endTime: '11:00' }))
				]
			})
		);

		expect(status).toBe('tight');
	});

	it('is calm when entries are comfortably spaced', () => {
		const status = dayStatus(
			day({
				timed: [
					timed(item({ startTime: '09:00', endTime: '10:00' })),
					timed(item({ startTime: '11:00', endTime: '12:00' }))
				]
			})
		);

		expect(status).toBe('calm');
	});
});
