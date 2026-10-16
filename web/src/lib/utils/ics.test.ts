import { describe, it, expect } from 'vitest';
import {
	escapeText,
	foldLine,
	normaliseTime,
	plusOneHour,
	splitLocal,
	formatIcsDate,
	nextDayIso,
	generateTripICS
} from './ics';
import type { Flight, ItineraryItem, Reservation, Trip } from '$lib/db';

/**
 * The twin of `api/tests/test_routes_calendar.py`. Both implementations exist
 * on purpose (this one works offline, the server one is a shareable URL), so
 * the rules that must not drift are pinned on both sides.
 */

const base = {
	schemaVersion: 1,
	createdAt: '2026-07-26T00:00:00Z',
	updatedAt: '2026-07-26T00:00:00Z',
	deletedAt: null,
	archived: false
} as const;

const trip = {
	...base,
	_id: 'trip:01H1234567890ABCDEFGHJKMNP',
	type: 'trip',
	stage: 'planning',
	title: 'Summer in Kyoto',
	destinations: [{ name: 'Kyoto, Japan' }],
	startDate: '2026-08-01',
	endDate: '2026-08-07',
	notes: 'Exciting trip',
	tags: [],
	travelerCount: 1
} as unknown as Trip;

/** Unfold to logical lines, the way a conforming parser does. */
function logical(ics: string): string[] {
	const out: string[] = [];
	for (const line of ics.split('\r\n')) {
		if (!line) continue;
		if (line.startsWith(' ') && out.length) out[out.length - 1] += line.slice(1);
		else out.push(line);
	}
	return out;
}

function events(ics: string): Record<string, Record<string, string>> {
	const out: Record<string, Record<string, string>> = {};
	let current: Record<string, string> | null = null;
	for (const line of logical(ics)) {
		if (line === 'BEGIN:VEVENT') current = {};
		else if (line === 'END:VEVENT') {
			if (current?.UID) out[current.UID] = current;
			current = null;
		} else if (current) {
			const at = line.indexOf(':');
			current[line.slice(0, at)] = line.slice(at + 1);
		}
	}
	return out;
}

function only(ics: string, uidPart: string): Record<string, string> {
	const matches = Object.entries(events(ics)).filter(([uid]) => uid.includes(uidPart));
	expect(matches, `expected exactly one event matching ${uidPart}`).toHaveLength(1);
	return matches[0][1];
}

describe('escapeText', () => {
	it('escapes the characters TEXT reserves', () => {
		expect(escapeText('Dinner, then fado; late')).toBe('Dinner\\, then fado\\; late');
		expect(escapeText('back\\slash')).toBe('back\\\\slash');
		expect(escapeText('two\nlines')).toBe('two\\nlines');
		expect(escapeText('crlf\r\nhere')).toBe('crlf\\nhere');
	});

	it('drops control characters that would truncate the line', () => {
		expect(escapeText('bell\u0007here')).toBe('bellhere');
		expect(escapeText('a\tb')).toBe('a\tb'); // TAB is permitted
	});
});

describe('foldLine', () => {
	it('respects the 75-octet limit', () => {
		const line = 'DESCRIPTION:' + 'a'.repeat(200);
		const folded = foldLine(line);
		for (const part of folded)
			expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
		expect(folded.slice(1).every((part) => part.startsWith(' '))).toBe(true);
		expect([folded[0], ...folded.slice(1).map((p) => p.slice(1))].join('')).toBe(line);
	});

	it('counts octets, not characters', () => {
		// 'ã' is two octets, so a character-based slice would overrun and could
		// cut the character in half.
		const line = 'SUMMARY:' + 'ã'.repeat(60);
		const folded = foldLine(line);
		for (const part of folded) {
			expect(new TextEncoder().encode(part).length).toBeLessThanOrEqual(75);
		}
		// Splitting a two-octet character would corrupt it; reassembling the
		// unfolded value is what proves it did not.
		const rejoined = [folded[0], ...folded.slice(1).map((p) => p.slice(1))].join('');
		expect(rejoined).toBe(line);
		expect(rejoined.split('ã')).toHaveLength(61);
	});

	it('leaves short lines alone', () => {
		expect(foldLine('SUMMARY:trip')).toEqual(['SUMMARY:trip']);
	});
});

describe('time and date primitives', () => {
	it('zero-pads a single-digit hour', () => {
		expect(normaliseTime('14:30')).toBe('143000');
		expect(normaliseTime('9:00')).toBe('090000');
		expect(normaliseTime('1430')).toBe('143000');
		expect(normaliseTime('--')).toBeNull();
		expect(formatIcsDate('2026-10-15', '9:00')).toBe('20261015T090000');
	});

	it('adds an hour, wrapping past midnight', () => {
		expect(plusOneHour('193000')).toBe('203000');
		expect(plusOneHour('233000')).toBe('003000');
	});

	it('tells a bare time apart from a date', () => {
		expect(splitLocal('2026-10-17T08:00')).toEqual(['2026-10-17', '08:00']);
		expect(splitLocal('2026-10-17')).toEqual(['2026-10-17', null]);
		expect(splitLocal('06:15')).toEqual([null, '06:15']);
		expect(splitLocal(null)).toEqual([null, null]);
	});

	it('rejects a date it cannot express', () => {
		expect(formatIcsDate('not a date')).toBe('');
		expect(nextDayIso('2026-12-31')).toBe('2027-01-01');
	});
});

describe('generateTripICS', () => {
	it('produces a terminated VCALENDAR with an exclusive DTEND', () => {
		const ics = generateTripICS(trip);
		expect(ics.startsWith('BEGIN:VCALENDAR')).toBe(true);
		expect(ics.endsWith('END:VCALENDAR\r\n')).toBe(true);
		const master = only(ics, 'trip-');
		expect(master.SUMMARY).toBe('✈️ Summer in Kyoto');
		expect(master['DTSTART;VALUE=DATE']).toBe('20260801');
		expect(master['DTEND;VALUE=DATE']).toBe('20260808');
		expect(master.LOCATION).toBe('Kyoto\\, Japan');
	});

	it('keeps UIDs stable so a re-import updates instead of duplicating', () => {
		const item = {
			...base,
			_id: 'itin:01H1234567890ABCDEFGHJKMNQ',
			type: 'itineraryItem',
			tripId: '01H1234567890ABCDEFGHJKMNP',
			title: 'Fushimi Inari',
			date: '2026-08-02',
			startTime: '09:00',
			allDay: false,
			order: 0
		} as unknown as ItineraryItem;
		const first = Object.keys(events(generateTripICS(trip, { items: [item] }))).sort();
		const second = Object.keys(events(generateTripICS(trip, { items: [item] }))).sort();
		expect(first).toEqual(second);
		expect(first).toEqual([
			'itin-01H1234567890ABCDEFGHJKMNQ@itinera',
			'trip-01H1234567890ABCDEFGHJKMNP@itinera'
		]);
	});

	it('escapes user punctuation and folds long notes', () => {
		const notes = 'palavra '.repeat(40);
		const ics = generateTripICS({ ...trip, title: 'Dinner, then fado; late', notes } as Trip);
		expect(logical(ics)).toContain('SUMMARY:✈️ Dinner\\, then fado\\; late');
		expect(only(ics, 'trip-').DESCRIPTION).toBe(notes);
		for (const line of ics.split('\r\n')) {
			expect(new TextEncoder().encode(line).length).toBeLessThanOrEqual(75);
		}
	});

	it('emits one event per flight segment', () => {
		const flight = {
			...base,
			_id: 'flt:01H1234567890ABCDEFGHJKMNQ',
			type: 'flight',
			bookingRef: 'ABC123',
			segments: [
				{
					airline: 'LATAM',
					flightNumber: 'LA123',
					from: { code: 'GRU' },
					to: { code: 'CJC' },
					departLocal: '2026-08-02T08:00',
					arriveLocal: '2026-08-02T10:30'
				}
			],
			order: 0,
			attachmentIds: []
		} as unknown as Flight;
		const seg = only(generateTripICS(trip, { flights: [flight] }), 'flt-');
		expect(seg.SUMMARY).toBe('✈️ LATAM LA123 GRU → CJC');
		expect(seg.DTSTART).toBe('20260802T080000');
		expect(seg.DTEND).toBe('20260802T103000');
		expect(seg.DESCRIPTION).toContain('Booking ref: ABC123');
	});

	it('rolls an overnight flight onto the next day', () => {
		const flight = {
			...base,
			_id: 'flt:01H1234567890ABCDEFGHJKMNQ',
			type: 'flight',
			segments: [{ departLocal: '2026-08-02T23:30', arriveLocal: '06:15' }],
			order: 0,
			attachmentIds: []
		} as unknown as Flight;
		const seg = only(generateTripICS(trip, { flights: [flight] }), 'flt-');
		expect(seg.DTSTART).toBe('20260802T233000');
		expect(seg.DTEND).toBe('20260803T061500');
		expect(seg.DTEND > seg.DTSTART).toBe(true);
	});

	it('emits reservations with their kind and confirmation', () => {
		const reservation = {
			...base,
			_id: 'res:01H1234567890ABCDEFGHJKMNQ',
			type: 'reservation',
			kind: 'lodging',
			name: 'Hotel San Pedro',
			start: '2026-08-01',
			end: '2026-08-07',
			confirmation: 'CONF-9',
			location: { name: 'Calle Caracoles 123' },
			details: {},
			attachmentIds: [],
			order: 0
		} as unknown as Reservation;
		const res = only(generateTripICS(trip, { reservations: [reservation] }), 'res-');
		expect(res.SUMMARY).toBe('🏨 Hotel San Pedro');
		expect(res.CATEGORIES).toBe('Lodging');
		expect(res['DTSTART;VALUE=DATE']).toBe('20260801');
		expect(res['DTEND;VALUE=DATE']).toBe('20260808');
		expect(res.DESCRIPTION).toBe('Confirmation: CONF-9');
	});

	it('skips documents that cannot be placed on a calendar', () => {
		const ics = generateTripICS(trip, {
			items: [
				{ _id: 'i1' } as Partial<ItineraryItem>,
				{ _id: 'i2', title: 'No date' } as Partial<ItineraryItem>
			],
			flights: [{ _id: 'f1', segments: [{}] } as unknown as Partial<Flight>],
			reservations: [{ _id: 'r1' } as Partial<Reservation>]
		});
		expect(Object.keys(events(ics))).toEqual(['trip-01H1234567890ABCDEFGHJKMNP@itinera']);
	});
});
