/**
 * Dream-trip mode and day-key helpers.
 *
 * A trip is either **dated** (its days come from `startDate..endDate`) or
 * **dream** (its days are `1..dreamDayCount`). This module is pure and type-only
 * with respect to the document schemas, so it can be used from repositories,
 * components and tests without pulling in PouchDB.
 *
 * A **day key** is the opaque identity the UI uses for a day:
 * - `YYYY-MM-DD` for a dated day,
 * - `dream-{n}` for a numbered dream day,
 * - `ideas` for the Unscheduled bucket (defined by `url-state.ts`).
 */

import { DateTime } from 'luxon';

import type { ItineraryItem, Trip, TripDay } from './schemas';

export type TripMode = 'dated' | 'dream';

/** Upper bound for a dream plan. A year is already an implausibly long dream. */
export const DREAM_DAY_MAX = 366;

/** The day key for the Unscheduled / Ideas bucket. */
export const IDEAS_KEY = 'ideas';

/** True for a real ISO calendar date (`YYYY-MM-DD`), not just a date-shaped string. */
export function isIsoDate(value: string | null | undefined): value is string {
	if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
	return DateTime.fromISO(value, { zone: 'utc' }).isValid;
}

/**
 * Resolve the trip's committed scheduling mode.
 *
 * 1. An explicit `dateMode` wins.
 * 2. Otherwise a trip with **either** date present is dated. A half-entered
 *    range (one date, or an invalid one) must not silently become a dream plan;
 *    it stays a degraded dated trip until the user fixes it.
 * 3. A trip with neither a valid start nor a valid end is a dream. This is how
 *    the undated trips created by the template modal adopt the new mode without
 *    a data migration.
 */
export function resolveDateMode(trip: Pick<Trip, 'dateMode' | 'startDate' | 'endDate'>): TripMode {
	if (trip.dateMode === 'dream' || trip.dateMode === 'dated') return trip.dateMode;
	if (isIsoDate(trip.startDate) || isIsoDate(trip.endDate)) return 'dated';
	return 'dream';
}

export function isDreamTrip(trip: Pick<Trip, 'dateMode' | 'startDate' | 'endDate'>): boolean {
	return resolveDateMode(trip) === 'dream';
}

/**
 * The authoritative day count for a dream trip.
 *
 * `dreamDayCount` is the stored length; the highest ordinal already present is
 * a safety net for imported or hand-edited documents. A missing count means a
 * one-day plan rather than an empty itinerary.
 */
export function effectiveDreamDayCount(
	trip: Pick<Trip, 'dreamDayCount'>,
	days: readonly Pick<TripDay, 'ordinal'>[] = [],
	items: readonly Pick<ItineraryItem, 'dayOrdinal'>[] = []
): number {
	const fromDays = days.reduce((max, day) => Math.max(max, day.ordinal ?? 0), 0);
	const fromItems = items.reduce((max, item) => Math.max(max, item.dayOrdinal ?? 0), 0);
	const stored = trip.dreamDayCount ?? 0;
	return Math.min(DREAM_DAY_MAX, Math.max(1, stored, fromDays, fromItems));
}

/** Clamp a requested dream length into the supported range. */
export function clampDreamDayCount(count: number): number {
	if (!Number.isFinite(count)) return 1;
	return Math.min(DREAM_DAY_MAX, Math.max(1, Math.round(count)));
}

/** The day key for a dated day (the ISO date itself). */
export function datedDayKey(date: string): string {
	return date;
}

/** The day key for a dream day, e.g. `dream-3`. */
export function dreamDayKey(ordinal: number): string {
	return `dream-${ordinal}`;
}

/** True when a day key names a dream day. */
export function isDreamDayKey(key: string | null | undefined): boolean {
	return !!key && /^dream-\d+$/.test(key);
}

/** The ordinal encoded in a dream key, or `null` for any other key. */
export function dreamOrdinalFromKey(key: string | null | undefined): number | null {
	if (!isDreamDayKey(key)) return null;
	const ordinal = Number(key!.slice('dream-'.length));
	return Number.isInteger(ordinal) && ordinal >= 1 ? ordinal : null;
}

/** The real ISO date encoded in a dated key, or `null`. */
export function dateFromDayKey(key: string | null | undefined): string | null {
	return isIsoDate(key) ? key : null;
}

/** What a day key identifies. */
export type DayKeyKind = 'dated' | 'dream' | 'ideas' | 'invalid';

export function dayKeyKind(key: string | null | undefined): DayKeyKind {
	if (key === IDEAS_KEY) return 'ideas';
	if (isDreamDayKey(key)) return 'dream';
	if (isIsoDate(key)) return 'dated';
	return 'invalid';
}

/** Luxon weekday (1 = Monday … 7 = Sunday) for an ISO date, or `null`. */
export function weekdayOf(date: string | null | undefined): number | null {
	if (!isIsoDate(date)) return null;
	return DateTime.fromISO(date, { zone: 'utc' }).weekday;
}

/**
 * Short localized weekday name for a stored wish (1 = Monday … 7 = Sunday).
 * 2024-01-01 was a Monday, which makes the ordinal-to-name mapping obvious.
 */
export function weekdayShortName(hint: number | null | undefined, locale = 'en'): string {
	if (!hint || hint < 1 || hint > 7) return '';
	return DateTime.fromISO('2024-01-01', { zone: 'utc' })
		.plus({ days: hint - 1 })
		.setLocale(locale)
		.toFormat('ccc');
}
