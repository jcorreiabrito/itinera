/**
 * Compile smoke test for the day view's multi-select controls.
 *
 * The selection arithmetic lives in `batch-selection.test.ts`; this file only
 * proves the new components mount and that their checkboxes and toolbar buttons
 * carry the names keyboard and screen-reader users reach them by.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import type { ItineraryItem } from '$lib/db';
import type { DayTimeline } from '$lib/db/repositories/itinerary';
import BatchActionBar from './BatchActionBar.svelte';
import BatchSelectionRow from './BatchSelectionRow.svelte';
import ItineraryDay from './ItineraryDay.svelte';
import ItineraryPage from '../../../routes/trip/[id]/itinerary/+page.svelte';

const item = {
	_id: 'i1',
	type: 'itineraryItem',
	title: 'Museum',
	category: 'sightseeing',
	startTime: '09:00',
	order: 0
} as ItineraryItem;

const day: DayTimeline = {
	date: '2026-10-25',
	day: null,
	todos: [],
	allDay: [],
	timed: [{ kind: 'item', minutes: 540, order: 0, item }],
	subtotal: { estimate: 0, actual: 0, spent: 0, unpaid: 0, missingRateCount: 0 }
};

describe('batch selection UI', () => {
	it('exports a component each', () => {
		for (const component of [BatchActionBar, BatchSelectionRow, ItineraryDay, ItineraryPage]) {
			expect(component).toBeTruthy();
		}
	});

	it('names the row checkbox after the activity', () => {
		const { getByRole } = render(BatchSelectionRow, {
			props: { item, selected: false, onchange: vi.fn() }
		});

		expect(getByRole('checkbox', { name: /Museum/ })).toBeTruthy();
	});

	it('labels the action toolbar and its buttons', () => {
		const { getByRole } = render(BatchActionBar, {
			props: { count: 2, onmove: vi.fn(), onduplicate: vi.fn(), ondelete: vi.fn() }
		});

		expect(getByRole('toolbar', { name: 'Batch actions' })).toBeTruthy();
		expect(getByRole('button', { name: /Move to day/ })).toBeTruthy();
		expect(getByRole('button', { name: 'Duplicate' })).toBeTruthy();
		expect(getByRole('button', { name: 'Delete' })).toBeTruthy();
	});

	it('enters selection mode from the day header and counts checked rows', async () => {
		const { getByRole, getByText } = render(ItineraryDay, {
			props: {
				day,
				tripId: 'trip',
				dates: ['2026-10-25'],
				links: {
					flights: '/trip/trip/bookings?tab=flights' as ResolvedPathname,
					reservations: '/trip/trip/bookings?tab=reservations' as ResolvedPathname
				},
				onedit: vi.fn(),
				onchanged: vi.fn()
			}
		});

		await fireEvent.click(getByRole('button', { name: 'Select' }));

		expect(getByRole('toolbar', { name: 'Batch actions' })).toBeTruthy();
		expect(getByText('0 selected')).toBeTruthy();

		await fireEvent.click(getByRole('checkbox', { name: /Museum/ }));

		expect(getByText('1 selected')).toBeTruthy();
	});
});
