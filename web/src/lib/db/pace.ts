/**
 * Budget pace – are we spending faster than the trip is passing?
 *
 * The Costs tab could already say what has been spent and what is left. Neither
 * answers the question a traveller actually asks on day three of a ten-day trip:
 * *is this rate sustainable?* A remaining figure looks healthy right up until
 * the last two days, which is exactly when it is too late to change anything.
 *
 * Like `money.ts`, this is pure and takes structural inputs, so it is testable
 * without PouchDB:
 *
 * ```ts
 * const pace = forecastPace(expenses, trip, todayIso());
 * ```
 */

import { dayDelta, todayIso, tripDayCount } from './datetime';
import { sumExpenses, type ExpenseLike } from './money';

/** The trip fields the forecast needs. */
export interface PaceTrip {
	startDate?: string | null;
	endDate?: string | null;
	/** Budget as stored on the trip: a total, a per-day rate, or both. */
	budget?: { total?: number | null; perDay?: number | null } | null;
	homeCurrency?: string | null;
	travelerCount?: number | null;
}

/** Where the trip stands against its budget. */
export type PaceState =
	/** No budget, or no dates to measure a rate against. */
	| 'unknown'
	/** The trip has not started: nothing has been spent *on it* yet. */
	| 'before'
	/** Already over the budget, or on course to finish over it. */
	| 'over'
	| 'on-track';

/** The forecast, all money in the trip's home currency. */
export interface PaceForecast {
	state: PaceState;
	/** Total days of the trip (inclusive), or `null` when it has no dates. */
	totalDays: number | null;
	/** Trip days finished or in progress: day 1 on the start date, 0 before. */
	daysElapsed: number;
	/** Trip days still to come. */
	daysRemaining: number;
	/** Everything spent so far, home currency. */
	spent: number;
	/**
	 * Spend that is not part of the daily rate: bookings made before departure
	 * and anything dated after the return. A flight bought in March must not
	 * make day one look like a spending catastrophe.
	 */
	outsideSpend: number;
	/** Spend dated inside the trip window — the rate this forecast measures. */
	onTripSpend: number;
	/** Average spend per elapsed trip day, or `null` before the trip starts. */
	perDayRate: number | null;
	/** The budget as a total, expanding a per-day budget over the trip length. */
	budgetTotal: number | null;
	/** What an evenly-paced trip would have spent by now. */
	expectedSpend: number | null;
	/** `spent - expectedSpend`: positive means ahead of the (spending) curve. */
	variance: number | null;
	/** Where this pace ends up, or `null` before the trip starts. */
	projectedTotal: number | null;
	/** `projectedTotal - budgetTotal`: positive means finishing over budget. */
	overUnder: number | null;
	/** What can still be spent per remaining day, negative once over budget. */
	perDayAllowance: number | null;
}

const UNKNOWN: PaceForecast = {
	state: 'unknown',
	totalDays: null,
	daysElapsed: 0,
	daysRemaining: 0,
	spent: 0,
	outsideSpend: 0,
	onTripSpend: 0,
	perDayRate: null,
	budgetTotal: null,
	expectedSpend: null,
	variance: null,
	projectedTotal: null,
	overUnder: null,
	perDayAllowance: null
};

/**
 * Forecast the trip's final cost from the rate so far.
 *
 * The projection extrapolates the **on-trip** daily rate over the whole trip and
 * adds the one-off costs (pre-departure bookings, post-trip charges) once. A
 * naive `spent / daysElapsed × totalDays` would fold a flight booked in March
 * into the first day's rate and report a trip that is fine as a catastrophe.
 */
export function forecastPace(
	expenses: ExpenseLike[],
	trip: PaceTrip,
	today: string = todayIso()
): PaceForecast {
	const start = trip.startDate ?? null;
	const end = trip.endDate ?? null;
	const homeCurrency = trip.homeCurrency ?? 'EUR';
	const travelers = trip.travelerCount ?? 1;

	const spentSoFar = sumExpenses(expenses, homeCurrency, travelers).spent;

	// No usable dates: report the spend, but no rate and no projection.
	if (!start || !end || end < start) {
		return { ...UNKNOWN, spent: spentSoFar };
	}

	const totalDays = tripDayCount(start, end);
	const daysElapsed =
		today < start ? 0 : today > end ? totalDays : Math.min(totalDays, dayDelta(start, today) + 1);
	const daysRemaining = Math.max(0, totalDays - daysElapsed);

	const outside = expenses.filter((e) => !e.date || e.date < start || e.date > end);
	const onTrip = expenses.filter((e) => !!e.date && e.date >= start && e.date <= end);
	const outsideSpend = sumExpenses(outside, homeCurrency, travelers).spent;
	const onTripSpend = sumExpenses(onTrip, homeCurrency, travelers).spent;

	const perDayRate = daysElapsed > 0 ? onTripSpend / daysElapsed : null;

	// A per-day budget is a total once the trip has a length.
	const budgetTotal =
		trip.budget?.total != null
			? trip.budget.total
			: trip.budget?.perDay != null
				? trip.budget.perDay * totalDays
				: null;

	const expectedSpend = budgetTotal != null ? budgetTotal * (daysElapsed / totalDays) : null;
	const variance = expectedSpend != null ? spentSoFar - expectedSpend : null;

	const projectedTotal = perDayRate == null ? null : outsideSpend + perDayRate * totalDays;
	const overUnder =
		projectedTotal != null && budgetTotal != null ? projectedTotal - budgetTotal : null;

	const perDayAllowance =
		budgetTotal != null && daysRemaining > 0 ? (budgetTotal - spentSoFar) / daysRemaining : null;

	return {
		state: paceState({ budgetTotal, spentSoFar, projectedTotal, daysElapsed }),
		totalDays,
		daysElapsed,
		daysRemaining,
		spent: spentSoFar,
		outsideSpend,
		onTripSpend,
		perDayRate,
		budgetTotal,
		expectedSpend,
		variance,
		projectedTotal,
		overUnder,
		perDayAllowance
	};
}

function paceState({
	budgetTotal,
	spentSoFar,
	projectedTotal,
	daysElapsed
}: {
	budgetTotal: number | null;
	spentSoFar: number;
	projectedTotal: number | null;
	daysElapsed: number;
}): PaceState {
	if (budgetTotal == null) return 'unknown';
	if (spentSoFar > budgetTotal) return 'over';
	if (daysElapsed === 0) return 'before';
	return projectedTotal != null && projectedTotal > budgetTotal ? 'over' : 'on-track';
}
