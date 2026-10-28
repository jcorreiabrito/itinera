/**
 * The guided Set dates sheet.
 *
 * The day arithmetic is covered exhaustively in `date-assignment.test.ts`; this
 * file drives the sheet itself: it loads a plan, shows where each numbered day
 * lands, lets a nudge move a day, and writes through `tripDates`.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/svelte';
import type { ItineraryItem, Trip, TripDay } from '$lib/db';
import type { DayTimeline } from '$lib/db/repositories/itinerary';

const dbMocks = vi.hoisted(() => ({
	tripTimeline: vi.fn(),
	setDates: vi.fn(async () => undefined),
	clearDates: vi.fn(async () => undefined)
}));

vi.mock('$lib/db', () => ({
	analyseDay: vi.fn(),
	flights: { byTrip: vi.fn(async () => []) },
	reservations: { byTrip: vi.fn(async () => []) },
	itinerary: { tripTimeline: dbMocks.tripTimeline },
	todayIso: () => '2026-10-28',
	tripDates: { setDates: dbMocks.setDates, clearDates: dbMocks.clearDates }
}));

const { tripTimeline, setDates, clearDates } = dbMocks;

import SetDatesSheet from './SetDatesSheet.svelte';

const item = (id: string, dayOrdinal: number | null): ItineraryItem =>
	({
		_id: `itin:${id}`,
		type: 'itineraryItem',
		tripId: 'trip:test',
		title: id,
		dayOrdinal,
		order: 0
	}) as unknown as ItineraryItem;

const dayDoc = (ordinal: number, weekdayHint: number | null): TripDay =>
	({
		_id: `day:trip:dream-${String(ordinal).padStart(3, '0')}`,
		type: 'tripDay',
		tripId: 'trip:test',
		ordinal,
		weekdayHint
	}) as unknown as TripDay;

function timelineDay(
	ordinal: number,
	weekdayHint: number | null,
	items: ItineraryItem[]
): DayTimeline {
	return {
		key: `dream-${String(ordinal).padStart(3, '0')}`,
		kind: 'dream',
		date: null,
		ordinal,
		weekdayHint,
		day: dayDoc(ordinal, weekdayHint),
		todos: [],
		allDay: items,
		timed: [],
		subtotal: { estimate: 0, actual: 0, spent: 0, unpaid: 0, missingRateCount: 0 }
	};
}

const emptyIdeas: DayTimeline = {
	key: 'ideas',
	kind: 'ideas',
	date: null,
	ordinal: null,
	weekdayHint: null,
	day: null,
	todos: [],
	allDay: [],
	timed: [],
	subtotal: { estimate: 0, actual: 0, spent: 0, unpaid: 0, missingRateCount: 0 }
};

const dreamTrip = {
	_id: 'trip:test',
	type: 'trip',
	title: 'Someday Japan',
	dateMode: 'dream',
	dreamDayCount: 2,
	homeCurrency: 'EUR'
} as unknown as Trip;

const datedTrip = {
	_id: 'trip:test',
	type: 'trip',
	title: 'Kyoto',
	dateMode: 'dated',
	startDate: '2026-11-02',
	endDate: '2026-11-03',
	homeCurrency: 'EUR'
} as unknown as Trip;

beforeEach(() => {
	tripTimeline.mockReset();
	setDates.mockClear();
	clearDates.mockClear();
});

describe('SetDatesSheet', () => {
	it('maps numbered days onto the chosen start and flags a missed wish', async () => {
		tripTimeline.mockResolvedValue({
			days: [timelineDay(1, 6, [item('Market', 1)]), timelineDay(2, null, [])],
			unscheduled: emptyIdeas
		});

		render(SetDatesSheet, { props: { open: true, trip: dreamTrip } });

		expect(await screen.findByText('Day 1')).toBeTruthy();
		expect(screen.getByText('Day 2')).toBeTruthy();
		// 2026-10-28 is a Wednesday; Day 1 asked for Saturday.
		expect(screen.getByText(/Wants Sat/)).toBeTruthy();
		expect(screen.getByRole('button', { name: 'Set dates' })).toBeTruthy();
	});

	it('writes the chosen start and no offsets when applied unchanged', async () => {
		const onsaved = vi.fn();
		tripTimeline.mockResolvedValue({
			days: [timelineDay(1, null, [item('Arrive', 1)]), timelineDay(2, null, [])],
			unscheduled: emptyIdeas
		});

		render(SetDatesSheet, { props: { open: true, trip: dreamTrip, onsaved } });

		const apply = await screen.findByRole('button', { name: 'Set dates' });
		await fireEvent.click(apply);

		await waitFor(() =>
			expect(setDates).toHaveBeenCalledWith('trip:test', {
				startDate: '2026-10-28',
				offsets: {},
				moveBookings: false
			})
		);
		expect(onsaved).toHaveBeenCalled();
	});

	it('moves a nudged day and every later day while keeping the sequence', async () => {
		tripTimeline.mockResolvedValue({
			days: [timelineDay(1, null, []), timelineDay(2, null, [])],
			unscheduled: emptyIdeas
		});

		render(SetDatesSheet, { props: { open: true, trip: dreamTrip } });

		const later = await screen.findByRole('button', { name: /Move later — Day 1/ });
		await fireEvent.click(later);
		await fireEvent.click(screen.getByRole('button', { name: 'Set dates' }));

		await waitFor(() =>
			expect(setDates).toHaveBeenCalledWith('trip:test', {
				startDate: '2026-10-28',
				offsets: { 1: 1, 2: 1 },
				moveBookings: false
			})
		);
	});

	it('offers make-flexible on a dated trip and asks before writing', async () => {
		tripTimeline.mockResolvedValue({
			days: [],
			unscheduled: emptyIdeas
		});
		// A dated trip builds its plan from the trip range, not the timeline.
		render(SetDatesSheet, { props: { open: true, trip: datedTrip } });

		await fireEvent.click(await screen.findByRole('button', { name: /Make dates flexible again/ }));

		expect(clearDates).not.toHaveBeenCalled();
		await fireEvent.click(screen.getByRole('button', { name: 'Make flexible' }));

		await waitFor(() => expect(clearDates).toHaveBeenCalledWith('trip:test'));
	});

	it('disables applying when the start date is cleared', async () => {
		tripTimeline.mockResolvedValue({
			days: [timelineDay(1, null, [])],
			unscheduled: emptyIdeas
		});

		render(SetDatesSheet, { props: { open: true, trip: dreamTrip } });

		const input = (await screen.findByLabelText(/Start date/)) as HTMLInputElement;
		await fireEvent.input(input, { target: { value: '' } });

		const apply = screen.getByRole('button', { name: 'Set dates' }) as HTMLButtonElement;
		expect(apply.disabled).toBe(true);
	});
});
