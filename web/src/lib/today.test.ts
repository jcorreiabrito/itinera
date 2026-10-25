/**
 * Unit tests for $lib/today.ts – the pure Now-card maths.
 *
 * Times are built as local wall-clock strings, exactly as the itinerary stores
 * them, so these cases read like a day on the traveller's phone.
 */

import { describe, expect, it } from 'vitest';
import { minutesOfDay } from '$lib/db/datetime';
import type { Flight, FlightSegment, ItineraryItem, Reservation } from '$lib/db';
import type { DayTimeline, TimelineEntry } from '$lib/db/repositories/itinerary';
import { computeNowState, entrySpan, flightsOn, localNowIso, reservationsOn } from './today';

function itemEntry(
	start: string | undefined,
	end: string | undefined,
	title = 'Museum'
): TimelineEntry {
	return {
		kind: 'item',
		minutes: minutesOfDay(start),
		order: 0,
		item: { title, startTime: start, endTime: end } as unknown as ItineraryItem
	};
}

function allDayItem(title: string): ItineraryItem {
	return { title, allDay: true } as unknown as ItineraryItem;
}

function flightEntry(depart: string, arrive: string, dayOffset = 0): TimelineEntry {
	return {
		kind: 'flight',
		minutes: minutesOfDay(depart),
		order: 0,
		flight: {
			flight: { _id: 'f1' } as Flight,
			segment: {
				departLocal: `2026-06-05T${depart}`,
				arriveLocal: `2026-06-05T${arrive}`
			} as FlightSegment,
			computed: { arrivalDayOffset: dayOffset },
			segmentIndex: 0
		} as unknown as TimelineEntry['flight']
	};
}

function reservationEntry(time: string): TimelineEntry {
	return {
		kind: 'reservation',
		minutes: minutesOfDay(time),
		order: 0,
		reservation: {
			reservation: { _id: 'r1', name: 'Hotel' } as Reservation,
			placement: 'checkIn',
			time
		}
	};
}

function day(date: string, timed: TimelineEntry[] = [], allDay: ItineraryItem[] = []): DayTimeline {
	return {
		date,
		day: null,
		todos: [],
		allDay,
		timed,
		subtotal: { estimate: 0, actual: 0, spent: 0, unpaid: 0, missingRateCount: 0 }
	};
}

const TRIP_DAYS = [day('2026-06-05'), day('2026-06-06'), day('2026-06-07')];

describe('computeNowState phases', () => {
	it('reports nodates when the trip has no dated days', () => {
		const state = computeNowState([], '2026-06-05T10:00:00');
		expect(state.phase).toBe('nodates');
		expect(state.current).toBeNull();
		expect(state.next).toBeNull();
	});

	it('reports before on a day earlier than the first day', () => {
		const state = computeNowState(TRIP_DAYS, '2026-06-01T10:00:00');
		expect(state.phase).toBe('before');
		expect(state.current).toBeNull();
		expect(state.minutesUntilNext).toBeNull();
	});

	it('reports after on a day later than the last day', () => {
		const state = computeNowState(TRIP_DAYS, '2026-06-10T10:00:00');
		expect(state.phase).toBe('after');
	});

	it('reports during with a day inside the trip', () => {
		expect(computeNowState(TRIP_DAYS, '2026-06-06T10:00:00').phase).toBe('during');
	});

	it('reports during when the clock string is unreadable but dates exist', () => {
		const state = computeNowState(TRIP_DAYS, 'not-a-time');
		expect(state.phase).toBe('during');
		expect(state.current).toBeNull();
		expect(state.next).toBeNull();
	});
});

describe('computeNowState', () => {
	it('finds the item running now and how far through it is', () => {
		const days = [day('2026-06-05', [itemEntry('10:00', '12:00', 'Vatican')])];
		const state = computeNowState(days, '2026-06-05T11:00:00');

		expect(state.current?.item?.title).toBe('Vatican');
		expect(state.progress).toBe(0.5);
		expect(state.next).toBeNull();
		expect(state.minutesUntilNext).toBeNull();
	});

	it('counts down to the next item during a gap', () => {
		const days = [
			day('2026-06-05', [itemEntry('09:00', '10:00', 'Breakfast'), itemEntry('12:00', '13:00')])
		];
		const state = computeNowState(days, '2026-06-05T11:00:00');

		expect(state.current).toBeNull();
		expect(state.progress).toBeNull();
		expect(state.next?.item?.title).toBe('Museum');
		expect(state.minutesUntilNext).toBe(60);
	});

	it('keeps the next item visible while something is running', () => {
		const days = [
			day('2026-06-05', [itemEntry('10:00', '12:00', 'Vatican'), itemEntry('13:00', '14:00')])
		];
		const state = computeNowState(days, '2026-06-05T11:00:00');

		expect(state.current?.item?.title).toBe('Vatican');
		expect(state.next?.item?.title).toBe('Museum');
		expect(state.minutesUntilNext).toBe(120);
	});

	it('reports a finished day as neither current nor next', () => {
		const days = [day('2026-06-05', [itemEntry('09:00', '10:00')])];
		const state = computeNowState(days, '2026-06-05T18:00:00');

		expect(state.phase).toBe('during');
		expect(state.current).toBeNull();
		expect(state.next).toBeNull();
		expect(state.minutesUntilNext).toBeNull();
		expect(state.progress).toBeNull();
	});

	it('reports an empty day as neither current nor next', () => {
		const state = computeNowState([day('2026-06-05')], '2026-06-05T10:00:00');

		expect(state.current).toBeNull();
		expect(state.next).toBeNull();
		expect(state.minutesUntilNext).toBeNull();
	});

	it('ignores all-day entries when looking for what is on now', () => {
		const days = [day('2026-06-05', [], [allDayItem('Beach day')])];
		const state = computeNowState(days, '2026-06-05T10:00:00');

		expect(state.phase).toBe('during');
		expect(state.current).toBeNull();
		expect(state.next).toBeNull();
	});

	it('skips entries whose start time is missing or malformed', () => {
		const days = [
			day('2026-06-05', [itemEntry(undefined, undefined, 'Untimed'), itemEntry('abc', '12:00')])
		];
		const state = computeNowState(days, '2026-06-05T10:00:00');

		expect(state.current).toBeNull();
		expect(state.next).toBeNull();
	});

	it('treats an item with an unreadable end as a moment at its start', () => {
		const days = [day('2026-06-05', [itemEntry('10:00', 'oops', 'Open-ended')])];

		const atStart = computeNowState(days, '2026-06-05T10:00:00');
		expect(atStart.current?.item?.title).toBe('Open-ended');
		expect(atStart.progress).toBeNull();

		const later = computeNowState(days, '2026-06-05T10:01:00');
		expect(later.current).toBeNull();
	});

	it('does not run an item backwards when its end is before its start', () => {
		const days = [day('2026-06-05', [itemEntry('12:00', '11:00', 'Typo')])];
		const state = computeNowState(days, '2026-06-05T11:30:00');

		expect(state.current).toBeNull();
		expect(state.next?.item?.title).toBe('Typo');
		expect(state.minutesUntilNext).toBe(30);
	});

	it('runs an overnight flight until its arrival minute', () => {
		const days = [day('2026-06-05', [flightEntry('23:00', '01:00', 1)])];

		const duringFlight = computeNowState(days, '2026-06-05T23:30:00');
		expect(duringFlight.current?.kind).toBe('flight');
		expect(duringFlight.progress).toBeCloseTo(0.25);
	});

	it('prefers the most recently started entry when two overlap', () => {
		const days = [
			day('2026-06-05', [
				itemEntry('09:00', '17:00', 'Museum'),
				itemEntry('12:00', '13:00', 'Lunch')
			])
		];
		const state = computeNowState(days, '2026-06-05T12:30:00');

		expect(state.current?.item?.title).toBe('Lunch');
		expect(state.progress).toBe(0.5);
	});
});

describe('entrySpan', () => {
	it('reads an item start and end', () => {
		expect(entrySpan(itemEntry('10:00', '12:30'))).toEqual({ start: 600, end: 750 });
	});

	it('has no span for an untimed entry', () => {
		expect(entrySpan(itemEntry(undefined, undefined))).toBeNull();
	});

	it('pushes an overnight flight arrival past midnight', () => {
		expect(entrySpan(flightEntry('23:00', '01:00', 1))).toEqual({ start: 1380, end: 1500 });
	});

	it('treats a reservation as a moment', () => {
		expect(entrySpan(reservationEntry('15:00'))).toEqual({ start: 900, end: null });
	});
});

describe('flightsOn', () => {
	it('keeps flights with a leg departing on the day', () => {
		const today: Flight = {
			_id: 'a',
			segments: [{ departLocal: '2026-06-05T08:00' }]
		} as unknown as Flight;
		const tomorrow: Flight = {
			_id: 'b',
			segments: [{ departLocal: '2026-06-06T08:00' }]
		} as unknown as Flight;

		expect(flightsOn([today, tomorrow], '2026-06-05').map((f) => f._id)).toEqual(['a']);
	});
});

describe('reservationsOn', () => {
	const lodging = {
		_id: 'stay',
		kind: 'lodging',
		start: '2026-06-04T15:00',
		end: '2026-06-07T11:00'
	} as unknown as Reservation;
	const dinner = {
		_id: 'dinner',
		kind: 'restaurant',
		start: '2026-06-06T20:00'
	} as unknown as Reservation;
	const past = { _id: 'past', kind: 'car', start: '2026-06-01T09:00' } as unknown as Reservation;

	it('keeps a stay on every day it covers, ends included', () => {
		expect(reservationsOn([lodging], '2026-06-05').map((r) => r._id)).toEqual(['stay']);
		expect(reservationsOn([lodging], '2026-06-07').map((r) => r._id)).toEqual(['stay']);
		expect(reservationsOn([lodging], '2026-06-08')).toEqual([]);
	});

	it('keeps a single-day booking only on its day', () => {
		expect(reservationsOn([dinner], '2026-06-06').map((r) => r._id)).toEqual(['dinner']);
		expect(reservationsOn([dinner], '2026-06-05')).toEqual([]);
	});

	it('drops a booking with no end from later days', () => {
		expect(reservationsOn([past], '2026-06-05')).toEqual([]);
	});
});

describe('localNowIso', () => {
	it('formats the local wall clock, not UTC', () => {
		const date = new Date(2026, 5, 5, 9, 5, 7);
		expect(localNowIso(date)).toBe('2026-06-05T09:05:07');
	});
});
