/**
 * Compile smoke test for the pointer-reorder surface.
 *
 * The gesture arithmetic is covered by `gestures.test.ts`; this file only makes
 * the changed components compile under the Vitest Svelte pipeline and checks
 * the two contracts a drag depends on: a labelled handle on reorderable rows,
 * and the `data-drop-date` attributes on both day switchers.
 */

import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render } from '@testing-library/svelte';
import type { ResolvedPathname } from '$app/types';
import type { ItineraryItem } from '$lib/db';
import type { DayTimeline } from '$lib/db/repositories/itinerary';
import DateStrip from './DateStrip.svelte';
import DayRail from './DayRail.svelte';
import ItineraryDay from './ItineraryDay.svelte';
import TimelineEntryRow from './TimelineEntryRow.svelte';

// jsdom implements neither; DateStrip's selection effect calls both.
if (typeof Element !== 'undefined' && !Element.prototype.scrollIntoView) {
	Element.prototype.scrollIntoView = () => {};
}
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
	Object.defineProperty(window, 'matchMedia', {
		writable: true,
		value: (query: string): MediaQueryList =>
			({
				matches: false,
				media: query,
				onchange: null,
				addListener: () => {},
				removeListener: () => {},
				addEventListener: () => {},
				removeEventListener: () => {},
				dispatchEvent: () => false
			}) as MediaQueryList
	});
}

const links = {
	flights: '/trip/trip/bookings?tab=flights' as ResolvedPathname,
	reservations: '/trip/trip/bookings?tab=reservations' as ResolvedPathname
};

const item = {
	_id: 'i1',
	type: 'itineraryItem',
	title: 'Museum',
	category: 'sightseeing',
	order: 0
} as ItineraryItem;

const allDayItem = {
	_id: 'i2',
	type: 'itineraryItem',
	title: 'Hotel',
	category: 'lodging',
	allDay: true,
	order: 0
} as ItineraryItem;

const day: DayTimeline = {
	date: '2026-10-25',
	day: null,
	todos: [],
	allDay: [allDayItem],
	timed: [{ kind: 'item', minutes: null, order: 0, item }],
	subtotal: { estimate: 0, actual: 0, spent: 0, unpaid: 0, missingRateCount: 0 }
};

function emptyDay(date: string | null): DayTimeline {
	return {
		date,
		day: null,
		todos: [],
		allDay: [],
		timed: [],
		subtotal: { estimate: 0, actual: 0, spent: 0, unpaid: 0, missingRateCount: 0 }
	};
}

describe('itinerary gestures', () => {
	it('exports the gesture-aware components', () => {
		for (const component of [DateStrip, DayRail, TimelineEntryRow, ItineraryDay]) {
			expect(component).toBeTruthy();
		}
	});

	it('labels a draggable row handle and marks its lane', () => {
		const { container, getByRole } = render(TimelineEntryRow, {
			props: {
				entry: { kind: 'item', minutes: null, order: 0, item },
				links,
				draggable: true,
				dragLane: 'untimed',
				onedit: vi.fn(),
				ondelete: vi.fn()
			}
		});

		expect(getByRole('button', { name: 'Drag Museum to reorder' })).toBeTruthy();
		expect(container.querySelector('li')?.getAttribute('data-drag-lane')).toBe('untimed');
	});

	it('marks every date strip chip as a drop target', () => {
		const { container } = render(DateStrip, {
			props: {
				dates: ['2026-10-24', '2026-10-25'],
				selected: '2026-10-25',
				today: '2026-10-25',
				ideasCount: 1,
				onselect: vi.fn()
			}
		});

		expect(container.querySelector('[data-drop-date="2026-10-24"]')).toBeTruthy();
		expect(container.querySelector('[data-drop-date="2026-10-25"]')).toBeTruthy();
		expect(container.querySelector('[data-drop-date="ideas"]')).toBeTruthy();
	});

	it('marks every day rail entry as a drop target', () => {
		const { container } = render(DayRail, {
			props: {
				days: [emptyDay('2026-10-24'), emptyDay('2026-10-25')],
				unscheduled: emptyDay(null),
				selected: '2026-10-24',
				today: '2026-10-24',
				onselect: vi.fn()
			}
		});

		expect(container.querySelector('[data-drop-date="2026-10-24"]')).toBeTruthy();
		expect(container.querySelector('[data-drop-date="2026-10-25"]')).toBeTruthy();
		expect(container.querySelector('[data-drop-date="ideas"]')).toBeTruthy();
	});

	it('drops the handles when batch selection takes over the rows', async () => {
		const { getByRole, queryByRole } = render(ItineraryDay, {
			props: {
				day,
				tripId: 'trip',
				dates: ['2026-10-25'],
				links,
				onedit: vi.fn(),
				onchanged: vi.fn()
			}
		});

		expect(getByRole('button', { name: 'Drag Hotel to reorder' })).toBeTruthy();
		expect(getByRole('button', { name: 'Drag Museum to reorder' })).toBeTruthy();

		await fireEvent.click(getByRole('button', { name: 'Select' }));

		expect(queryByRole('button', { name: 'Drag Hotel to reorder' })).toBeNull();
		expect(queryByRole('button', { name: 'Drag Museum to reorder' })).toBeNull();
		expect(getByRole('checkbox', { name: /Museum/ })).toBeTruthy();
	});
});
