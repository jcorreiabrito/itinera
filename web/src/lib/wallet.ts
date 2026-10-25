/**
 * Ticket wallet – which booking the traveller needs next.
 *
 * Pure on purpose: the page owns the clock and passes the current local
 * wall-clock time in, the same way `$lib/today.ts` does. Booking times are
 * stored as local wall-clock strings with no zone attached, so they are
 * compared as the strings they are – never through `Date`, which would
 * reinterpret them in the device's zone and move an 08:40 departure.
 */

import { dateOf, minutesOfDay } from '$lib/db/datetime';
import type { Flight, Reservation } from '$lib/db';

/** The minimum a card needs to take part in the ordering. */
export interface WalletMoment {
	/** Document id; also the stable tie-break between equal moments. */
	id: string;
	/** Local wall-clock first departure (flight) or check-in (stay), if stored. */
	start: string | null;
	/** Local check-out of a stay. Absent or `null` for a flight. */
	end?: string | null;
}

/** A flight card. */
export interface WalletFlightItem extends WalletMoment {
	kind: 'flight';
	flight: Flight;
}

/** A lodging card. */
export interface WalletStayItem extends WalletMoment {
	kind: 'stay';
	reservation: Reservation;
}

export type WalletItem = WalletFlightItem | WalletStayItem;

/** The page's render split: the next card first, then the rest, then the past. */
export interface WalletBuckets<T extends WalletMoment> {
	/** The soonest upcoming card, or `null` when every card is in the past. */
	next: T | null;
	/** Every other upcoming card, soonest first. */
	upcoming: T[];
	/** Cards whose last useful moment has passed, most recent first. */
	past: T[];
}

/**
 * A lodging reservation is the wallet's "stay". Other reservation kinds are
 * restaurant tables and car keys, not the documents a check-in desk reads.
 */
export function isStay(reservation: Reservation): boolean {
	return reservation.kind === 'lodging';
}

/** Map a flight to its card. The moment is the first departure. */
export function flightItem(flight: Flight): WalletFlightItem {
	return {
		kind: 'flight',
		id: flight._id,
		start: flight.segments?.[0]?.departLocal ?? null,
		end: null,
		flight
	};
}

/** Map a lodging reservation to its card. The moment is check-in, then check-out. */
export function stayItem(reservation: Reservation): WalletStayItem {
	return {
		kind: 'stay',
		id: reservation._id,
		start: reservation.start ?? null,
		end: reservation.end ?? null,
		reservation
	};
}

/**
 * `YYYYMMDD × 1440 + minutes` for a local wall-clock value, or `null` when the
 * value carries no readable date. A missing time means the start of that day,
 * which is also how a date-only check-in should sort.
 */
export function localMomentKey(value: string | null | undefined): number | null {
	const date = dateOf(value);
	if (!date) return null;
	const digits = Number(date.replace(/-/g, ''));
	if (!Number.isFinite(digits)) return null;
	return digits * 1440 + (minutesOfDay(value) ?? 0);
}

/**
 * The moment this card is next needed.
 *
 * A flight is needed at departure; after that it is past. A stay is needed at
 * check-in, but once the traveller has checked in the useful moment becomes
 * check-out – using check-in would file tonight's hotel under "Past" the moment
 * they arrive at it.
 */
function needMoment(item: WalletMoment, nowKey: number | null): number | null {
	const start = localMomentKey(item.start);
	const end = localMomentKey(item.end);
	if (end == null) return start;
	if (start == null) return end;
	if (nowKey != null && nowKey >= start) return end;
	return start;
}

interface Moment<T> {
	item: T;
	key: number | null;
}

function bySoonest<T extends WalletMoment>(a: Moment<T>, b: Moment<T>): number {
	if (a.key == null && b.key == null) return a.item.id.localeCompare(b.item.id);
	if (a.key == null) return 1;
	if (b.key == null) return -1;
	return a.key - b.key || a.item.id.localeCompare(b.item.id);
}

function byMostRecent<T extends WalletMoment>(a: Moment<T>, b: Moment<T>): number {
	if (a.key == null && b.key == null) return a.item.id.localeCompare(b.item.id);
	if (a.key == null) return 1;
	if (b.key == null) return -1;
	return b.key - a.key || a.item.id.localeCompare(b.item.id);
}

/**
 * Split and order the wallet. Undated bookings stay in `upcoming` after every
 * dated one: without a moment the app cannot call them past, and hiding a
 * reservation it does not understand is worse than showing it late.
 */
export function buildWallet<T extends WalletMoment>(
	items: readonly T[],
	now: string
): WalletBuckets<T> {
	const nowKey = localMomentKey(now);
	const ahead: Moment<T>[] = [];
	const behind: Moment<T>[] = [];

	for (const item of items) {
		const key = needMoment(item, nowKey);
		if (key != null && nowKey != null && key < nowKey) behind.push({ item, key });
		else ahead.push({ item, key });
	}

	ahead.sort(bySoonest);
	behind.sort(byMostRecent);

	const [first = null, ...rest] = ahead;
	return {
		next: first ? first.item : null,
		upcoming: rest.map((entry) => entry.item),
		past: behind.map((entry) => entry.item)
	};
}
