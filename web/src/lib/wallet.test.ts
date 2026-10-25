/**
 * Unit tests for $lib/wallet.ts – the ticket wallet ordering.
 *
 * Times are local wall-clock strings, exactly as bookings store them, so these
 * cases read like a traveller's day: a flight at 08:40 is compared at 08:40 on
 * the phone that will show it at the gate.
 */

import { describe, expect, it } from 'vitest';
import type { Flight, Reservation } from '$lib/db';
import { buildWallet, flightItem, isStay, localMomentKey, stayItem } from './wallet';

interface Entry {
	id: string;
	start: string | null;
	end?: string | null;
}

const entry = (id: string, start: string | null, end: string | null = null): Entry => ({
	id,
	start,
	end
});

const ids = (items: readonly Entry[]): string[] => items.map((item) => item.id);

describe('localMomentKey', () => {
	it('reduces a local timestamp to minutes on a comparable scale', () => {
		expect(localMomentKey('2026-06-05T08:40')).toBe(20260605 * 1440 + 8 * 60 + 40);
	});

	it('treats a date-only value as the start of that day', () => {
		expect(localMomentKey('2026-06-05')).toBe(20260605 * 1440);
	});

	it('returns null when there is no readable date', () => {
		expect(localMomentKey(null)).toBeNull();
		expect(localMomentKey('')).toBeNull();
		expect(localMomentKey('not a date')).toBeNull();
	});
});

describe('buildWallet', () => {
	const now = '2026-06-05T12:00';

	it('puts the soonest upcoming booking first and marks it next', () => {
		const wallet = buildWallet(
			[
				entry('later', '2026-06-06T09:00'),
				entry('soon', '2026-06-05T18:30'),
				entry('latest', '2026-06-09T07:15')
			],
			now
		);

		expect(wallet.next?.id).toBe('soon');
		expect(ids(wallet.upcoming)).toEqual(['later', 'latest']);
		expect(wallet.past).toEqual([]);
	});

	it('files earlier moments under past, most recent first', () => {
		const wallet = buildWallet(
			[
				entry('this-morning', '2026-06-05T09:00'),
				entry('yesterday', '2026-06-04T21:30'),
				entry('tonight', '2026-06-05T22:00')
			],
			now
		);

		expect(wallet.next?.id).toBe('tonight');
		expect(ids(wallet.past)).toEqual(['this-morning', 'yesterday']);
	});

	it('keeps a stay that is in progress in upcoming, ordered by check-out', () => {
		const wallet = buildWallet(
			[
				// Checked in yesterday, checks out tomorrow: the card is needed now.
				entry('hotel', '2026-06-04T15:00', '2026-06-06T11:00'),
				// A flight before check-out is the next thing the traveller needs.
				entry('flight', '2026-06-05T18:00', null)
			],
			now
		);

		expect(wallet.next?.id).toBe('flight');
		expect(wallet.upcoming.map((item) => item.id)).toEqual(['hotel']);
		expect(wallet.past).toEqual([]);
	});

	it('files a stay under past once check-out has passed', () => {
		const wallet = buildWallet([entry('hotel', '2026-06-01T15:00', '2026-06-03T11:00')], now);

		expect(wallet.next).toBeNull();
		expect(wallet.past.map((item) => item.id)).toEqual(['hotel']);
	});

	it('sorts undated bookings after every dated one', () => {
		const wallet = buildWallet(
			[entry('undated', null), entry('dated', '2026-06-06T09:00'), entry('also-undated', null)],
			now
		);

		expect(wallet.next?.id).toBe('dated');
		expect(ids(wallet.upcoming)).toEqual(['also-undated', 'undated']);
	});

	it('breaks equal moments by id so the list cannot reshuffle', () => {
		const wallet = buildWallet(
			[entry('bravo', '2026-06-05T18:00'), entry('alpha', '2026-06-05T18:00')],
			now
		);

		expect(wallet.next?.id).toBe('alpha');
		expect(wallet.upcoming.map((item) => item.id)).toEqual(['bravo']);
	});

	it('never calls anything past when the clock is unreadable', () => {
		const wallet = buildWallet([entry('old', '2020-01-01T08:00')], 'not a time');

		expect(wallet.next?.id).toBe('old');
		expect(wallet.past).toEqual([]);
	});
});

describe('wallet items', () => {
	it('treats only lodging as a stay', () => {
		expect(isStay({ kind: 'lodging' } as Reservation)).toBe(true);
		expect(isStay({ kind: 'car' } as Reservation)).toBe(false);
		expect(isStay({} as Reservation)).toBe(false);
	});

	it('maps a flight to its first departure', () => {
		const flight = {
			_id: 'flight:1',
			segments: [{ departLocal: '2026-06-05T08:40' }, { departLocal: '2026-06-05T13:10' }]
		} as unknown as Flight;

		const item = flightItem(flight);

		expect(item.id).toBe('flight:1');
		expect(item.start).toBe('2026-06-05T08:40');
		expect(item.end).toBeNull();
		expect(item.kind).toBe('flight');
	});

	it('maps a stay to its check-in and check-out', () => {
		const reservation = {
			_id: 'reservation:1',
			kind: 'lodging',
			start: '2026-06-04T15:00',
			end: '2026-06-06T11:00'
		} as Reservation;

		const item = stayItem(reservation);

		expect(item.id).toBe('reservation:1');
		expect(item.start).toBe('2026-06-04T15:00');
		expect(item.end).toBe('2026-06-06T11:00');
		expect(item.kind).toBe('stay');
	});
});
