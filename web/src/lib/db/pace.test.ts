import { describe, expect, it } from 'vitest';
import { forecastPace, type PaceTrip } from './pace';
import type { ExpenseLike } from './money';

/**
 * The pace forecast, pinned on the cases where a naive
 * `spent / daysElapsed × totalDays` gives a wrong or misleading answer — most
 * importantly a trip whose flights were paid for months in advance.
 */

const TRIP: PaceTrip = {
	startDate: '2026-11-02',
	endDate: '2026-11-11', // ten days
	homeCurrency: 'EUR',
	travelerCount: 1,
	budget: { total: 1000 }
};

const expense = (over: Partial<ExpenseLike> = {}): ExpenseLike => ({
	amountActual: 100,
	currency: 'EUR',
	paid: true,
	...over
});

/** `n` expenses of `amount` on `date`. */
const spendOn = (date: string, amount: number, n = 1): ExpenseLike[] =>
	Array.from({ length: n }, () => expense({ amountActual: amount, date }));

describe('before the trip', () => {
	it('reports the spend but no rate and no projection', () => {
		const pace = forecastPace(spendOn('2026-10-01', 300), TRIP, '2026-10-16');

		expect(pace.state).toBe('before');
		expect(pace.daysElapsed).toBe(0);
		expect(pace.daysRemaining).toBe(10);
		expect(pace.spent).toBe(300);
		expect(pace.outsideSpend).toBe(300);
		expect(pace.perDayRate).toBeNull();
		expect(pace.projectedTotal).toBeNull();
		// The whole budget is still ahead, spread over every day of the trip.
		expect(pace.perDayAllowance).toBe(70);
	});

	it('flags a trip whose bookings already exceed the budget', () => {
		const pace = forecastPace(spendOn('2026-10-01', 1400), TRIP, '2026-10-16');
		expect(pace.state).toBe('over');
		expect(pace.perDayAllowance).toBe(-40);
	});
});

describe('a pre-paid flight', () => {
	it('does not inflate the daily rate on day one', () => {
		// €600 of flights booked in March, then €50 on the first day.
		const expenses = [...spendOn('2026-03-01', 600), ...spendOn('2026-11-02', 50)];
		const pace = forecastPace(expenses, TRIP, '2026-11-02');

		expect(pace.daysElapsed).toBe(1);
		expect(pace.outsideSpend).toBe(600);
		expect(pace.onTripSpend).toBe(50);
		expect(pace.perDayRate).toBe(50);
		// 600 one-off + 50/day × 10 days, rather than 650 × 10.
		expect(pace.projectedTotal).toBe(1100);
		expect(pace.overUnder).toBe(100);
		expect(pace.state).toBe('over');
	});
});

describe('mid-trip', () => {
	it('measures the on-trip rate and spreads one-offs once', () => {
		const expenses = [...spendOn('2026-03-01', 200), ...spendOn('2026-11-02', 100, 5)];
		const pace = forecastPace(expenses, TRIP, '2026-11-06'); // day 5

		expect(pace.daysElapsed).toBe(5);
		expect(pace.daysRemaining).toBe(5);
		expect(pace.onTripSpend).toBe(500);
		expect(pace.perDayRate).toBe(100);
		expect(pace.projectedTotal).toBe(1200);
		// Halfway, with half the budget spent, plus a projection that overshoots.
		expect(pace.expectedSpend).toBe(500);
		expect(pace.variance).toBe(200);
		expect(pace.overUnder).toBe(200);
		// €700 of the €1000 is gone, over the five days that are left.
		expect(pace.perDayAllowance).toBe(60);
	});

	it('counts an undated expense as a one-off, not as daily spend', () => {
		const expenses = [...spendOn('2026-11-02', 100, 2), expense({ amountActual: 80, date: null })];
		const pace = forecastPace(expenses, TRIP, '2026-11-03');

		expect(pace.outsideSpend).toBe(80);
		expect(pace.onTripSpend).toBe(200);
		expect(pace.projectedTotal).toBe(1080);
	});
});

describe('after the trip', () => {
	it('reports what was actually spent as the projection', () => {
		const expenses = spendOn('2026-11-02', 100, 6);
		const pace = forecastPace(expenses, TRIP, '2026-12-01');

		expect(pace.daysElapsed).toBe(10);
		expect(pace.daysRemaining).toBe(0);
		expect(pace.projectedTotal).toBe(600);
		expect(pace.perDayAllowance).toBeNull();
		expect(pace.state).toBe('on-track');
	});

	it('flags a trip that finished over budget', () => {
		const pace = forecastPace(spendOn('2026-11-02', 200, 6), TRIP, '2026-12-01');
		expect(pace.state).toBe('over');
		expect(pace.overUnder).toBe(200);
	});
});

describe('budgets', () => {
	it('expands a per-day budget over the trip length', () => {
		const trip: PaceTrip = { ...TRIP, budget: { perDay: 100 } };
		const pace = forecastPace(spendOn('2026-11-02', 100, 5), trip, '2026-11-06');

		expect(pace.budgetTotal).toBe(1000);
		expect(pace.expectedSpend).toBe(500);
		expect(pace.variance).toBe(0);
		expect(pace.state).toBe('on-track');
	});

	it('prefers a total over a per-day rate when both are set', () => {
		const trip: PaceTrip = { ...TRIP, budget: { total: 800, perDay: 100 } };
		expect(forecastPace([], trip, '2026-11-06').budgetTotal).toBe(800);
	});

	it('is "unknown" without a budget', () => {
		const trip: PaceTrip = { ...TRIP, budget: null };
		const pace = forecastPace(spendOn('2026-11-02', 100, 5), trip, '2026-11-06');

		expect(pace.state).toBe('unknown');
		expect(pace.budgetTotal).toBeNull();
		expect(pace.expectedSpend).toBeNull();
		expect(pace.variance).toBeNull();
		expect(pace.overUnder).toBeNull();
		// The rate and the projection are still worth reporting.
		expect(pace.perDayRate).toBe(100);
		expect(pace.projectedTotal).toBe(1000);
	});

	it('reports spend but nothing else without trip dates', () => {
		const trip: PaceTrip = { ...TRIP, startDate: null, endDate: null };
		const pace = forecastPace(spendOn('2026-11-02', 100, 5), trip, '2026-11-06');

		expect(pace.state).toBe('unknown');
		expect(pace.totalDays).toBeNull();
		expect(pace.spent).toBe(500);
		expect(pace.projectedTotal).toBeNull();
	});

	it('survives a single-day trip', () => {
		const trip: PaceTrip = { ...TRIP, endDate: '2026-11-02' };
		const pace = forecastPace(spendOn('2026-11-02', 300), trip, '2026-11-02');

		expect(pace.totalDays).toBe(1);
		expect(pace.daysElapsed).toBe(1);
		expect(pace.projectedTotal).toBe(300);
		expect(pace.state).toBe('on-track');
	});
});

describe('money handling', () => {
	it('converts foreign amounts with the stored rate', () => {
		const expenses = [
			expense({ amountActual: 1000, currency: 'JPY', fxRate: 0.006, date: '2026-11-02' })
		];
		const pace = forecastPace(expenses, TRIP, '2026-11-02');
		expect(pace.onTripSpend).toBeCloseTo(6, 5);
	});

	it('excludes an amount with no rate rather than counting it as zero spend', () => {
		const expenses = [
			expense({ amountActual: 100, date: '2026-11-02' }),
			expense({ amountActual: 9000, currency: 'JPY', fxRate: null, date: '2026-11-02' })
		];
		const pace = forecastPace(expenses, TRIP, '2026-11-02');
		expect(pace.onTripSpend).toBe(100);
	});

	it('multiplies per-person expenses by the party size', () => {
		const trip: PaceTrip = { ...TRIP, travelerCount: 3 };
		const expenses = [expense({ amountActual: 50, costType: 'per_person', date: '2026-11-02' })];
		expect(forecastPace(expenses, trip, '2026-11-02').onTripSpend).toBe(150);
	});

	it('falls back to the estimate when nothing was actually paid', () => {
		const expenses = [expense({ amountActual: null, amountEstimate: 40, date: '2026-11-02' })];
		expect(forecastPace(expenses, TRIP, '2026-11-02').onTripSpend).toBe(40);
	});
});
