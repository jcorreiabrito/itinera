import { describe, expect, it } from 'vitest';
import { render } from '@testing-library/svelte';
import type { Expense, Trip } from '$lib/db';
import { formatMoney } from '$lib/format';
import PaceCard from './PaceCard.svelte';

/**
 * The forecast maths lives in `$lib/db/pace.test.ts`; these tests cover the one
 * decision the card adds: whether there is anything meaningful to say yet, and
 * which sentence the state produces.
 */

function makeTrip(overrides: Partial<Trip> = {}): Trip {
	return {
		_id: 'trip:test',
		type: 'trip',
		title: 'Lisbon',
		startDate: '2026-10-01',
		endDate: '2026-10-10',
		homeCurrency: 'EUR',
		travelerCount: 1,
		budget: { total: 1000 },
		...overrides
	} as Trip;
}

function expense(amount: number, date: string | null): Expense {
	return {
		_id: `expense:${amount}:${date ?? 'none'}`,
		type: 'expense',
		amountEstimate: amount,
		currency: 'EUR',
		paid: true,
		date
	} as Expense;
}

const heading = () => 'Budget pace';

describe('PaceCard', () => {
	it('says nothing before departure, when there is no rate to extrapolate', () => {
		const { queryByRole } = render(PaceCard, {
			props: { trip: makeTrip(), expenses: [], today: '2026-09-30' }
		});
		expect(queryByRole('heading', { name: heading() })).toBeNull();
	});

	it('says nothing without a budget, even mid-trip', () => {
		const { queryByRole } = render(PaceCard, {
			props: {
				trip: makeTrip({ budget: undefined }),
				expenses: [expense(80, '2026-10-02')],
				today: '2026-10-03'
			}
		});
		expect(queryByRole('heading', { name: heading() })).toBeNull();
	});

	it('projects an under-budget finish and shows the pace stats', () => {
		const { container, getByText } = render(PaceCard, {
			props: {
				trip: makeTrip(),
				expenses: [expense(200, '2026-10-02')],
				today: '2026-10-03'
			}
		});

		// Day 3 of 10, €200 spent → €666.67 projected against a €1,000 budget.
		expect(getByText('On track')).toBeTruthy();
		expect(container.textContent).toContain(formatMoney((200 / 3) * 10, 'EUR'));
		expect(container.textContent).toContain('under the');
		expect(getByText('3 of 10')).toBeTruthy();
		expect(getByText(formatMoney(200 / 3, 'EUR'))).toBeTruthy();
	});

	it('projects an over-budget finish', () => {
		const { container, getByText } = render(PaceCard, {
			props: {
				trip: makeTrip(),
				expenses: [expense(600, '2026-10-02')],
				today: '2026-10-03'
			}
		});

		expect(getByText('Over pace')).toBeTruthy();
		expect(container.textContent).toContain(formatMoney(2000, 'EUR'));
		expect(container.textContent).toContain('over the');
	});

	it('states a pre-departure overrun without inventing a projection', () => {
		const { container, getByText, queryByText } = render(PaceCard, {
			props: {
				trip: makeTrip({ budget: { total: 500 } }),
				expenses: [expense(600, '2026-09-20')],
				today: '2026-09-30'
			}
		});

		expect(getByText('Over pace')).toBeTruthy();
		expect(container.textContent).toContain(
			`Already ${formatMoney(100, 'EUR')} over the ${formatMoney(500, 'EUR')} budget.`
		);
		// No trip day has elapsed, so there is no day counter to show.
		expect(queryByText('Trip day')).toBeNull();
	});
});
