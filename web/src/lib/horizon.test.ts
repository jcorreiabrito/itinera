/**
 * Unit tests for $lib/horizon.ts — the home page's cross-trip timeline.
 *
 * Dates are plain ISO days and the counts are supplied by the caller, so the
 * clock and the database never enter the tests: each case pins the window
 * maths and the planning-gap rules down on its own data.
 */

import { describe, expect, it } from 'vitest';
import {
	computeHorizon,
	countPlanning,
	type HorizonCounts,
	type HorizonTrip,
	type HorizonTripCounts
} from './horizon';

const TODAY = '2026-10-25';
const TOTAL_DAYS = 182; // Oct 2026 through Mar 2027

function trip(overrides: Partial<HorizonTrip> & Pick<HorizonTrip, '_id'>): HorizonTrip {
	return { title: overrides._id, ...overrides };
}

const CLEAN_COUNTS: HorizonTripCounts = {
	itineraryItems: 2,
	checklistItems: 3,
	lodgingReservations: 1
};

function cleanCounts(tripId: string): HorizonCounts {
	return { [tripId]: CLEAN_COUNTS };
}

describe('computeHorizon', () => {
	it('returns the six-month window even with no trips', () => {
		const result = computeHorizon([], {}, TODAY);

		expect(result.bars).toEqual([]);
		expect(result.upcoming).toEqual([]);
		expect(result.undated).toEqual([]);
		expect(result.flags).toEqual({});
		expect(result.months).toHaveLength(6);
		expect(result.months[0]).toMatchObject({ start: '2026-10-01', end: '2026-10-31', days: 31 });
		expect(result.months[5]).toMatchObject({ start: '2027-03-01', end: '2027-03-31', days: 31 });
		expect(result.months[0].left).toBe(0);
		expect(result.months[5].left + result.months[5].width).toBeCloseTo(100, 3);
	});

	it('gives every month a column and the columns sum to the whole window', () => {
		const { months } = computeHorizon([], {}, TODAY);
		const total = months.reduce((sum, month) => sum + month.width, 0);

		expect(total).toBeCloseTo(100, 3);
		for (const month of months) {
			expect(month.width).toBeCloseTo((month.days / TOTAL_DAYS) * 100, 1);
		}
	});

	it('places a bar from its first day to its last day', () => {
		const id = 'trip:a';
		const result = computeHorizon(
			[trip({ _id: id, startDate: '2026-10-20', endDate: '2026-10-30' })],
			cleanCounts(id),
			TODAY
		);

		expect(result.bars).toHaveLength(1);
		expect(result.bars[0]).toMatchObject({ tripId: id, tone: 'active' });
		// 19 days into the window, 11 inclusive days long.
		expect(result.bars[0].left).toBeCloseTo((19 / TOTAL_DAYS) * 100, 2);
		expect(result.bars[0].width).toBeCloseTo((11 / TOTAL_DAYS) * 100, 2);
	});

	it('draws overlapping trips as separate bands, earliest first', () => {
		const trips = [
			trip({ _id: 'trip:b', startDate: '2026-11-05', endDate: '2026-11-12' }),
			trip({ _id: 'trip:a', startDate: '2026-10-20', endDate: '2026-10-30' }),
			trip({ _id: 'trip:c', startDate: '2026-10-28', endDate: '2026-11-04' })
		];
		const result = computeHorizon(trips, {}, TODAY);

		expect(result.bars.map((bar) => bar.tripId)).toEqual(['trip:a', 'trip:c', 'trip:b']);
		expect(result.bars[0].left).toBeLessThan(result.bars[1].left);
		expect(result.bars[1].left).toBeLessThan(result.bars[2].left);
	});

	it('lets a trip span months without splitting it', () => {
		const result = computeHorizon(
			[trip({ _id: 'trip:long', startDate: '2026-10-28', endDate: '2026-12-05' })],
			{},
			TODAY
		);

		expect(result.bars).toHaveLength(1);
		expect(result.bars[0].left).toBeCloseTo((27 / TOTAL_DAYS) * 100, 2);
		expect(result.bars[0].width).toBeCloseTo((39 / TOTAL_DAYS) * 100, 2);
	});

	it('clips a trip that starts before the window', () => {
		const result = computeHorizon(
			[trip({ _id: 'trip:early', startDate: '2026-09-20', endDate: '2026-10-05' })],
			{},
			TODAY
		);

		expect(result.bars[0].left).toBe(0);
		expect(result.bars[0].width).toBeCloseTo((5 / TOTAL_DAYS) * 100, 2);
	});

	it('excludes trips outside the window from the timeline but keeps them upcoming', () => {
		const result = computeHorizon(
			[trip({ _id: 'trip:later', startDate: '2027-06-01', endDate: '2027-06-10' })],
			{},
			TODAY
		);

		expect(result.bars).toEqual([]);
		expect(result.upcoming.map((entry) => entry.tripId)).toEqual(['trip:later']);
	});

	it('excludes a past trip from the timeline when it ended before the window', () => {
		const result = computeHorizon(
			[trip({ _id: 'trip:old', startDate: '2026-08-01', endDate: '2026-08-10' })],
			{},
			TODAY
		);

		expect(result.bars).toEqual([]);
		expect(result.upcoming).toEqual([]);
		expect(result.flags['trip:old']).toEqual([]);
	});

	it('keeps a past trip that falls inside the window, toned as past', () => {
		const result = computeHorizon(
			[trip({ _id: 'trip:gone', startDate: '2026-10-05', endDate: '2026-10-10' })],
			{},
			TODAY
		);

		expect(result.bars[0].tone).toBe('past');
		expect(result.upcoming).toEqual([]);
	});

	it('treats missing or reversed dates as undated rather than drawing them', () => {
		const result = computeHorizon(
			[
				trip({ _id: 'trip:none' }),
				trip({ _id: 'trip:half', startDate: '2026-11-01' }),
				trip({ _id: 'trip:reversed', startDate: '2026-12-10', endDate: '2026-12-01' })
			],
			{},
			TODAY
		);

		expect(result.bars).toEqual([]);
		expect(result.upcoming).toEqual([]);
		expect(result.undated.map((entry) => entry.tripId)).toEqual([
			'trip:none',
			'trip:half',
			'trip:reversed'
		]);
		expect(result.flags['trip:none']).toEqual(['no_dates']);
		expect(result.flags['trip:half']).toEqual(['no_dates']);
		expect(result.flags['trip:reversed']).toEqual(['no_dates']);
	});

	it('counts a trip starting today as active, with zero days until', () => {
		const id = 'trip:today';
		const result = computeHorizon(
			[trip({ _id: id, startDate: TODAY, endDate: '2026-10-27' })],
			{},
			TODAY
		);

		expect(result.bars[0].tone).toBe('active');
		expect(result.upcoming).toEqual([
			expect.objectContaining({ tripId: id, tone: 'active', daysUntil: 0 })
		]);
		expect(result.flags[id]).toContain('no_itinerary');
	});

	it('lists at most three current or future trips, earliest first', () => {
		const result = computeHorizon(
			[
				trip({ _id: 'trip:fourth', startDate: '2026-12-01', endDate: '2026-12-05' }),
				trip({ _id: 'trip:second', startDate: '2026-11-05', endDate: '2026-11-09' }),
				trip({ _id: 'trip:first', startDate: '2026-10-20', endDate: '2026-10-30' }),
				trip({ _id: 'trip:third', startDate: '2026-11-20', endDate: '2026-11-24' })
			],
			{},
			TODAY
		);

		expect(result.upcoming.map((entry) => entry.tripId)).toEqual([
			'trip:first',
			'trip:second',
			'trip:third'
		]);
	});
});

describe('planning flags', () => {
	it('reports no gaps for a trip with a plan, a checklist, a budget and a stay', () => {
		const id = 'trip:ready';
		const result = computeHorizon(
			[
				trip({
					_id: id,
					startDate: '2026-11-01',
					endDate: '2026-11-10',
					budget: { total: 1200 }
				})
			],
			cleanCounts(id),
			TODAY
		);

		expect(result.flags[id]).toEqual([]);
	});

	it('flags an imminent trip with no itinerary, checklist, budget or stay', () => {
		const id = 'trip:soon';
		const result = computeHorizon(
			[trip({ _id: id, startDate: '2026-10-30', endDate: '2026-11-04' })],
			{},
			TODAY
		);

		expect(result.flags[id]).toEqual(['no_itinerary', 'no_checklist', 'no_budget', 'no_lodging']);
	});

	it('does not flag an empty itinerary before the fourteen-day window', () => {
		const id = 'trip:far';
		const result = computeHorizon(
			[trip({ _id: id, startDate: '2026-12-20', endDate: '2026-12-27' })],
			{},
			TODAY
		);

		expect(result.flags[id]).not.toContain('no_itinerary');
		expect(result.flags[id]).toContain('no_checklist');
	});

	it('counts a budget set only by category or per-day as set', () => {
		const byCategory = computeHorizon(
			[
				trip({
					_id: 'trip:category',
					startDate: '2026-12-20',
					endDate: '2026-12-27',
					budget: { byCategory: { food: 200 } }
				})
			],
			{},
			TODAY
		);
		const perDay = computeHorizon(
			[
				trip({
					_id: 'trip:perday',
					startDate: '2026-12-20',
					endDate: '2026-12-27',
					budget: { perDay: 80 }
				})
			],
			{},
			TODAY
		);
		const empty = computeHorizon(
			[
				trip({
					_id: 'trip:empty',
					startDate: '2026-12-20',
					endDate: '2026-12-27',
					budget: { total: 0 }
				})
			],
			{},
			TODAY
		);

		expect(byCategory.flags['trip:category']).not.toContain('no_budget');
		expect(perDay.flags['trip:perday']).not.toContain('no_budget');
		expect(empty.flags['trip:empty']).toContain('no_budget');
	});

	it('does not chase gaps on a trip that is already over', () => {
		const id = 'trip:history';
		const result = computeHorizon(
			[trip({ _id: id, startDate: '2026-10-01', endDate: '2026-10-03' })],
			{},
			TODAY
		);

		expect(result.flags[id]).toEqual([]);
	});
});

describe('countPlanning', () => {
	it('folds the three document scans into per-trip counts', () => {
		const counts = countPlanning(
			[{ tripid: 'trip:a' }, { tripid: 'trip:a' }, { tripid: 'trip:b' }, {}],
			[{ tripid: 'trip:a' }],
			[
				{ tripid: 'trip:a', kind: 'lodging' },
				{ tripid: 'trip:a', kind: 'restaurant' },
				{ tripid: 'trip:b', kind: 'lodging' }
			]
		);

		expect(counts['trip:a']).toEqual({
			itineraryItems: 2,
			checklistItems: 1,
			lodgingReservations: 1
		});
		expect(counts['trip:b']).toEqual({
			itineraryItems: 1,
			checklistItems: 0,
			lodgingReservations: 1
		});
		expect(Object.keys(counts)).toHaveLength(2);
	});
});
