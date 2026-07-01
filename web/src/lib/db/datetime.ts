/**
 * Pure date / time-zone helpers built on Luxon.
 *
 * These power derived values across the app – trip status & countdown, the
 * itinerary day list, per-day cost subtotals, and the time-zone-aware flight
 * duration / layover / "+1 day" maths. Kept free of any PouchDB import so they
 * are trivially unit-testable.
 *
 * Conventions:
 * - **Dates** are ISO calendar dates (`YYYY-MM-DD`). Date-only comparisons use
 *   string ordering, which is correct for this format and avoids time-zone drift.
 * - **Flight times** are stored as a *local* ISO datetime plus an explicit IANA
 *   zone on each endpoint, so a leg crossing zones computes correctly.
 */

import { DateTime } from 'luxon';
import { t } from '../i18n.svelte';

/** Trip display status derived purely from dates (Archived is layered on by the UI). */
export type TripDateStatus = 'Upcoming' | 'Active' | 'Past';

/** Today's ISO date (`YYYY-MM-DD`) in the given zone (default: system zone). */
export function todayIso(zone?: string): string {
  return (zone ? DateTime.now().setZone(zone) : DateTime.now()).toISODate() ?? '';
}

/**
 * Number of nights between two ISO dates (`endDate - startDate` in days).
 * Computed in UTC to avoid DST artefacts. Negative spans clamp to 0.
 */
export function nightsBetween(startDate: string, endDate: string): number {
  const start = DateTime.fromISO(startDate, { zone: 'utc' });
  const end = DateTime.fromISO(endDate, { zone: 'utc' });
  if (!start.isValid || !end.isValid) return 0;
  return Math.max(0, Math.round(end.diff(start, 'days').days));
}

/** Inclusive day count for a trip span (nights + 1). */
export function tripDayCount(startDate: string, endDate: string): number {
  return nightsBetween(startDate, endDate) + 1;
}

/**
 * Derive `Upcoming` | `Active` | `Past` from a trip's dates relative to `today`.
 * Pure string comparison on ISO dates.
 */
export function tripDateStatus(
  startDate: string,
  endDate: string,
  today: string = todayIso()
): TripDateStatus {
  if (today < startDate) return 'Upcoming';
  if (today > endDate) return 'Past';
  return 'Active';
}

/** Every ISO date from `startDate` to `endDate` inclusive (the itinerary day list). */
export function eachDateInRange(startDate: string, endDate: string): string[] {
  const start = DateTime.fromISO(startDate, { zone: 'utc' });
  const end = DateTime.fromISO(endDate, { zone: 'utc' });
  if (!start.isValid || !end.isValid || end < start) return [];
  const dates: string[] = [];
  for (let d = start; d <= end; d = d.plus({ days: 1 })) {
    const iso = d.toISODate();
    if (iso) dates.push(iso);
  }
  return dates;
}

/** Whole-day difference `b - a` (can be negative). */
export function dayDelta(a: string, b: string): number {
  const da = DateTime.fromISO(a, { zone: 'utc' });
  const db = DateTime.fromISO(b, { zone: 'utc' });
  if (!da.isValid || !db.isValid) return 0;
  return Math.round(db.diff(da, 'days').days);
}

/**
 * Shift an ISO **date** (`YYYY-MM-DD`) by a whole number of days, preserving the
 * date-only format. Used when duplicating a trip onto new dates. Returns the
 * input unchanged if it is not a valid date.
 */
export function shiftIsoDate(date: string | null | undefined, days: number): string | null {
  if (!date) return date ?? null;
  const d = DateTime.fromISO(date, { zone: 'utc' });
  if (!d.isValid) return date;
  return d.plus({ days }).toISODate();
}

/**
 * Shift an ISO **datetime** by whole days while preserving the original zone /
 * offset formatting. Used to move dated reservations / flight legs when a trip
 * is duplicated.
 */
export function shiftIsoDateTime(datetime: string | null | undefined, days: number): string | null {
  if (!datetime) return datetime ?? null;
  const d = DateTime.fromISO(datetime, { setZone: true });
  if (!d.isValid) return datetime;
  return d.plus({ days }).toISO();
}

/**
 * Human countdown text for a trip card / hero, relative to `today`:
 * `"in 12 days"` · `"Day 3 of 8"` (active) · `"ended 2 weeks ago"`.
 */
export function countdownText(
  startDate: string,
  endDate: string,
  today: string = todayIso()
): string {
  const status = tripDateStatus(startDate, endDate, today);
  if (status === 'Active') {
    const dayNo = dayDelta(startDate, today) + 1;
    const total = tripDayCount(startDate, endDate);
    return t('day_of', { dayNo: String(dayNo), total: String(total) });
  }
  if (status === 'Upcoming') {
    const days = humanizeDays(dayDelta(today, startDate));
    return t('in_days', { days });
  }
  const days = humanizeDays(dayDelta(endDate, today));
  return t('ended_ago', { days });
}

/**
 * Turn a positive day count into a friendly phrase:
 * `0` → `"today"`, `1` → `"1 day"`, `13` → `"2 weeks"`, `70` → `"2 months"`.
 * Intended to be embedded (`"in {...}"`, `"{...} ago"`).
 */
export function humanizeDays(days: number): string {
  const n = Math.abs(Math.round(days));
  if (n === 0) return t('today');
  if (n === 1) return t('day');
  if (n < 14) return t('days_plural', { n: String(n) });
  if (n < 60) return t('weeks_plural', { n: String(Math.round(n / 7)) });
  if (n < 365) return t('months_plural', { n: String(Math.round(n / 30)) });
  const years = Math.round((n / 365) * 10) / 10;
  return years === 1 ? t('year_plural') : t('years_plural', { n: String(years) });
}

/** Resolve a stored local ISO datetime in its endpoint zone to an absolute instant. */
function zoned(localIso: string, zone?: string): DateTime {
  return DateTime.fromISO(localIso, zone ? { zone, setZone: true } : undefined);
}

/**
 * Time-zone-aware duration of a flight leg, in **minutes**.
 *
 * @param departLocal local ISO datetime at the origin airport
 * @param departZone  IANA zone of the origin airport
 * @param arriveLocal local ISO datetime at the destination airport
 * @param arriveZone  IANA zone of the destination airport
 * @returns whole minutes, or `null` if either timestamp is invalid
 */
export function legDurationMinutes(
  departLocal: string,
  departZone: string | undefined,
  arriveLocal: string,
  arriveZone: string | undefined
): number | null {
  const d = zoned(departLocal, departZone);
  const a = zoned(arriveLocal, arriveZone);
  if (!d.isValid || !a.isValid) return null;
  return Math.round(a.diff(d, 'minutes').minutes);
}

/**
 * Layover between two consecutive legs, in **minutes**
 * (`next.depart - prev.arrive`, time-zone aware). May be negative if the data
 * is inconsistent – callers can flag that.
 */
export function layoverMinutes(
  prevArriveLocal: string,
  prevArriveZone: string | undefined,
  nextDepartLocal: string,
  nextDepartZone: string | undefined
): number | null {
  const arrive = zoned(prevArriveLocal, prevArriveZone);
  const depart = zoned(nextDepartLocal, nextDepartZone);
  if (!arrive.isValid || !depart.isValid) return null;
  return Math.round(depart.diff(arrive, 'minutes').minutes);
}

/**
 * Calendar-day offset between a leg's local depart date and local arrive date
 * (the "+1" arrival marker). Compares the date portions of the stored *local*
 * timestamps, which is exactly what the UI displays.
 */
export function arrivalDayOffset(departLocal: string, arriveLocal: string): number {
  const departDate = departLocal.slice(0, 10);
  const arriveDate = arriveLocal.slice(0, 10);
  if (!departDate || !arriveDate) return 0;
  return dayDelta(departDate, arriveDate);
}

/** Format a minute count as `"2h 55m"` / `"45m"` / `"3h"`. */
export function formatDuration(minutes: number | null | undefined): string {
  if (minutes == null || Number.isNaN(minutes)) return '';
  const sign = minutes < 0 ? '-' : '';
  const total = Math.abs(Math.round(minutes));
  const h = Math.floor(total / 60);
  const m = total % 60;
  if (h && m) return `${sign}${h}h ${m}m`;
  if (h) return `${sign}${h}h`;
  return `${sign}${m}m`;
}

/** The local date portion (`YYYY-MM-DD`) of an ISO datetime, for day-bucketing. */
export function dateOf(iso: string | null | undefined): string | null {
  if (!iso) return null;
  return iso.slice(0, 10) || null;
}

/** Minutes-since-midnight of a `HH:mm`/ISO time, for stable timed-item sorting. */
export function minutesOfDay(time: string | null | undefined): number | null {
  if (!time) return null;
  // Accept `HH:mm`, `HH:mm:ss` or a full ISO datetime.
  const timePart = time.includes('T') ? time.split('T')[1] : time;
  const match = /^(\d{2}):(\d{2})/.exec(timePart);
  if (!match) return null;
  return Number(match[1]) * 60 + Number(match[2]);
}
