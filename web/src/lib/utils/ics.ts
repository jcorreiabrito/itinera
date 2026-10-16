import type { Flight, ItineraryItem, Reservation, Trip } from '$lib/db';

/**
 * Offline iCalendar export.
 *
 * This is the twin of `api/app/routers/calendar.py`, and it is a *deliberate*
 * second implementation rather than a copy: the server feed needs the home
 * server reachable, and the whole point of the download button is that it works
 * on a plane. The rules they share are pinned by tests on both sides.
 *
 * Two things were wrong here and neither shows in the rendered output:
 *
 *  - values went in raw, so a title containing a comma (`Dinner, then fado`)
 *    became two values and any note over 75 characters produced a malformed
 *    line (RFC 5545 §3.1 caps a content line at 75 *octets* and gives `TEXT`
 *    an escape syntax, §3.3.11);
 *  - the item UID embedded a timestamp, so re-importing an updated file
 *    produced a second copy of every activity instead of updating the first.
 */

const MAX_OCTETS = 75;

/** Control characters have no representation in `TEXT`; TAB is the exception. */
// eslint-disable-next-line no-control-regex
const CONTROL = /[\u0000-\u0008\u000a-\u001f\u007f]/g;

/** Escape a value for a `TEXT`-valued property (RFC 5545 §3.3.11). */
export function escapeText(value: unknown): string {
	const text = value === null || value === undefined ? '' : String(value);
	return (
		text
			.replace(/\r\n/g, '\n')
			.replace(/\r/g, '\n')
			// Backslash first, or it would double the escapes added after it.
			.replace(/\\/g, '\\\\')
			.replace(/;/g, '\\;')
			.replace(/,/g, '\\,')
			.replace(/\n/g, '\\n')
			.replace(CONTROL, '')
	);
}

/**
 * Split one content line to the 75-*octet* limit of RFC 5545 §3.1.
 *
 * The limit is octets, not characters, and the continuation is a single
 * leading space — so `line.slice(i, i + 75)` both miscounts accented text (two
 * octets in UTF-8) and can cut a multi-byte character in half, which a strict
 * parser rejects rather than repairs. Titles and notes are free text and
 * routinely exceed the limit.
 */
export function foldLine(line: string): string[] {
	if (octetLength(line) <= MAX_OCTETS) return [line];
	const parts: string[] = [];
	let current = '';
	let used = 0;
	let limit = MAX_OCTETS;
	for (const char of line) {
		const width = octetLength(char);
		if (used + width > limit) {
			parts.push(current);
			current = '';
			used = 0;
			limit = MAX_OCTETS - 1; // the continuation's leading space
		}
		current += char;
		used += width;
	}
	parts.push(current);
	return [parts[0], ...parts.slice(1).map((part) => ` ${part}`)];
}

function octetLength(value: string): number {
	return new TextEncoder().encode(value).length;
}

/** `"14:30"` / `"9:00"` / `"1430"` -> `"143000"`, or null when it is not a time. */
export function normaliseTime(value?: string | null): string | null {
	if (!value) return null;
	const digits = String(value).replace(/\D/g, '');
	if (digits.length < 3) return null;
	return digits.padStart(4, '0').padEnd(6, '0').slice(0, 6);
}

/** `"193000"` -> `"203000"`, wrapping past midnight back to `"003000"`. */
export function plusOneHour(time: string | null): string | null {
	if (time === null) return null;
	const hours = (Number(time.slice(0, 2)) + 1) % 24;
	return `${String(hours).padStart(2, '0')}${time.slice(2)}`;
}

/** `"2026-10-17T08:00"` -> `["2026-10-17", "08:00"]`; date-only and time-only work. */
export function splitLocal(value?: string | null): [string | null, string | null] {
	if (!value) return [null, null];
	const [head, ...rest] = String(value).split('T');
	if (rest.length) return [head || null, rest.join('T') || null];
	// No separator: an 8-digit run is a date, anything shorter is a clock time.
	const digits = head.replace(/\D/g, '');
	if (digits && digits.length < 8) return [null, head];
	return [head || null, null];
}

/** `"2026-10-17"` + optional `"08:00"` -> `"20261017"` / `"20261017T080000"`. */
export function formatIcsDate(dateStr?: string | null, timeStr?: string | null): string {
	if (!dateStr) return '';
	const cleanDate = String(dateStr).replace(/\D/g, '').slice(0, 8);
	if (cleanDate.length !== 8) return '';
	const time = normaliseTime(timeStr);
	return time ? `${cleanDate}T${time}` : cleanDate;
}

/** Next calendar day — `DTEND` is exclusive for all-day events. */
export function nextDayIso(isoDate: string): string | null {
	const parts = isoDate.slice(0, 10).split('-').map(Number);
	if (parts.length !== 3 || parts.some((part) => !Number.isFinite(part))) return null;
	const dt = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2] + 1));
	return dt.toISOString().slice(0, 10);
}

function addOneDay(dateStr?: string | null): string {
	if (!dateStr) return '';
	const next = nextDayIso(String(dateStr));
	return next ? formatIcsDate(next) : formatIcsDate(dateStr);
}

/**
 * ISO-8601 -> `YYYYMMDDTHHMMSSZ`.
 *
 * `DTSTAMP` is when *this revision* of the event was created, not when the file
 * was written. A stamp that changes on every export makes an imported update
 * look like a new event.
 */
export function icsStamp(value?: string | null): string | null {
	if (!value) return null;
	const parsed = new Date(value);
	if (Number.isNaN(parsed.getTime())) return null;
	return `${parsed.toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`;
}

/** A stable UID from a document id, which already reads `type:hash`. */
function uid(docId: string | undefined, suffix = ''): string {
	return `${String(docId ?? 'unknown').replace(/:/g, '-')}${suffix}@itinera`;
}

/** A `Geolocation` document, a plain string, or nothing -> a LOCATION value. */
function locationOf(value: unknown): string {
	if (typeof value === 'string') return value;
	if (value && typeof value === 'object') {
		const geo = value as { name?: string; address?: string };
		return geo.name || geo.address || '';
	}
	return '';
}

const KIND_EMOJI: Record<string, string> = {
	lodging: '🏨',
	car: '🚗',
	restaurant: '🍽️',
	activity: '🎟️',
	transport: '🚆',
	other: '📌'
};

export interface TripIcsInput {
	items?: Partial<ItineraryItem>[];
	flights?: Partial<Flight>[];
	reservations?: Partial<Reservation>[];
}

export function generateTripICS(trip: Trip, input: TripIcsInput = {}): string {
	const { items = [], flights = [], reservations = [] } = input;
	// The fallback only applies to documents with no `updatedAt`; every document
	// this app writes is stamped, so the output is stable across exports.
	const fallback = icsStamp(new Date().toISOString())!;
	const primaryDest = locationOf(trip.destinations?.[0]?.name);
	const title = trip.title || 'Trip';

	const lines: string[] = [
		'BEGIN:VCALENDAR',
		'VERSION:2.0',
		'PRODID:-//Itinera Trip Planner//EN',
		'CALSCALE:GREGORIAN',
		'METHOD:PUBLISH',
		`X-WR-CALNAME:${escapeText(`✈️ ${title}`)}`
	];

	// --- The trip itself -----------------------------------------------------
	const tripStart = formatIcsDate(trip.startDate);
	if (tripStart) {
		const stamp = icsStamp(trip.updatedAt) ?? fallback;
		const master = [
			`DTSTAMP:${stamp}`,
			`LAST-MODIFIED:${stamp}`,
			`SUMMARY:${escapeText(`✈️ ${title}`)}`,
			'CATEGORIES:Trip'
		];
		if (trip.notes) master.push(`DESCRIPTION:${escapeText(trip.notes)}`);
		if (primaryDest) master.push(`LOCATION:${escapeText(primaryDest)}`);
		master.push(
			`DTSTART;VALUE=DATE:${tripStart}`,
			// RFC 5545: DTEND for an all-day event is exclusive.
			`DTEND;VALUE=DATE:${addOneDay(trip.endDate || trip.startDate)}`
		);
		lines.push('BEGIN:VEVENT', `UID:${uid(trip._id)}`, ...master, 'END:VEVENT');
	}

	// --- Itinerary items -----------------------------------------------------
	for (const item of items) {
		const date = formatIcsDate(item.date);
		if (!date) continue;
		const startTime = item.startTime ?? (item as { time?: string }).time;
		const stamp = icsStamp(item.updatedAt) ?? fallback;
		const event = [
			`DTSTAMP:${stamp}`,
			`LAST-MODIFIED:${stamp}`,
			`SUMMARY:${escapeText(item.title || 'Activity')}`
		];
		if (item.category) event.push(`CATEGORIES:${escapeText(item.category)}`);
		if (item.notes) event.push(`DESCRIPTION:${escapeText(item.notes)}`);
		const loc = locationOf(item.location);
		if (loc) event.push(`LOCATION:${escapeText(loc)}`);

		const start = normaliseTime(startTime);
		if (start) {
			event.push(`DTSTART:${formatIcsDate(item.date, startTime)}`);
			const end = normaliseTime(item.endTime);
			// An event with no end renders as nothing in a month grid, and
			// `endTime` is optional. An hour is a convention, not data.
			event.push(
				`DTEND:${formatIcsDate(item.date, end && end !== start ? item.endTime : plusOneHour(start))}`
			);
		} else {
			event.push(`DTSTART;VALUE=DATE:${date}`, `DTEND;VALUE=DATE:${addOneDay(item.date)}`);
		}
		lines.push('BEGIN:VEVENT', `UID:${uid(item._id)}`, ...event, 'END:VEVENT');
	}

	// --- Flights, one event per segment --------------------------------------
	//
	// Times are *floating* local times (no `Z`, no `TZID`): the documents store
	// the wall-clock time printed on the ticket with no offset, so declaring a
	// timezone would be inventing one.
	for (const flight of flights) {
		const stamp = icsStamp(flight.updatedAt) ?? fallback;
		(flight.segments ?? []).forEach((seg, index) => {
			const [departDate, departTime] = splitLocal(seg.departLocal);
			if (!formatIcsDate(departDate)) return;
			const [arriveDate, arriveTime] = splitLocal(seg.arriveLocal);

			const heading = [seg.airline, seg.flightNumber].filter(Boolean).join(' ');
			const origin = seg.from?.code || seg.from?.city || '';
			const destination = seg.to?.code || seg.to?.city || '';
			const route = origin || destination ? `${origin} → ${destination}` : '';

			const event = [
				`DTSTAMP:${stamp}`,
				`LAST-MODIFIED:${stamp}`,
				`SUMMARY:${escapeText([`✈️ ${heading}`.trim(), route].filter(Boolean).join(' '))}`,
				'CATEGORIES:Flight'
			];
			const details = [
				flight.bookingRef ? `Booking ref: ${flight.bookingRef}` : '',
				seg.seat ? `Seat: ${seg.seat}` : '',
				seg.terminal ? `Terminal: ${seg.terminal}` : '',
				seg.gate ? `Gate: ${seg.gate}` : '',
				seg.notes || ''
			].filter(Boolean);
			if (details.length) event.push(`DESCRIPTION:${escapeText(details.join('\n'))}`);
			if (origin) event.push(`LOCATION:${escapeText(origin)}`);

			const start = formatIcsDate(departDate, departTime);
			event.push(`DTSTART:${start}`);
			const arrival = normaliseTime(arriveTime);
			if (arrival) {
				// A red-eye arrival is *before* its departure on the clock, so
				// an end on the departure's own date would precede the start and
				// clients drop the event.
				let endDate = arriveDate;
				if (!endDate && normaliseTime(departTime) && arrival <= normaliseTime(departTime)!)
					endDate = nextDayIso(departDate!);
				event.push(`DTEND:${formatIcsDate(endDate ?? departDate, arriveTime)}`);
			} else {
				event.push(`DTEND:${addOneDay(departDate)}`);
			}
			lines.push('BEGIN:VEVENT', `UID:${uid(flight._id, `-${index}`)}`, ...event, 'END:VEVENT');
		});
	}

	// --- Reservations --------------------------------------------------------
	for (const res of reservations) {
		const [startDate, startTime] = splitLocal(res.start);
		if (!formatIcsDate(startDate)) continue;
		const [endDate, endTime] = splitLocal(res.end);
		const stamp = icsStamp(res.updatedAt) ?? fallback;
		const kind = res.kind || 'other';
		const name = res.name || 'Reservation';

		const event = [
			`DTSTAMP:${stamp}`,
			`LAST-MODIFIED:${stamp}`,
			`SUMMARY:${escapeText(`${KIND_EMOJI[kind] ?? '📌'} ${name}`)}`,
			`CATEGORIES:${escapeText(kind.charAt(0).toUpperCase() + kind.slice(1))}`
		];
		if (res.confirmation)
			event.push(`DESCRIPTION:${escapeText(`Confirmation: ${res.confirmation}`)}`);
		const loc = locationOf(res.location);
		if (loc) event.push(`LOCATION:${escapeText(loc)}`);

		const start = normaliseTime(startTime);
		if (start) {
			event.push(`DTSTART:${formatIcsDate(startDate, startTime)}`);
			const end = normaliseTime(endTime);
			event.push(
				`DTEND:${formatIcsDate(end ? (endDate ?? startDate) : startDate, end ?? plusOneHour(start))}`
			);
		} else {
			event.push(
				`DTSTART;VALUE=DATE:${formatIcsDate(startDate)}`,
				`DTEND;VALUE=DATE:${addOneDay(endDate ?? startDate)}`
			);
		}
		lines.push('BEGIN:VEVENT', `UID:${uid(res._id)}`, ...event, 'END:VEVENT');
	}

	lines.push('END:VCALENDAR');

	// The trailing CRLF is part of the grammar, not cosmetic: some parsers treat
	// an unterminated final line as a truncated file.
	return `${lines.flatMap(foldLine).join('\r\n')}\r\n`;
}

export function downloadTripICS(trip: Trip, input: TripIcsInput = {}): void {
	if (typeof window === 'undefined') return;
	const content = generateTripICS(trip, input);
	const blob = new Blob([content], { type: 'text/calendar;charset=utf-8' });
	const url = URL.createObjectURL(blob);
	const a = document.createElement('a');
	a.href = url;
	const nameStr = trip.destinations?.[0]?.name || trip.title || 'trip';
	a.download = `${nameStr.toLowerCase().replace(/[^a-z0-9]+/g, '-')}.ics`;
	document.body.appendChild(a);
	a.click();
	document.body.removeChild(a);
	URL.revokeObjectURL(url);
}
