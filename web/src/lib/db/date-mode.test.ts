import { describe, expect, it } from 'vitest';

import {
	clampDreamDayCount,
	dayKeyKind,
	dateFromDayKey,
	dreamDayKey,
	dreamOrdinalFromKey,
	effectiveDreamDayCount,
	isDreamTrip,
	resolveDateMode,
	weekdayOf,
	weekdayShortName
} from './date-mode';
import type { Trip } from './schemas';

const baseTrip: Trip = {
	_id: 'trip:TEST',
	type: 'trip',
	title: 'Test',
	destinations: [],
	archived: false,
	stage: 'confirmed',
	tags: [],
	travelerCount: 1,
	createdAt: '2026-01-01T00:00:00.000Z',
	updatedAt: '2026-01-01T00:00:00.000Z',
	deletedAt: null,
	schemaVersion: 1
};

describe('resolveDateMode', () => {
	it('honours an explicit mode', () => {
		expect(resolveDateMode({ ...baseTrip, dateMode: 'dream' })).toBe('dream');
		expect(resolveDateMode({ ...baseTrip, dateMode: 'dated', startDate: '2026-01-01' })).toBe(
			'dated'
		);
	});

	it('treats a complete range as dated', () => {
		expect(resolveDateMode({ ...baseTrip, startDate: '2026-03-01', endDate: '2026-03-05' })).toBe(
			'dated'
		);
	});

	it('does not turn a half-entered range into a dream', () => {
		expect(resolveDateMode({ ...baseTrip, startDate: '2026-03-01' })).toBe('dated');
		expect(resolveDateMode({ ...baseTrip, endDate: '2026-03-05' })).toBe('dated');
	});

	it('infers dream when neither date is valid', () => {
		expect(resolveDateMode(baseTrip)).toBe('dream');
		expect(resolveDateMode({ ...baseTrip, startDate: '', endDate: '' })).toBe('dream');
		expect(resolveDateMode({ ...baseTrip, startDate: 'not-a-date', endDate: 'also-not' })).toBe(
			'dream'
		);
	});
});

describe('isDreamTrip', () => {
	it('matches resolveDateMode', () => {
		expect(isDreamTrip(baseTrip)).toBe(true);
		expect(isDreamTrip({ ...baseTrip, startDate: '2026-01-01' })).toBe(false);
	});
});

describe('effectiveDreamDayCount', () => {
	it('defaults to one day', () => {
		expect(effectiveDreamDayCount({ dreamDayCount: undefined })).toBe(1);
	});

	it('uses the stored count', () => {
		expect(effectiveDreamDayCount({ dreamDayCount: 7 })).toBe(7);
	});

	it('never falls below an ordinal already in the data', () => {
		expect(effectiveDreamDayCount({ dreamDayCount: 2 }, [{ ordinal: 5 }], [])).toBe(5);
		expect(effectiveDreamDayCount({ dreamDayCount: 2 }, [], [{ dayOrdinal: 4 }])).toBe(4);
	});

	it('clamps to the supported range', () => {
		expect(effectiveDreamDayCount({ dreamDayCount: 9999 })).toBe(366);
		expect(effectiveDreamDayCount({ dreamDayCount: 0 })).toBe(1);
	});
});

describe('clampDreamDayCount', () => {
	it('rounds and clamps', () => {
		expect(clampDreamDayCount(3.4)).toBe(3);
		expect(clampDreamDayCount(-2)).toBe(1);
		expect(clampDreamDayCount(9999)).toBe(366);
		expect(clampDreamDayCount(Number.NaN)).toBe(1);
	});
});

describe('day keys', () => {
	it('round-trips dream keys', () => {
		const key = dreamDayKey(3);
		expect(key).toBe('dream-3');
		expect(dreamOrdinalFromKey(key)).toBe(3);
		expect(dateFromDayKey(key)).toBeNull();
		expect(dayKeyKind(key)).toBe('dream');
	});

	it('recognises dated and ideas keys', () => {
		expect(dayKeyKind('2026-03-01')).toBe('dated');
		expect(dateFromDayKey('2026-03-01')).toBe('2026-03-01');
		expect(dayKeyKind('ideas')).toBe('ideas');
		expect(dayKeyKind('nonsense')).toBe('invalid');
		expect(dreamOrdinalFromKey('2026-03-01')).toBeNull();
	});
});

describe('weekday helpers', () => {
	it('maps Luxon weekday numbers', () => {
		expect(weekdayOf('2026-03-02')).toBe(1); // Monday
		expect(weekdayOf('2026-03-07')).toBe(6); // Saturday
		expect(weekdayOf('not-a-date')).toBeNull();
	});

	it('names a wish', () => {
		expect(weekdayShortName(6)).toBe('Sat');
		expect(weekdayShortName(null)).toBe('');
	});
});
