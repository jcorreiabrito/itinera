/**
 * Trip readiness – how much of the pre-departure work is still open.
 *
 * The Overview's readiness card answers one question: "what still needs doing
 * before this trip?" Every check below reads a field the app already stores, so
 * the score can never disagree with the checklist or a booking it points at. A
 * check whose backing field does not exist is not invented here – there are
 * only the six the data model actually supports.
 *
 * Pure on purpose: the page owns the clock and passes today's ISO date in, so
 * the card can be pinned down in tests the same way `$lib/today.ts` is. The
 * only thing this module builds besides the score is the link to the section
 * that fixes each item (`resolve()` is deterministic and reads no state).
 */

import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';
import type { ChecklistItem, Expense, Flight, Reservation, Trip } from '$lib/db';
import { dateOf, dayDelta, shiftIsoDate } from '$lib/db/datetime';
import { expenseAmounts } from '$lib/db/money';
import { t, type TranslationKey } from '$lib/i18n.svelte';

/** How loud an item is, and the order the card lists them in. */
export type ReadinessSeverity = 'danger' | 'warning' | 'info';

/** One thing to fix, with the section that fixes it. */
export interface ReadinessItem {
	id: string;
	severity: ReadinessSeverity;
	titleKey: TranslationKey;
	/** Specifics for the row — the first affected booking's name, plus a count. */
	detail: string;
	count: number;
	href?: ResolvedPathname;
}

/** The card's whole payload. */
export interface ReadinessResult {
	/** 0–100; 100 means every check passed. */
	score: number;
	/** Open checks, most urgent first. Empty means all clear. */
	items: ReadinessItem[];
}

/** The trip fields the checks need (a full `Trip` satisfies this). */
export type ReadinessTrip = Pick<Trip, '_id' | 'startDate' | 'endDate' | 'homeCurrency'>;

/** Everything the score is computed from – the documents the Overview loads. */
export interface ReadinessInput {
	trip: ReadinessTrip;
	flights: readonly Flight[];
	reservations: readonly Reservation[];
	checklist: readonly ChecklistItem[];
	expenses: readonly Expense[];
}

/** A flight still leaves within three calendar days of today. */
const FLIGHT_WINDOW_DAYS = 3;

/** A flight leaving today or tomorrow is close enough to be urgent. */
const URGENT_FLIGHT_DAYS = 1;

/** The trip start and booking-document checks look a week ahead. */
const TRIP_WINDOW_DAYS = 7;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const SEVERITY_RANK: Record<ReadinessSeverity, number> = { danger: 0, warning: 1, info: 2 };

/**
 * What one open check costs the score.
 *
 * A danger costs more than a warning, an info more than nothing; each extra
 * occurrence adds a little, capped per check so one messy list (fifty unchecked
 * essentials) cannot bury the other five checks. The numbers are deliberately
 * coarse: the score is a nudge, not an actuarial figure, and a user who fixes
 * one danger should see the ring move visibly.
 */
const SEVERITY_PENALTY: Record<ReadinessSeverity, number> = { danger: 18, warning: 10, info: 5 };

function penaltyFor(item: ReadinessItem): number {
	const extra = Math.min(Math.max(0, item.count - 1), 4) * 2;
	return Math.min(SEVERITY_PENALTY[item.severity] + extra, 30);
}

/** The calendar date of a stored ISO date/datetime, or `null` if unreadable. */
function calendarDate(value: string | null | undefined): string | null {
	const date = dateOf(value);
	return date && ISO_DATE.test(date) ? date : null;
}

/** Whether a stored date falls in `[today, today + days]` (inclusive). */
function withinDays(value: string | null | undefined, today: string, days: number): boolean {
	const date = calendarDate(value);
	const until = shiftIsoDate(today, days);
	return date != null && until != null && date >= today && date <= until;
}

/** "BCN → FCO" for a flight, or a generic label when it has no route yet. */
function flightLabel(flight: Flight): string {
	const segments = flight.segments ?? [];
	const from = segments[0]?.from?.code ?? segments[0]?.from?.city;
	const to = segments[segments.length - 1]?.to?.code ?? segments[segments.length - 1]?.to?.city;
	return from && to ? `${from} → ${to}` : t('flight');
}

// --- The checks -------------------------------------------------------------

/**
 * Reservations that are still ahead of the traveller and have no confirmation
 * number. An undated booking counts: it has not happened yet, it simply has no
 * date to prove it. Past reservations are not "unready", they are history.
 */
function unconfirmedReservations(
	input: ReadinessInput,
	today: string | null,
	href: ResolvedPathname
): ReadinessItem | null {
	if (!today) return null;
	const missing = input.reservations.filter((reservation) => {
		const start = calendarDate(reservation.start);
		return (start === null || start >= today) && !(reservation.confirmation ?? '').trim();
	});
	if (missing.length === 0) return null;

	const name = missing[0].name?.trim() || t('reservation');
	return {
		id: 'reservations-unconfirmed',
		severity: 'warning',
		titleKey: 'readiness_reservations_title',
		detail:
			missing.length === 1
				? t('readiness_reservations_detail_one', { name })
				: t('readiness_reservations_detail_many', {
						name,
						rest: String(missing.length - 1)
					}),
		count: missing.length,
		href
	};
}

/**
 * Flights leaving within 72 hours without a seat or a booking reference (the
 * PNR the airline's check-in page asks for). Only the legs inside the window
 * are judged: an outbound next month with no seat yet is not a problem today.
 */
function unpreparedFlights(
	input: ReadinessInput,
	today: string | null,
	href: ResolvedPathname
): ReadinessItem | null {
	if (!today) return null;

	const affected: { label: string; urgent: boolean }[] = [];
	for (const flight of input.flights) {
		const windowSegments = (flight.segments ?? []).filter((segment) =>
			withinDays(segment.departLocal, today, FLIGHT_WINDOW_DAYS)
		);
		if (windowSegments.length === 0) continue;

		const noSeat = windowSegments.some((segment) => !(segment.seat ?? '').trim());
		const noReference = !(flight.bookingRef ?? '').trim();
		if (!noSeat && !noReference) continue;

		affected.push({
			label: flightLabel(flight),
			urgent: windowSegments.some((segment) =>
				withinDays(segment.departLocal, today, URGENT_FLIGHT_DAYS)
			)
		});
	}
	if (affected.length === 0) return null;

	const name = affected[0].label;
	return {
		id: 'flights-check-in',
		severity: affected.some((entry) => entry.urgent) ? 'danger' : 'warning',
		titleKey: 'readiness_flights_title',
		detail:
			affected.length === 1
				? t('readiness_flights_detail_one', { name })
				: t('readiness_flights_detail_many', {
						name,
						rest: String(affected.length - 1)
					}),
		count: affected.length,
		href
	};
}

/**
 * Checklist items the user (or the built-in Essentials template, which marks
 * its must-not-forget rows) flagged as important and has not ticked off. The
 * `important` flag is the existing vocabulary for "essential" – there is no
 * group by that name, and inventing one would miss every custom checklist.
 */
function uncheckedEssentials(input: ReadinessInput, href: ResolvedPathname): ReadinessItem | null {
	const unchecked = input.checklist.filter((item) => !item.done && item.important === true);
	if (unchecked.length === 0) return null;

	const name = unchecked[0].text?.trim() || t('label_item');
	return {
		id: 'checklist-essentials',
		severity: 'warning',
		titleKey: 'readiness_essentials_title',
		detail:
			unchecked.length === 1
				? t('readiness_essentials_detail_one', { name })
				: t('readiness_essentials_detail_many', {
						name,
						rest: String(unchecked.length - 1)
					}),
		count: unchecked.length,
		href
	};
}

/**
 * Foreign-currency costs with no `fxRate`. `expenseAmounts` already decides
 * which amounts are missing a rate (there must be an amount to convert, and the
 * currency must differ from the trip's home one); the same helper the budget
 * roll-ups use, so the card and the Costs page agree on the number.
 */
function missingExchangeRates(input: ReadinessInput, href: ResolvedPathname): ReadinessItem | null {
	const home = (input.trip.homeCurrency ?? 'EUR').toUpperCase();
	const missing = input.expenses.filter((expense) => expenseAmounts(expense, home).missingRate);
	if (missing.length === 0) return null;

	const name = missing[0].description?.trim() || t('label_expense');
	return {
		id: 'costs-missing-fx',
		severity: 'warning',
		titleKey: 'readiness_fx_title',
		detail:
			missing.length === 1
				? t('readiness_fx_detail_one', { name })
				: t('readiness_fx_detail_many', {
						name,
						rest: String(missing.length - 1)
					}),
		count: missing.length,
		href
	};
}

/**
 * A trip that starts within a week with no lodging reservation at all. Only
 * `kind === 'lodging'` counts: a restaurant booking is not a bed.
 */
function missingLodging(
	input: ReadinessInput,
	today: string | null,
	href: ResolvedPathname
): ReadinessItem | null {
	if (!today) return null;

	const start = calendarDate(input.trip.startDate);
	if (!start || start < today) return null;
	const days = dayDelta(today, start);
	if (days > TRIP_WINDOW_DAYS) return null;
	if (input.reservations.some((reservation) => reservation.kind === 'lodging')) return null;

	return {
		id: 'trip-no-lodging',
		severity: 'danger',
		titleKey: 'readiness_lodging_title',
		detail:
			days === 0
				? t('readiness_lodging_detail_today')
				: t('readiness_lodging_detail', { days: String(days) }),
		count: 1,
		href
	};
}

/**
 * Bookings in the next week with no ticket or voucher attached. The attachment
 * list is the booking's own `attachmentIds`; the bytes live in separate
 * attachment documents, which this pure module never reads.
 */
function bookingsWithoutAttachments(
	input: ReadinessInput,
	today: string | null,
	href: ResolvedPathname
): ReadinessItem | null {
	if (!today) return null;

	const labels: string[] = [];
	for (const flight of input.flights) {
		const withinWindow = (flight.segments ?? []).some((segment) =>
			withinDays(segment.departLocal, today, TRIP_WINDOW_DAYS)
		);
		if (!withinWindow || (flight.attachmentIds ?? []).length > 0) continue;
		labels.push(flightLabel(flight));
	}
	for (const reservation of input.reservations) {
		if (!withinDays(reservation.start, today, TRIP_WINDOW_DAYS)) continue;
		if ((reservation.attachmentIds ?? []).length > 0) continue;
		labels.push(reservation.name?.trim() || t('reservation'));
	}
	if (labels.length === 0) return null;

	const name = labels[0];
	return {
		id: 'bookings-no-attachments',
		severity: 'info',
		titleKey: 'readiness_attachments_title',
		detail:
			labels.length === 1
				? t('readiness_attachments_detail_one', { name })
				: t('readiness_attachments_detail_many', {
						name,
						rest: String(labels.length - 1)
					}),
		count: labels.length,
		href
	};
}

// --- The score --------------------------------------------------------------

/**
 * Compute the readiness score and its open checks.
 *
 * @param input the trip and the documents the Overview already loads
 * @param today today's ISO date (`YYYY-MM-DD`), supplied by the page
 */
export function computeReadiness(input: ReadinessInput, today: string): ReadinessResult {
	const tripId = input.trip._id;
	const todayDate = ISO_DATE.test(today) ? today : null;
	const links = {
		flights: resolve('/trip/[id]/bookings?tab=flights', { id: tripId }),
		reservations: resolve('/trip/[id]/bookings?tab=reservations', { id: tripId }),
		bookings: resolve('/trip/[id]/bookings', { id: tripId }),
		checklist: resolve('/trip/[id]/checklist', { id: tripId }),
		costs: resolve('/trip/[id]/costs', { id: tripId })
	};

	const items = [
		unconfirmedReservations(input, todayDate, links.reservations),
		unpreparedFlights(input, todayDate, links.flights),
		uncheckedEssentials(input, links.checklist),
		missingExchangeRates(input, links.costs),
		missingLodging(input, todayDate, links.reservations),
		bookingsWithoutAttachments(input, todayDate, links.bookings)
	].filter((item): item is ReadinessItem => item !== null);

	items.sort(
		(a, b) =>
			SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] ||
			b.count - a.count ||
			a.id.localeCompare(b.id)
	);

	const score = Math.max(0, 100 - items.reduce((total, item) => total + penaltyFor(item), 0));

	return { score, items };
}
