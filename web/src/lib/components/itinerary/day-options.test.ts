import { describe, expect, it } from 'vitest';
import type { DayTimeline } from '$lib/db/repositories/itinerary';
import { dayOptionLabel, toDayOption, type DayOption } from './day-options';

function day(overrides: Partial<DayTimeline>): DayTimeline {
	return {
		key: '2026-11-02',
		kind: 'dated',
		date: '2026-11-02',
		ordinal: 1,
		weekdayHint: null,
		day: null,
		todos: [],
		allDay: [],
		timed: [],
		subtotal: { estimate: 0, actual: 0, spent: 0, unpaid: 0, missingRateCount: 0 },
		...overrides
	} as unknown as DayTimeline;
}

describe('toDayOption', () => {
	it('keeps the plan ordinal off a dated day so labels stay dates', () => {
		const option = toDayOption(day({ ordinal: 2, weekdayHint: 6 }));

		expect(option).toEqual({
			key: '2026-11-02',
			date: '2026-11-02',
			ordinal: null,
			weekdayHint: null
		});
		expect(dayOptionLabel(option)).toBe('Mon 2 Nov');
	});

	it('carries the ordinal and weekday wish of a dream day', () => {
		const option = toDayOption(
			day({ key: 'dream-2', kind: 'dream', date: null, ordinal: 2, weekdayHint: 6 })
		);

		expect(option).toEqual({
			key: 'dream-2',
			date: null,
			ordinal: 2,
			weekdayHint: 6
		});
		expect(dayOptionLabel(option)).toBe('Day 2 · Sat wish');
	});
});

describe('dayOptionLabel', () => {
	it('labels a dated day by its date even when an ordinal is present', () => {
		const option: DayOption = {
			key: '2026-11-03',
			date: '2026-11-03',
			ordinal: 2,
			weekdayHint: null
		};

		expect(dayOptionLabel(option)).toBe('Tue 3 Nov');
	});

	it('falls back to Ideas when there is neither a date nor an ordinal', () => {
		expect(dayOptionLabel({ key: 'ideas', date: null, ordinal: null, weekdayHint: null })).toBe(
			'Unscheduled · Ideas'
		);
	});
});
