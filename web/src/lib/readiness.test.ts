/**
 * Unit tests for $lib/readiness.ts – the Overview's readiness score.
 *
 * Dates are plain ISO days, as the page passes them in, so the clock is never
 * read here. Each check is exercised on its own data, then the ordering and
 * the arithmetic are pinned down together.
 */

import { describe, expect, it } from 'vitest';
import type { ChecklistItem, Expense, Flight, FlightSegment, Reservation } from '$lib/db';
import { computeReadiness, type ReadinessInput } from './readiness';

const TODAY = '2026-06-01';

function trip(overrides: Partial<ReadinessInput['trip']> = {}): ReadinessInput['trip'] {
	return {
		_id: 'trip1',
		startDate: '2026-07-01',
		endDate: '2026-07-10',
		homeCurrency: 'EUR',
		...overrides
	};
}

function input(overrides: Partial<ReadinessInput> = {}): ReadinessInput {
	return {
		trip: trip(),
		flights: [],
		reservations: [],
		checklist: [],
		expenses: [],
		...overrides
	};
}

function segment(departLocal: string, overrides: Partial<FlightSegment> = {}): FlightSegment {
	return {
		departLocal,
		from: { code: 'BCN' },
		to: { code: 'FCO' },
		seat: '14A',
		...overrides
	};
}

function flight(overrides: Partial<Flight> = {}): Flight {
	return {
		_id: 'fl1',
		type: 'flight',
		tripid: 'trip1',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deletedAt: null,
		schemaVersion: 1,
		segments: [segment('2026-06-20T09:00')],
		bookingRef: 'ABC123',
		attachmentIds: [],
		order: 0,
		costType: 'total',
		...overrides
	} as unknown as Flight;
}

function reservation(overrides: Partial<Reservation> = {}): Reservation {
	return {
		_id: 'res1',
		type: 'reservation',
		tripid: 'trip1',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deletedAt: null,
		schemaVersion: 1,
		kind: 'lodging',
		name: 'Hotel',
		start: '2026-07-01T15:00',
		end: '2026-07-04T11:00',
		confirmation: 'CONF-1',
		attachmentIds: ['att1'],
		details: {},
		order: 0,
		costType: 'total',
		...overrides
	} as unknown as Reservation;
}

function check(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
	return {
		_id: 'chk1',
		type: 'checklistItem',
		tripid: 'trip1',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deletedAt: null,
		schemaVersion: 1,
		text: 'Passport',
		done: false,
		important: false,
		order: 0,
		...overrides
	} as unknown as ChecklistItem;
}

function expense(overrides: Partial<Expense> = {}): Expense {
	return {
		_id: 'exp1',
		type: 'expense',
		tripid: 'trip1',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deletedAt: null,
		schemaVersion: 1,
		description: 'Dinner',
		category: 'food',
		amountEstimate: 40,
		currency: 'EUR',
		fxRate: null,
		paid: false,
		costType: 'total',
		...overrides
	} as unknown as Expense;
}

describe('computeReadiness', () => {
	it('scores a fully prepared trip 100 with no items', () => {
		const result = computeReadiness(
			input({
				flights: [flight({ segments: [segment('2026-06-20T09:00')] })],
				reservations: [
					reservation({ kind: 'lodging', start: '2026-07-01T15:00', attachmentIds: ['att1'] })
				],
				checklist: [check({ text: 'Passport', done: true, important: true })],
				expenses: [expense({ currency: 'USD', fxRate: 0.9 })]
			}),
			TODAY
		);

		expect(result.score).toBe(100);
		expect(result.items).toEqual([]);
	});
});

describe('reservations without a confirmation', () => {
	it('flags upcoming and undated bookings, but not past ones', () => {
		const result = computeReadiness(
			input({
				reservations: [
					reservation({
						_id: 'r1',
						name: 'Hotel One',
						start: '2026-06-10T15:00',
						confirmation: ''
					}),
					reservation({
						_id: 'r2',
						name: 'Dinner',
						kind: 'restaurant',
						start: null,
						confirmation: undefined
					}),
					reservation({
						_id: 'r3',
						name: 'Old stay',
						start: '2026-05-10T15:00',
						confirmation: ''
					})
				]
			}),
			TODAY
		);

		const item = result.items.find((entry) => entry.id === 'reservations-unconfirmed');
		expect(item?.severity).toBe('warning');
		expect(item?.count).toBe(2);
		expect(item?.detail).toContain('Hotel One');
		expect(item?.detail).toContain('1 more');
		expect(item?.href).toBe('/trip/trip1/bookings?tab=reservations');
	});

	it('stays quiet when every booking has a confirmation', () => {
		const result = computeReadiness(
			input({
				reservations: [
					reservation({ start: '2026-06-10T15:00', confirmation: 'CONF-1' }),
					reservation({ _id: 'r2', start: null, name: 'Dinner', confirmation: 'CONF-2' })
				]
			}),
			TODAY
		);

		expect(result.items.some((entry) => entry.id === 'reservations-unconfirmed')).toBe(false);
	});
});

describe('flights missing check-in details', () => {
	it('flags a flight inside 72 hours without a seat', () => {
		const result = computeReadiness(
			input({
				flights: [flight({ segments: [segment('2026-06-03T09:00', { seat: '' })] })]
			}),
			TODAY
		);

		const item = result.items.find((entry) => entry.id === 'flights-check-in');
		expect(item?.severity).toBe('warning');
		expect(item?.count).toBe(1);
		expect(item?.detail).toContain('BCN → FCO');
		expect(item?.href).toBe('/trip/trip1/bookings?tab=flights');
	});

	it('escalates a flight leaving today or tomorrow to danger', () => {
		const result = computeReadiness(
			input({ flights: [flight({ segments: [segment('2026-06-02T09:00', { seat: '' })] })] }),
			TODAY
		);

		expect(result.items.find((entry) => entry.id === 'flights-check-in')?.severity).toBe('danger');
	});

	it('accepts a seat or a booking reference', () => {
		const result = computeReadiness(
			input({ flights: [flight({ segments: [segment('2026-06-02T09:00')] })] }),
			TODAY
		);

		expect(result.items.some((entry) => entry.id === 'flights-check-in')).toBe(false);
	});

	it('still flags a flight with a seat but no booking reference', () => {
		const result = computeReadiness(
			input({
				flights: [
					flight({ bookingRef: '', segments: [segment('2026-06-03T09:00', { seat: '14A' })] })
				]
			}),
			TODAY
		);

		expect(result.items.some((entry) => entry.id === 'flights-check-in')).toBe(true);
	});

	it('ignores flights that leave later than 72 hours', () => {
		const result = computeReadiness(
			input({
				flights: [flight({ bookingRef: '', segments: [segment('2026-06-10T09:00', { seat: '' })] })]
			}),
			TODAY
		);

		expect(result.items.some((entry) => entry.id === 'flights-check-in')).toBe(false);
	});
});

describe('essentials still unchecked', () => {
	it('counts only important, unfinished items', () => {
		const result = computeReadiness(
			input({
				checklist: [
					check({ _id: 'c1', text: 'Passport', important: true, done: false }),
					check({ _id: 'c2', text: 'Socks', important: false, done: false }),
					check({ _id: 'c3', text: 'Visa', important: true, done: true }),
					check({ _id: 'c4', text: 'Insurance', important: true, done: false })
				]
			}),
			TODAY
		);

		const item = result.items.find((entry) => entry.id === 'checklist-essentials');
		expect(item?.severity).toBe('warning');
		expect(item?.count).toBe(2);
		expect(item?.detail).toContain('Passport');
		expect(item?.detail).toContain('1 more');
		expect(item?.href).toBe('/trip/trip1/checklist');
	});
});

describe('costs missing an exchange rate', () => {
	it('flags foreign amounts with no rate', () => {
		const result = computeReadiness(
			input({
				expenses: [
					expense({
						_id: 'e1',
						description: 'Dinner',
						currency: 'USD',
						fxRate: null,
						amountEstimate: 40
					}),
					expense({ _id: 'e2', description: 'Taxi', currency: 'USD', fxRate: 0.9 }),
					expense({ _id: 'e3', description: 'Museum', currency: 'EUR', fxRate: null }),
					expense({
						_id: 'e4',
						description: 'Empty',
						currency: 'USD',
						fxRate: null,
						amountEstimate: null
					})
				]
			}),
			TODAY
		);

		const item = result.items.find((entry) => entry.id === 'costs-missing-fx');
		expect(item?.severity).toBe('warning');
		expect(item?.count).toBe(1);
		expect(item?.detail).toContain('Dinner');
		expect(item?.href).toBe('/trip/trip1/costs');
	});
});

describe('a trip starting with no lodging', () => {
	it('flags a start inside the next seven days', () => {
		const result = computeReadiness(input({ trip: trip({ startDate: '2026-06-06' }) }), TODAY);

		const item = result.items.find((entry) => entry.id === 'trip-no-lodging');
		expect(item?.severity).toBe('danger');
		expect(item?.count).toBe(1);
		expect(item?.detail).toContain('5 days');
		expect(item?.href).toBe('/trip/trip1/bookings?tab=reservations');
	});

	it('speaks in today’s terms when the trip starts now', () => {
		const result = computeReadiness(input({ trip: trip({ startDate: TODAY }) }), TODAY);

		expect(result.items.find((entry) => entry.id === 'trip-no-lodging')?.detail).toContain('today');
	});

	it('is satisfied by a lodging reservation', () => {
		const result = computeReadiness(
			input({
				trip: trip({ startDate: '2026-06-06' }),
				reservations: [reservation({ kind: 'lodging', start: '2026-06-06T15:00' })]
			}),
			TODAY
		);

		expect(result.items.some((entry) => entry.id === 'trip-no-lodging')).toBe(false);
	});

	it('ignores trips further out or already started', () => {
		const later = computeReadiness(input({ trip: trip({ startDate: '2026-06-20' }) }), TODAY);
		const past = computeReadiness(input({ trip: trip({ startDate: '2026-05-20' }) }), TODAY);

		expect(later.items.some((entry) => entry.id === 'trip-no-lodging')).toBe(false);
		expect(past.items.some((entry) => entry.id === 'trip-no-lodging')).toBe(false);
	});
});

describe('bookings without attachments', () => {
	it('flags bookings in the next week with nothing attached', () => {
		const result = computeReadiness(
			input({
				flights: [flight({ segments: [segment('2026-06-04T09:00')], attachmentIds: [] })],
				reservations: [
					reservation({
						_id: 'r1',
						name: 'Hotel',
						start: '2026-06-05T15:00',
						kind: 'lodging',
						attachmentIds: []
					}),
					reservation({
						_id: 'r2',
						name: 'Car',
						kind: 'car',
						start: '2026-06-06T09:00',
						attachmentIds: ['att1']
					})
				]
			}),
			TODAY
		);

		const item = result.items.find((entry) => entry.id === 'bookings-no-attachments');
		expect(item?.severity).toBe('info');
		expect(item?.count).toBe(2);
		expect(item?.detail).toContain('BCN → FCO');
		expect(item?.detail).toContain('1 more');
		expect(item?.href).toBe('/trip/trip1/bookings');
	});

	it('ignores bookings beyond the window', () => {
		const result = computeReadiness(
			input({
				flights: [flight({ segments: [segment('2026-06-20T09:00')], attachmentIds: [] })],
				reservations: [reservation({ start: '2026-06-20T15:00', attachmentIds: [] })]
			}),
			TODAY
		);

		expect(result.items.some((entry) => entry.id === 'bookings-no-attachments')).toBe(false);
	});
});

describe('score and ordering', () => {
	it('orders danger before warning before info and adds their penalties', () => {
		const result = computeReadiness(
			input({
				trip: trip({ startDate: '2026-06-03' }),
				flights: [flight({ segments: [segment('2026-06-06T09:00')], attachmentIds: [] })],
				checklist: [check({ text: 'Passport', important: true, done: false })]
			}),
			TODAY
		);

		expect(result.items.map((entry) => entry.id)).toEqual([
			'trip-no-lodging',
			'checklist-essentials',
			'bookings-no-attachments'
		]);
		// 100 - 18 (danger) - 10 (warning) - 5 (info)
		expect(result.score).toBe(67);
	});

	it('scales a check by its count, but caps the extra', () => {
		const essentials = (count: number) =>
			Array.from({ length: count }, (_, index) =>
				check({ _id: `c${index}`, text: `Item ${index}`, important: true, done: false })
			);

		const five = computeReadiness(input({ checklist: essentials(5) }), TODAY);
		const ten = computeReadiness(input({ checklist: essentials(10) }), TODAY);

		// 10 + min(4, count - 1) * 2 = 18 either way.
		expect(five.score).toBe(82);
		expect(ten.score).toBe(82);
		expect(five.items[0].detail).toContain('4 more');
	});

	it('never drops below zero', () => {
		const result = computeReadiness(
			input({
				trip: trip({ startDate: TODAY }),
				flights: [
					flight({
						bookingRef: '',
						segments: [segment(TODAY, { seat: '' })],
						attachmentIds: []
					})
				],
				reservations: Array.from({ length: 10 }, (_, index) =>
					reservation({
						_id: `r${index}`,
						start: TODAY,
						kind: 'car',
						confirmation: '',
						attachmentIds: []
					})
				),
				checklist: Array.from({ length: 10 }, (_, index) =>
					check({ _id: `c${index}`, important: true, done: false })
				),
				expenses: Array.from({ length: 10 }, (_, index) =>
					expense({ _id: `e${index}`, currency: 'USD', fxRate: null })
				)
			}),
			TODAY
		);

		expect(result.score).toBe(0);
	});

	it('skips clock-dependent checks when today cannot be read', () => {
		const result = computeReadiness(
			input({
				trip: trip({ startDate: '2026-06-03' }),
				reservations: [reservation({ start: '2026-06-03T15:00', confirmation: '' })],
				checklist: [check({ text: 'Passport', important: true, done: false })]
			}),
			'not-a-date'
		);

		expect(result.items.map((entry) => entry.id)).toEqual(['checklist-essentials']);
	});
});
