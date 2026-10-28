import { describe, expect, it } from 'vitest';
import type { ItineraryItem } from '../schemas';
import { laneNeighbour, type DayTimeline, type TimelineEntry } from './itinerary';

/**
 * Which item "move up" moves past.
 *
 * The bug this replaces was invisible: the buttons rendered, disabled, on almost
 * every day. The old rule grouped an item with the others sharing its exact
 * start time, so a day whose items all had distinct times — a normal day — gave
 * every item a group of one and no direction was ever available. These tests
 * pin the rule to the lanes the timeline actually renders.
 */

let seq = 0;
const item = (over: Partial<ItineraryItem> & { startTime?: string }): ItineraryItem =>
	({ _id: `i${++seq}`, type: 'itineraryItem', order: seq, ...over }) as ItineraryItem;

const entry = (it: ItineraryItem, minutes: number | null): TimelineEntry => ({
	kind: 'item',
	minutes,
	order: it.order ?? 0,
	item: it
});

/** Only the two lanes matter here; the rest is filled in so the type holds. */
const day = (allDay: ItineraryItem[], timed: TimelineEntry[]): DayTimeline => ({
	key: '2026-05-01',
	kind: 'dated',
	date: '2026-05-01',
	ordinal: 1,
	weekdayHint: null,
	day: null,
	todos: [],
	allDay,
	timed,
	subtotal: { estimate: 0, actual: 0, spent: 0, unpaid: 0, missingRateCount: 0 }
});

describe('laneNeighbour', () => {
	it('moves past the next item when every item has its own time', () => {
		const a = item({ startTime: '09:00' });
		const b = item({ startTime: '11:00' });
		const c = item({ startTime: '14:00' });
		const d = day([], [entry(a, 540), entry(b, 660), entry(c, 840)]);

		expect(laneNeighbour(d, b, 'up')).toBe(a);
		expect(laneNeighbour(d, b, 'down')).toBe(c);
		expect(laneNeighbour(d, a, 'up')).toBeNull();
		expect(laneNeighbour(d, c, 'down')).toBeNull();
	});

	it('moves past the next item, not the next timeline entry', () => {
		// A flight sits between the two items. It is not an item and cannot be
		// reordered, so "up" from the later item reaches the earlier one.
		const a = item({ startTime: '09:00' });
		const b = item({ startTime: '14:00' });
		const flight: TimelineEntry = {
			kind: 'flight',
			minutes: 660,
			order: 0,
			flight: {} as never
		};
		const d = day([], [entry(a, 540), flight, entry(b, 840)]);

		expect(laneNeighbour(d, b, 'up')).toBe(a);
		expect(laneNeighbour(d, a, 'down')).toBe(b);
	});

	it('crosses between the untimed and timed halves, which trade places', () => {
		// The lane is `[...untimed, ...timed]`, so an untimed item is "above" a
		// timed one and moving up means handing over the time.
		const loose = item({});
		const fixed = item({ startTime: '09:00' });
		const d = day([], [entry(loose, null), entry(fixed, 540)]);

		expect(laneNeighbour(d, fixed, 'up')).toBe(loose);
		expect(laneNeighbour(d, loose, 'down')).toBe(fixed);
	});

	it('keeps the all-day lane to itself', () => {
		const breakfast = item({ allDay: true });
		const museum = item({ allDay: true });
		const timed = item({ startTime: '09:00' });
		const d = day([breakfast, museum], [entry(timed, 540)]);

		// The timed item is not a neighbour of an all-day item, in either direction.
		expect(laneNeighbour(d, breakfast, 'down')).toBe(museum);
		expect(laneNeighbour(d, museum, 'down')).toBeNull();
		expect(laneNeighbour(d, timed, 'up')).toBeNull();
	});

	it('has no neighbour for an item that is not on this day', () => {
		const elsewhere = item({ startTime: '09:00' });
		const d = day([], [entry(item({ startTime: '10:00' }), 600)]);

		expect(laneNeighbour(d, elsewhere, 'up')).toBeNull();
		expect(laneNeighbour(d, elsewhere, 'down')).toBeNull();
	});

	it('is a no-op for a lane of one', () => {
		const only = item({ startTime: '09:00' });
		const d = day([], [entry(only, 540)]);

		expect(laneNeighbour(d, only, 'up')).toBeNull();
		expect(laneNeighbour(d, only, 'down')).toBeNull();
	});
});
