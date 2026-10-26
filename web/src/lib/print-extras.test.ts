/**
 * Unit tests for $lib/print-extras.ts – what the cover sheet keeps and what its
 * QR codes carry.
 *
 * The payload assertions are deliberately exact strings: a QR that a check-in
 * desk cannot read is worse than no QR, so the text fallback is part of the
 * contract rather than an implementation detail.
 */

import { describe, expect, it } from 'vitest';
import type { Flight, Reservation } from '$lib/db';
import { coverFacts, flightRowLabel, qrCodes, qrPayload } from './print-extras';

function flight(overrides: Partial<Flight> = {}): Flight {
	return {
		_id: 'flight:01',
		type: 'flight',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deletedAt: null,
		schemaVersion: 1,
		segments: [],
		attachmentIds: [],
		order: 0,
		costType: 'total',
		...overrides
	};
}

function reservation(overrides: Partial<Reservation> = {}): Reservation {
	return {
		_id: 'reservation:01',
		type: 'reservation',
		createdAt: '2026-01-01T00:00:00.000Z',
		updatedAt: '2026-01-01T00:00:00.000Z',
		deletedAt: null,
		schemaVersion: 1,
		details: {},
		attachmentIds: [],
		order: 0,
		costType: 'total',
		...overrides
	};
}

describe('coverFacts', () => {
	it('keeps a flight number next to its confirmation reference', () => {
		const facts = coverFacts(
			[
				flight({
					_id: 'flight:out',
					bookingRef: 'ABC123',
					segments: [{ airline: 'LATAM', flightNumber: 'LA8084' }]
				})
			],
			[]
		);

		expect(facts.flights).toEqual([
			{
				id: 'flight:out',
				reference: 'ABC123',
				segments: [{ carrier: 'LATAM', number: 'LA8084' }]
			}
		]);
		expect(flightRowLabel(facts.flights[0])).toBe('LATAM LA8084');
	});

	it('keeps a stay address and phone', () => {
		const facts = coverFacts(
			[],
			[
				reservation({
					_id: 'reservation:stay',
					kind: 'lodging',
					name: 'Casa do Mar',
					confirmation: 'HTL-9',
					location: { name: 'Casa do Mar', address: 'Rua da Praia 7, Lisboa' },
					contact: { phone: '+351 21 000 0000' }
				})
			]
		);

		expect(facts.stays).toEqual([
			{
				id: 'reservation:stay',
				name: 'Casa do Mar',
				address: 'Rua da Praia 7, Lisboa',
				phone: '+351 21 000 0000',
				reference: 'HTL-9'
			}
		]);
	});

	it('leaves out bookings with nothing worth printing at a desk', () => {
		const facts = coverFacts(
			[flight({ segments: [{ airline: 'LATAM', flightNumber: 'LA8084' }] })],
			[
				reservation({ kind: 'lodging' }),
				reservation({ _id: 'reservation:02', kind: 'restaurant', name: 'Taberna' })
			]
		);

		expect(facts).toEqual({ flights: [], stays: [] });
	});
});

describe('qrPayload', () => {
	it('uses a stored check-in URL as it is', () => {
		expect(
			qrPayload({
				kind: 'flight',
				reference: 'ABC123',
				label: 'LATAM LA8084',
				url: 'https://latam.com/checkin'
			})
		).toBe('https://latam.com/checkin');
	});

	it('encodes a short text line instead of inventing a URL', () => {
		expect(qrPayload({ kind: 'flight', reference: 'ABC123', label: 'LATAM LA8084' })).toBe(
			'CHECK-IN LATAM LA8084 ABC123'
		);
		expect(qrPayload({ kind: 'stay', reference: 'HTL-9', label: 'Casa do Mar' })).toBe(
			'BOOKING Casa do Mar HTL-9'
		);
	});

	it('ignores a non-http stored URL', () => {
		expect(
			qrPayload({
				kind: 'stay',
				reference: 'HTL-9',
				label: 'Casa do Mar',
				url: 'javascript:alert(1)'
			})
		).toBe('BOOKING Casa do Mar HTL-9');
	});

	it('returns nothing without a reference', () => {
		expect(qrPayload({ kind: 'stay', reference: '   ', label: 'Casa do Mar' })).toBeNull();
	});
});

describe('qrCodes', () => {
	it('makes one code per flight reference and stay confirmation', () => {
		const codes = qrCodes(
			[
				flight({
					_id: 'flight:out',
					bookingRef: 'ABC123',
					checkInUrl: 'https://latam.com/checkin',
					segments: [{ airline: 'LATAM', flightNumber: 'LA8084' }]
				})
			],
			[
				reservation({
					_id: 'reservation:stay',
					kind: 'lodging',
					name: 'Casa do Mar',
					confirmation: 'HTL-9'
				})
			]
		);

		expect(codes).toEqual([
			{
				id: 'flight:out',
				kind: 'flight',
				reference: 'ABC123',
				caption: 'LATAM LA8084 · ABC123',
				payload: 'https://latam.com/checkin'
			},
			{
				id: 'reservation:stay',
				kind: 'stay',
				reference: 'HTL-9',
				caption: 'Casa do Mar · HTL-9',
				payload: 'BOOKING Casa do Mar HTL-9'
			}
		]);
	});

	it('encodes a booking that has nothing but a reference', () => {
		const codes = qrCodes([], [reservation({ kind: 'lodging', confirmation: 'ABC123' })]);

		expect(codes).toEqual([
			{
				id: 'reservation:01',
				kind: 'stay',
				reference: 'ABC123',
				caption: 'ABC123',
				payload: 'BOOKING ABC123'
			}
		]);
	});

	it('makes no code for bookings with no reference', () => {
		const codes = qrCodes(
			[flight({ segments: [{ airline: 'LATAM', flightNumber: 'LA8084' }] })],
			[reservation({ kind: 'lodging', name: 'Casa do Mar', contact: { phone: '+351 21 000' } })]
		);

		expect(codes).toEqual([]);
	});
});
