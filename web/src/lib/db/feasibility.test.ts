import { describe, expect, it } from 'vitest';
import { analyseDay, type ScheduledEntry } from './feasibility';

/**
 * Day feasibility. The cases that matter are the ones a long list hides: an
 * overlap that is easy to miss by eye, an item with no end time (which must not
 * be read as either zero-length or open-ended), and all-day entries, which are
 * never part of the schedule.
 */

const at = (startTime: string, endTime?: string, title = ''): ScheduledEntry => ({
	startTime,
	endTime,
	title
});

describe('analyseDay', () => {
	it('reports a clean day as clean', () => {
		const day = analyseDay([at('09:00', '10:30', 'Breakfast'), at('11:00', '13:00', 'Museum')]);

		expect(day.conflicted).toBe(false);
		expect(day.overlaps).toEqual([]);
		expect(day.tightGaps).toEqual([]);
		expect(day.scheduledMinutes).toBe(90 + 120);
		expect(day.spanMinutes).toBe(13 * 60 - 9 * 60);
	});

	it('finds an overlap and reports how much the two share', () => {
		const day = analyseDay([at('09:00', '10:30', 'Breakfast'), at('10:00', '11:00', 'Taxi')]);

		expect(day.conflicted).toBe(true);
		expect(day.overlaps).toHaveLength(1);
		expect(day.overlaps[0].a.entry.title).toBe('Breakfast');
		expect(day.overlaps[0].b.entry.title).toBe('Taxi');
		expect(day.overlaps[0].minutes).toBe(30);
	});

	it('reports every overlap, not just the first', () => {
		const day = analyseDay([
			at('09:00', '12:00', 'Long tour'),
			at('10:00', '10:30', 'Call'),
			at('11:00', '11:30', 'Tasting')
		]);

		expect(day.overlaps).toHaveLength(2);
	});

	it('does not flag an overlap when one item only touches another', () => {
		// 10:30 end and 10:30 start is a hand-off, not a clash.
		const day = analyseDay([at('09:00', '10:30', 'Breakfast'), at('10:30', '11:00', 'Taxi')]);
		expect(day.conflicted).toBe(false);
		expect(day.tightGaps.map((g) => g.minutes)).toEqual([0]);
	});

	it('flags a hand-off that is too tight to make', () => {
		const day = analyseDay([at('09:00', '10:30', 'Museum'), at('10:40', '11:30', 'Train')]);
		expect(day.tightGaps).toHaveLength(1);
		expect(day.tightGaps[0].minutes).toBe(10);
	});

	it('takes the transfer allowance from the caller', () => {
		const day = analyseDay([at('09:00', '10:30', 'Museum'), at('11:00', '12:00', 'Train')], {
			minTransferMinutes: 45
		});
		expect(day.tightGaps).toHaveLength(1);
	});

	it('assumes a duration for an item with no end time, and says so by flagging it', () => {
		// 13:00 + the assumed hour runs into the 13:30 tour.
		const day = analyseDay([at('13:00', undefined, 'Lunch'), at('13:30', '15:00', 'Tour')]);
		expect(day.conflicted).toBe(true);
		expect(day.overlaps[0].minutes).toBe(30);
		expect(day.scheduledMinutes).toBe(60 + 90);
	});

	it('does not stack an end time that precedes its start', () => {
		const day = analyseDay([at('09:00', '08:00', 'Typo')]);
		expect(day.scheduledMinutes).toBe(60);
	});

	it('keeps all-day entries out of the schedule', () => {
		const day = analyseDay([
			{ startTime: '09:00', endTime: '10:00', title: 'Real' },
			{ allDay: true, startTime: '09:00', endTime: '10:00', title: 'All day' }
		]);

		expect(day.timed).toHaveLength(1);
		expect(day.unscheduled).toEqual([]);
	});

	it('separates entries with no readable time', () => {
		const day = analyseDay([
			at('09:00', '10:00', 'Real'),
			{ title: 'Whenever' },
			at('', '', 'Also')
		]);

		expect(day.timed.map((t) => t.entry.title)).toEqual(['Real']);
		expect(day.unscheduled.map((e) => e.title)).toEqual(['Whenever', 'Also']);
	});

	it('reads ISO datetimes as well as HH:mm', () => {
		const day = analyseDay([
			at('2026-11-02T09:00:00.000Z', '2026-11-02T10:00:00.000Z', 'A'),
			at('2026-11-02T09:30:00.000Z', '2026-11-02T11:00:00.000Z', 'B')
		]);
		expect(day.conflicted).toBe(true);
	});

	it('orders by start time regardless of the input order', () => {
		const day = analyseDay([
			at('15:00', '16:00', 'Late'),
			at('09:00', '10:00', 'Early'),
			at('12:00', '13:00', 'Middle')
		]);
		expect(day.timed.map((t) => t.entry.title)).toEqual(['Early', 'Middle', 'Late']);
	});

	it('breaks a tie on the itinerary order', () => {
		const day = analyseDay([
			{ startTime: '09:00', endTime: '10:00', title: 'Second', order: 2 },
			{ startTime: '09:00', endTime: '10:00', title: 'First', order: 1 }
		]);
		expect(day.timed.map((t) => t.entry.title)).toEqual(['First', 'Second']);
	});

	it('handles an empty day', () => {
		const day = analyseDay([]);
		expect(day.conflicted).toBe(false);
		expect(day.spanMinutes).toBe(0);
		expect(day.scheduledMinutes).toBe(0);
	});
});
