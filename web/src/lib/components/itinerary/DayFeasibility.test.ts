import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import type { ItineraryItem } from '$lib/db';
import type { DayTimeline, TimelineEntry } from '$lib/db/repositories/itinerary';
import DayFeasibility from './DayFeasibility.svelte';

/**
 * The arithmetic lives in `$lib/db/feasibility.test.ts`; these cover the card's
 * own decisions — what it names, what it offers to open, and when it stays
 * quiet — plus the awake-window percentage it adds on top of `analyseDay`.
 */

let seq = 0;
const item = (over: Partial<ItineraryItem>): ItineraryItem =>
	({ _id: `i${++seq}`, type: 'itineraryItem', order: seq, ...over }) as ItineraryItem;

const entry = (it: ItineraryItem): TimelineEntry => ({
	kind: 'item',
	minutes: null,
	order: it.order ?? 0,
	item: it
});

/** Only the itinerary items matter here; the rest is filled in so the type holds. */
const day = (items: ItineraryItem[]): DayTimeline => ({
	date: '2026-10-25',
	day: null,
	todos: [],
	allDay: [],
	timed: items.map(entry),
	subtotal: { estimate: 0, actual: 0, spent: 0, unpaid: 0, missingRateCount: 0 }
});

const renderDay = (...items: ItineraryItem[]) =>
	render(DayFeasibility, { props: { day: day(items), onedit: vi.fn() } });

describe('DayFeasibility', () => {
	it('renders nothing when no item is timed', () => {
		const { container } = renderDay(item({ title: 'Whenever' }));
		expect(container.textContent?.trim()).toBe('');
	});

	it('names both items and the shared window of an overlap', () => {
		const { container, getByRole } = renderDay(
			item({ title: 'Breakfast', startTime: '09:00', endTime: '10:30' }),
			item({ title: 'Taxi', startTime: '10:00', endTime: '11:00' })
		);

		expect(getByRole('alert')).toBeTruthy();
		expect(container.textContent).toContain('Breakfast and Taxi share 30m (10:00–10:30).');
	});

	it('opens an overlapping item for editing', () => {
		const taxi = item({ title: 'Taxi', startTime: '10:00', endTime: '11:00' });
		const onedit = vi.fn();
		const { getByRole } = render(DayFeasibility, {
			props: {
				day: day([item({ title: 'Breakfast', startTime: '09:00', endTime: '10:30' }), taxi]),
				onedit
			}
		});

		getByRole('button', { name: 'Edit Taxi' }).click();

		expect(onedit).toHaveBeenCalledWith(taxi);
	});

	it('warns when the hand-off is too tight to make', () => {
		const { container, queryByRole } = renderDay(
			item({ title: 'Museum', startTime: '09:00', endTime: '10:30' }),
			item({ title: 'Train', startTime: '10:40', endTime: '11:30' })
		);

		expect(queryByRole('alert')).toBeNull();
		expect(container.textContent).toContain('Only 10m between Museum and Train.');
	});

	it('calls a zero-minute hand-off what it is', () => {
		const { container } = renderDay(
			item({ title: 'Breakfast', startTime: '09:00', endTime: '10:30' }),
			item({ title: 'Taxi', startTime: '10:30', endTime: '11:00' })
		);

		expect(container.textContent).toContain('No time between Breakfast and Taxi.');
	});

	it('measures planned time against the awake window', () => {
		const { container, getByRole } = renderDay(
			item({ title: 'Long lunch', startTime: '09:00', endTime: '13:00' })
		);

		expect(container.textContent).toContain('4h planned in a 14h day');
		expect(container.textContent).toContain('29% packed');
		expect(getByRole('progressbar').getAttribute('aria-valuenow')).toBe('29');
	});

	it('stays quiet when the day fits', () => {
		const { container, queryByRole } = renderDay(
			item({ title: 'Museum', startTime: '09:00', endTime: '10:30' })
		);

		expect(queryByRole('alert')).toBeNull();
		expect(container.textContent).toContain('Everything fits comfortably.');
	});
});
