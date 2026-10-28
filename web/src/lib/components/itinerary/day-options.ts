/**
 * Day descriptors for the itinerary controls.
 *
 * A day is no longer always a date: a dream plan has numbered days. The page
 * selects a day by its **key** (`2026-11-03`, `dream-3`, or `ideas`), and the
 * pickers need a small, display-ready view of each day rather than a raw
 * `string[]` of dates. This module is the one place that turns a `DayTimeline`
 * into that view and back, so a form and the timeline cannot disagree about
 * which key maps to which placement.
 */

import { DateTime } from 'luxon';

import { dreamDayKey, dreamOrdinalFromKey, isIsoDate, weekdayShortName } from '$lib/db/date-mode';
import type { DayTimeline } from '$lib/db/repositories/itinerary';
import { formatWeekdayDate } from '$lib/format';
import { getLanguage, t } from '$lib/i18n.svelte';

/** The minimal day description a picker or dialog needs. */
export interface DayOption {
	/** Opaque day identity: an ISO date or `dream-{n}`. */
	key: string;
	/** Real date, `null` on a dream day. */
	date: string | null;
	/** Dream position (1-based), `null` on a dated day. */
	ordinal: number | null;
	/** Soft weekday wish (1 = Monday … 7 = Sunday), if any. */
	weekdayHint: number | null;
}

export function toDayOption(day: DayTimeline): DayOption {
	/*
	 * `DayTimeline.ordinal` is the day's position in the plan and is set for
	 * dated trips too, but a `DayOption` only carries an ordinal when the day is
	 * numbered. Keeping it on a dated option made every chip and heading read
	 * "Day 1" after dates were applied.
	 */
	const dream = day.kind === 'dream';
	return {
		key: day.key,
		date: day.date,
		ordinal: dream ? day.ordinal : null,
		weekdayHint: dream ? day.weekdayHint : null
	};
}

/** The localized short name of a day's weekday wish, or `''`. */
export function dayWish(option: Pick<DayOption, 'weekdayHint'>): string {
	return weekdayShortName(option.weekdayHint, getLanguage());
}

/** "Day 3", "Mon 3 Nov", or "Unscheduled ideas". */
export function dayOptionLabel(option: DayOption): string {
	// A real date wins: an ordinal is only a label when the day has no date.
	if (option.date) return formatWeekdayDate(option.date);
	if (option.ordinal != null) {
		const day = t('day_n', { n: String(option.ordinal) });
		const wish = dayWish(option);
		return wish ? t('day_with_wish', { day, wish: t('weekday_wish_short', { day: wish }) }) : day;
	}
	return t('unscheduled_ideas');
}

/** The key an item is currently placed on, or `null` for Ideas. */
export function dayKeyOf(item: {
	date?: string | null;
	dayOrdinal?: number | null;
}): string | null {
	if (item.dayOrdinal != null) return dreamDayKey(item.dayOrdinal);
	return item.date ?? null;
}

/**
 * Turn a picker's choice into the repository's placement fields.
 *
 * A dream key clears the date and sets the ordinal; an ISO date does the
 * reverse. Anything else (an empty option, `ideas`) is unplaced.
 */
export function placementFromDayKey(key: string | null | undefined): {
	date: string | null;
	dayOrdinal: number | null;
} {
	const ordinal = dreamOrdinalFromKey(key);
	if (ordinal != null) return { date: null, dayOrdinal: ordinal };
	return { date: isIsoDate(key) ? key : null, dayOrdinal: null };
}

/** True when the key names one of the trip's days (as opposed to Ideas). */
export function isTripDayKey(key: string | null | undefined, days: readonly DayOption[]): boolean {
	return !!key && days.some((day) => day.key === key);
}

/** Weekday parts for a dated day; empty for a dream day. */
export function datedParts(option: Pick<DayOption, 'date'>): {
	weekday: string;
	day: string;
	month: string;
} {
	if (!option.date) return { weekday: '', day: '', month: '' };
	const dt = DateTime.fromISO(option.date, { zone: 'utc' });
	return {
		weekday: dt.isValid ? dt.toFormat('ccc', { locale: getLanguage() }) : '',
		day: dt.isValid ? dt.toFormat('d') : '',
		month: dt.isValid ? dt.toFormat('LLL', { locale: getLanguage() }) : ''
	};
}
