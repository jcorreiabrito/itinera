import { describe, expect, it } from 'vitest';

import {
	anchorsFor,
	buildPlan,
	previewSetDates,
	suggestStartDates,
	type PlacementItem
} from './date-assignment';
import type { Flight, Reservation } from './schemas';

const stamp = {
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	deletedAt: null,
	schemaVersion: 1
};

const dreamTrip = {
	dateMode: 'dream' as const,
	startDate: undefined,
	endDate: undefined,
	dreamDayCount: 3
};

const datedTrip = {
	dateMode: 'dated' as const,
	startDate: '2026-03-01',
	endDate: '2026-03-03',
	dreamDayCount: undefined
};

const items: PlacementItem[] = [
	{ _id: 'itin:1', date: null, dayOrdinal: 2 },
	{ _id: 'itin:2', date: null, dayOrdinal: null }
];

describe('buildPlan', () => {
	it('builds numbered dream days with their wishes and counts', () => {
		const plan = buildPlan(dreamTrip, items, [{ ordinal: 2, weekdayHint: 6, title: 'Market day' }]);
		expect(plan.mode).toBe('dream');
		expect(plan.days).toHaveLength(3);
		expect(plan.days[1]).toMatchObject({
			ordinal: 2,
			key: 'dream-2',
			date: null,
			weekdayHint: 6,
			title: 'Market day',
			itemCount: 1,
			empty: false
		});
		expect(plan.days[0]).toMatchObject({ key: 'dream-1', itemCount: 0, empty: true });
	});

	it('builds dated days from the range, in order', () => {
		const plan = buildPlan(datedTrip, [{ _id: 'itin:3', date: '2026-03-02' }]);
		expect(plan.mode).toBe('dated');
		expect(plan.days.map((day) => day.key)).toEqual(['2026-03-01', '2026-03-02', '2026-03-03']);
		expect(plan.days[1]).toMatchObject({ ordinal: 2, date: '2026-03-02', itemCount: 1 });
	});

	it('returns no days for a malformed dated range', () => {
		const plan = buildPlan({ ...datedTrip, endDate: '2026-02-01' }, []);
		expect(plan.days).toEqual([]);
	});
});

describe('anchorsFor', () => {
	const flight = {
		...stamp,
		_id: 'flt:1',
		type: 'flight',
		bookingRef: 'ABC',
		segments: [
			{
				flightNumber: 'AF1',
				from: { code: 'LIS' },
				to: { code: 'CDG' },
				departLocal: '2026-03-01T08:00:00',
				arriveLocal: '2026-03-01T11:00:00'
			}
		],
		attachmentIds: [],
		order: 0,
		costType: 'total'
	} satisfies Flight;

	const hotel = {
		...stamp,
		_id: 'res:1',
		type: 'reservation',
		name: 'Hotel',
		kind: 'lodging',
		start: '2026-03-01T14:00:00',
		end: '2026-03-05T12:00:00',
		details: {},
		attachmentIds: [],
		order: 0,
		costType: 'total'
	} satisfies Reservation;

	it('reads flights and reservations into date ranges, sorted by start', () => {
		const anchors = anchorsFor([flight], [hotel]);
		expect(anchors).toHaveLength(2);
		expect(anchors[0]).toMatchObject({
			kind: 'flight',
			label: 'AF1 LIS → CDG',
			startDate: '2026-03-01',
			endDate: '2026-03-01'
		});
		expect(anchors[1]).toMatchObject({
			kind: 'reservation',
			label: 'Hotel',
			startDate: '2026-03-01',
			endDate: '2026-03-05'
		});
	});

	it('skips documents without dates', () => {
		const undated = { ...hotel, start: null, end: null } satisfies Reservation;
		expect(anchorsFor([], [undated])).toEqual([]);
	});
});

describe('previewSetDates (dream)', () => {
	const plan = buildPlan(dreamTrip, items, [{ ordinal: 2, weekdayHint: 6 }]);

	it('maps ordinals onto consecutive dates and flags a missed wish', () => {
		const preview = previewSetDates(plan, items, { startDate: '2026-03-02' });
		expect(preview.valid).toBe(true);
		expect(preview.days.map((day) => day.date)).toEqual(['2026-03-02', '2026-03-03', '2026-03-04']);
		expect(preview.days[1].hintMet).toBe(false);
		expect(preview.warnings).toContainEqual({
			code: 'weekday_missed',
			params: { ordinal: 2, date: '2026-03-03', hint: 6 }
		});
		expect(preview.movedToIdeas).toBe(0);
		expect(preview.endDate).toBe('2026-03-04');
	});

	it('honours a per-day offset and satisfies the wish', () => {
		// A day is inserted before Day 2, so Day 3 and later shift with it.
		const preview = previewSetDates(plan, items, {
			startDate: '2026-03-02',
			offsets: { 2: 4, 3: 4 }
		});
		expect(preview.days.map((day) => day.date)).toEqual(['2026-03-02', '2026-03-07', '2026-03-08']);
		expect(preview.days[1].hintMet).toBe(true);
	});

	it('rejects decreasing or negative offsets', () => {
		expect(
			previewSetDates(plan, items, { startDate: '2026-03-02', offsets: { 2: -1 } }).valid
		).toBe(false);
		expect(
			previewSetDates(plan, items, { startDate: '2026-03-02', offsets: { 1: 2, 2: 1 } }).valid
		).toBe(false);
	});

	it('flags out-of-range anchors and computes the booking shift', () => {
		const anchors = anchorsFor(
			[],
			[
				{
					...stamp,
					_id: 'res:2',
					type: 'reservation',
					name: 'Hotel',
					start: '2026-03-01T14:00:00',
					end: '2026-03-05T12:00:00',
					details: {},
					attachmentIds: [],
					order: 0,
					costType: 'total'
				} satisfies Reservation
			]
		);
		const preview = previewSetDates(
			plan,
			items,
			{
				startDate: '2026-06-01',
				moveBookings: true
			},
			anchors
		);
		expect(preview.anchors[0].inRange).toBe(false);
		expect(preview.warnings).toContainEqual({
			code: 'anchor_outside',
			params: { label: 'Hotel', startDate: '2026-03-01', endDate: '2026-03-05' }
		});
		expect(preview.bookingShiftDays).toBe(92); // 2026-03-01 → 2026-06-01
		expect(preview.warnings.some((warning) => warning.code === 'booking_shift')).toBe(true);
	});
});

describe('previewSetDates (dated)', () => {
	const plan = buildPlan(datedTrip, []);
	const reDateItems: PlacementItem[] = [
		{ _id: 'itin:in', date: '2026-03-02' },
		{ _id: 'itin:out', date: '2026-02-20' },
		{ _id: 'itin:ideas', date: null }
	];

	it('keeps in-range items mapped to their ordinal', () => {
		const preview = previewSetDates(plan, reDateItems, { startDate: '2026-04-01' });
		expect(preview.days.map((day) => day.date)).toEqual(['2026-04-01', '2026-04-02', '2026-04-03']);
		expect(preview.movedToIdeas).toBe(1);
		expect(preview.warnings).toContainEqual({
			code: 'items_to_ideas',
			params: { count: 1 }
		});
	});
});

describe('suggestStartDates', () => {
	const plan = buildPlan(dreamTrip, [], [{ ordinal: 2, weekdayHint: 6 }]);

	it('finds a start that satisfies the wish', () => {
		const suggestions = suggestStartDates(plan, '2026-03-02');
		expect(suggestions).toHaveLength(3);
		const best = previewSetDates(plan, [], { startDate: suggestions[0] });
		expect(best.days.every((day) => day.hintMet)).toBe(true);
	});

	it('returns nothing when there are no wishes', () => {
		const noWishes = buildPlan(dreamTrip, [], []);
		expect(suggestStartDates(noWishes, '2026-03-02')).toEqual([]);
	});
});
