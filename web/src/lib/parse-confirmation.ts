/**
 * Paste a booking confirmation – the pure, offline half of the paste sheet.
 *
 * A confirmation email is prose written for a person, not a record: the same
 * facts appear under different labels on every provider ("Check-in", "Arrival",
 * "Check in from"), and dates arrive in a dozen spellings. This module extracts
 * only what a label or an unmistakable token supports, attaches a confidence so
 * the UI can show how sure it is, and reports the lines it did not use so the
 * caller can keep the pasted text in the notes instead of dropping it.
 *
 * Deliberately conservative: an ambiguous slash date (`12/09/2026`) is skipped
 * unless the text states its format, because guessing month-first versus
 * day-first silently books a traveller on the wrong day. A wrong date is worse
 * than a missing one the user can type in.
 */

export type Confidence = 'high' | 'medium';

/** One extracted value plus how much the surrounding text supports it. */
export interface ParsedValue<T = string> {
	value: T;
	confidence: Confidence;
}

export interface ParsedConfirmation {
	name?: ParsedValue;
	address?: ParsedValue;
	phone?: ParsedValue;
	email?: ParsedValue;
	/** Reservation confirmation or airline booking reference. */
	bookingRef?: ParsedValue;
	/** Check-in / departure / reservation date, ISO `YYYY-MM-DD`. */
	startDate?: ParsedValue;
	/** Check-in / departure / reservation time, 24h `HH:mm`. */
	startTime?: ParsedValue;
	/** Check-out / arrival date, ISO `YYYY-MM-DD`. */
	endDate?: ParsedValue;
	/** Check-out / arrival time, 24h `HH:mm`. */
	endTime?: ParsedValue;
	partySize?: ParsedValue<number>;
	flightNumber?: ParsedValue;
	departureAirport?: ParsedValue;
	arrivalAirport?: ParsedValue;
	passenger?: ParsedValue;
	/** Non-empty lines that produced no field; the caller keeps them verbatim. */
	unparsed: string[];
}

export type ParsedFieldKey = keyof Omit<ParsedConfirmation, 'unparsed'>;

/** Stable display order for the result list. */
export const PARSED_FIELD_KEYS: readonly ParsedFieldKey[] = [
	'name',
	'address',
	'phone',
	'email',
	'bookingRef',
	'startDate',
	'startTime',
	'endDate',
	'endTime',
	'partySize',
	'flightNumber',
	'departureAirport',
	'arrivalAirport',
	'passenger'
];

export interface ParsedFieldEntry {
	key: ParsedFieldKey;
	value: string;
	confidence: Confidence;
}

/** Every extracted field as a flat, ordered list for rendering. */
export function fieldEntries(parsed: ParsedConfirmation): ParsedFieldEntry[] {
	const entries: ParsedFieldEntry[] = [];
	for (const key of PARSED_FIELD_KEYS) {
		const field = parsed[key];
		if (!field) continue;
		entries.push({ key, value: String(field.value), confidence: field.confidence });
	}
	return entries;
}

// --- Date and time tokens ---------------------------------------------------

const MONTHS: Record<string, number> = {
	jan: 1,
	january: 1,
	janeiro: 1,
	feb: 2,
	february: 2,
	fevereiro: 2,
	mar: 3,
	march: 3,
	marco: 3,
	apr: 4,
	april: 4,
	abril: 4,
	may: 5,
	maio: 5,
	jun: 6,
	june: 6,
	junho: 6,
	jul: 7,
	july: 7,
	julho: 7,
	aug: 8,
	august: 8,
	agosto: 8,
	sep: 9,
	sept: 9,
	september: 9,
	setembro: 9,
	oct: 10,
	october: 10,
	outubro: 10,
	nov: 11,
	november: 11,
	novembro: 11,
	dec: 12,
	december: 12,
	dezembro: 12
};

interface Token {
	index: number;
	end: number;
	value: string;
}

function pad(value: number): string {
	return String(value).padStart(2, '0');
}

/** ISO date from parts, or `null` when the calendar has no such day. */
function isoDate(year: number, month: number, day: number): string | null {
	if (year < 2000 || year > 2099 || month < 1 || month > 12 || day < 1 || day > 31) return null;
	const date = new Date(Date.UTC(year, month - 1, day));
	if (
		date.getUTCFullYear() !== year ||
		date.getUTCMonth() !== month - 1 ||
		date.getUTCDate() !== day
	) {
		return null;
	}
	return `${year}-${pad(month)}-${pad(day)}`;
}

function monthNumber(token: string): number | null {
	const key = token.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\.$/, '');
	return MONTHS[key] ?? null;
}

/**
 * Read a numeric `d/m/y` or `m/d/y` ordering from a format hint in the text.
 * Both present means the text contradicts itself, so neither is trusted.
 */
function detectDateOrder(text: string): 'dmy' | 'mdy' | null {
	const dmy =
		/\b(?:dd|d)[/.-](?:mm|m)[/.-](?:yyyy|yy)\b/i.test(text) ||
		/\bday\s*[/.-]\s*month\s*[/.-]\s*year\b/i.test(text);
	const mdy =
		/\b(?:mm|m)[/.-](?:dd|d)[/.-](?:yyyy|yy)\b/i.test(text) ||
		/\bmonth\s*[/.-]\s*day\s*[/.-]\s*year\b/i.test(text);
	if (dmy === mdy) return null;
	return dmy ? 'dmy' : 'mdy';
}

function findDates(line: string, order: 'dmy' | 'mdy' | null): Token[] {
	const hits: Token[] = [];
	const push = (index: number | undefined, end: number, iso: string | null) => {
		if (iso && index != null) hits.push({ index, end, value: iso });
	};

	for (const match of line.matchAll(/\b(20\d{2})-(\d{1,2})-(\d{1,2})\b/g)) {
		const iso = isoDate(+match[1], +match[2], +match[3]);
		push(match.index, (match.index ?? 0) + match[0].length, iso);
	}

	const dayFirst =
		/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:de\s+)?([A-Za-zÀ-ÿ]{3,})\.?(?:\s+de)?\s+(\d{4})\b/gi;
	for (const match of line.matchAll(dayFirst)) {
		const month = monthNumber(match[2]);
		const iso = month ? isoDate(+match[3], month, +match[1]) : null;
		push(match.index, (match.index ?? 0) + match[0].length, iso);
	}

	const monthFirst =
		/\b([A-Za-zÀ-ÿ]{3,})\.?\s+(?:de\s+)?(\d{1,2})(?:st|nd|rd|th)?,?(?:\s+de)?\s+(\d{4})\b/gi;
	for (const match of line.matchAll(monthFirst)) {
		const month = monthNumber(match[1]);
		const iso = month ? isoDate(+match[3], month, +match[2]) : null;
		push(match.index, (match.index ?? 0) + match[0].length, iso);
	}

	if (order) {
		for (const match of line.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{4})\b/g)) {
			const day = order === 'dmy' ? +match[1] : +match[2];
			const month = order === 'dmy' ? +match[2] : +match[1];
			const iso = isoDate(+match[3], month, day);
			push(match.index, (match.index ?? 0) + match[0].length, iso);
		}
	}

	return hits
		.sort((a, b) => a.index - b.index)
		.filter((hit, i, all) => i === 0 || hit.index !== all[i - 1].index);
}

function time24(hour: number, minute: number): string | null {
	if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
	return `${pad(hour)}:${pad(minute)}`;
}

function findTimes(line: string): Token[] {
	const hits: Token[] = [];

	for (const match of line.matchAll(/\b(\d{1,2})(?::([0-5]\d))?\s*([ap])\.?m\b/gi)) {
		const hour = +match[1];
		if (hour < 1 || hour > 12) continue;
		const minute = match[2] ? +match[2] : 0;
		const pm = match[3].toLowerCase() === 'p';
		const value = time24((hour % 12) + (pm ? 12 : 0), minute);
		if (value && match.index != null) {
			hits.push({ index: match.index, end: match.index + match[0].length, value });
		}
	}

	const overlaps = (index: number, end: number) =>
		hits.some((hit) => index < hit.end && end > hit.index);

	for (const match of line.matchAll(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g)) {
		const index = match.index ?? 0;
		const end = index + match[0].length;
		if (overlaps(index, end)) continue;
		const value = time24(+match[1], +match[2]);
		if (value) hits.push({ index, end, value });
	}

	return hits.sort((a, b) => a.index - b.index);
}

// --- Keyword roles ----------------------------------------------------------

type Role = 'start' | 'end' | 'generic';

interface RoleHit {
	index: number;
	end: number;
	role: Role;
}

/** Airport / travel words decide what "arrival" and "departure" mean here. */
function isFlightContext(text: string): boolean {
	return (
		/\b(?:flight|flights|airline|airways|boarding|e-?ticket|itinerary|pnr)\b/i.test(text) ||
		/\b[A-Z]{3}\s*(?:→|->|–|—)\s*[A-Z]{3}\b/.test(text)
	);
}

function isLodgingContext(text: string): boolean {
	return /\b(?:hotel|hostel|guest\s*house|apartment|airbnb|room|rooms|night|nights|stay|check[\s-]?in|check[\s-]?out|property|lodging)\b/i.test(
		text
	);
}

function keywordHits(line: string, flight: boolean, lodging: boolean): RoleHit[] {
	const re =
		/check[\s-]?in|checkin|check[\s-]?out|checkout|arrival|arrive|arriving|departure|departs|departing|depart|reservation|booking|table|stay|dates?|when/gi;
	const hits: RoleHit[] = [];
	let directional = false;
	for (const match of line.matchAll(re)) {
		const word = match[0].toLowerCase();
		let role: Role;
		if (/^check/.test(word)) {
			role = /out/.test(word) ? 'end' : 'start';
		} else if (/^arriv/.test(word)) {
			// A hotel's "Arrival" is the check-in; everywhere else it is the end.
			role = flight ? 'end' : lodging ? 'start' : 'end';
		} else if (/^depart/.test(word)) {
			role = flight ? 'start' : lodging ? 'end' : 'start';
		} else {
			role = 'generic';
		}
		/*
		 * "Check-in time" / "Check-out date" are one label, not a direction plus
		 * a separate noun. Once the line has named a direction, the trailing
		 * generic word must not take the value back over.
		 */
		if (role === 'generic' && directional) continue;
		if (role !== 'generic') directional = true;
		if (match.index != null) {
			hits.push({ index: match.index, end: match.index + match[0].length, role });
		}
	}
	return hits;
}

function nearestRole(hits: readonly RoleHit[], index: number): Role | null {
	let before: RoleHit | null = null;
	for (const hit of hits) {
		if (hit.index <= index) before = hit;
		else break;
	}
	if (before) return before.role;
	return hits[0]?.role ?? null;
}

/** A colon between the label and the value is what makes a field high-confidence. */
function labelConfidence(line: string, hits: readonly RoleHit[], index: number): Confidence {
	let before: RoleHit | null = null;
	for (const hit of hits) {
		if (hit.end <= index) before = hit;
	}
	if (before && /[:#]/.test(line.slice(before.end, index))) return 'high';
	return 'medium';
}

// --- Labelled values --------------------------------------------------------

function squash(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

function stripTrailing(value: string): string {
	return squash(value).replace(/[.;,]+$/, '');
}

function validCode(value: string): string | null {
	const code = value.trim().replace(/[.,;:]+$/, '');
	if (!/^[A-Za-z0-9-]{5,15}$/.test(code)) return null;
	const digits = (code.match(/\d/g) ?? []).length;
	if (digits === 0) return null;
	if (digits === code.length && code.length < 6) return null;
	return code.toUpperCase();
}

function labelledCode(line: string): string | null {
	if (/\b(?:promo|discount|coupon)\s+code\b/i.test(line)) return null;
	const re =
		/\b(?:confirmation|booking|reservation|reference|ref|pnr|e-?ticket|code)\b(?:\s+(?:number|no\.?|code|ref(?:erence)?|id))?\s*[:#]?\s*([A-Za-z0-9][A-Za-z0-9-]{3,15})\b/gi;
	for (const match of line.matchAll(re)) {
		const code = validCode(match[1]);
		if (code) return code;
	}
	return null;
}

function labelledPhone(line: string): string | null {
	const re =
		/\b(?:phone|telephone|tel|ph|mobile|cell|contact)\b[^\d+]{0,24}([+()\d][\d\s().-]{5,24}\d)/i;
	const match = re.exec(line);
	if (!match) return null;
	const value = squash(match[1]);
	const digits = (value.match(/\d/g) ?? []).length;
	return digits >= 7 ? value : null;
}

const NAME_LABEL =
	/\b(?:hotel|property|restaurant|venue|place|accommodation|listing|home|apartment)\b(?:\s+name)?\s*:\s*(.+)$/i;
const NAME_SENTENCE =
	/\b(?:booking|reservation|stay)\s+(?:at|in)\s+(.{2,60}?)(?=\s+(?:is|has|was|for)\b|[,.;\n]|$)/i;

function labelledName(line: string): ParsedValue | null {
	const labelled = NAME_LABEL.exec(line);
	if (labelled) {
		const value = stripTrailing(labelled[1]);
		if (value.length >= 2 && /[A-Za-zÀ-ÿ]/.test(value)) {
			return { value, confidence: 'high' };
		}
	}
	const sentence = NAME_SENTENCE.exec(line);
	if (sentence) {
		const value = stripTrailing(sentence[1]);
		if (value.length >= 2 && /[A-Za-zÀ-ÿ]/.test(value) && !/\d/.test(value)) {
			return { value, confidence: 'medium' };
		}
	}
	return null;
}

function labelledAddress(line: string): string | null {
	if (/\be-?mail\s+address\b/i.test(line)) return null;
	const match = /\baddress\b[^:]*:\s*(.+)$/i.exec(line);
	if (!match) return null;
	const value = squash(match[1]);
	return value.length >= 5 && /[A-Za-zÀ-ÿ]/.test(value) ? value : null;
}

function labelledEmail(line: string): string | null {
	if (!/\b(?:e-?mail|mail)\b/i.test(line)) return null;
	const match = /[\w.+-]+@[\w-]+(?:\.[\w-]+)+/.exec(line);
	return match ? match[0] : null;
}

function labelledPassenger(line: string): string | null {
	const match =
		/\b(?:passenger|traveller|traveler|guest)\b(?:\s+name)?\s*[-:]\s*([A-Za-zÀ-ÿ][A-Za-zÀ-ÿ .'-]{1,60})$/i.exec(
			line
		);
	if (!match) return null;
	const value = squash(match[1]);
	return value.length >= 2 ? value : null;
}

function labelledPartySize(line: string): number | null {
	const match =
		/\b(?:party(?:\s+of)?|table\s+for|reservation\s+for|booking\s+for|guests?|people|persons?)\b\s*[:#-]?\s*(\d{1,2})\b/i.exec(
			line
		);
	if (!match) return null;
	const size = +match[1];
	return size >= 1 && size <= 20 ? size : null;
}

function labelledFlightNumber(line: string): string | null {
	const match =
		/\bflight(?:\s*(?:number|no\.?|nr\.?))?\s*[:#-]?\s*([A-Z]{2}\s?\d{1,4}[A-Z]?)\b/i.exec(line);
	return match ? match[1].replace(/\s+/g, '').toUpperCase() : null;
}

function airportCode(value: string): string | null {
	const paren = /\(([A-Za-z]{3})\)/.exec(value);
	if (paren) return paren[1].toUpperCase();
	const token = /\b([A-Z]{3})\b/.exec(value);
	if (token) return token[1];
	const exact = /^\s*([A-Za-z]{3})\s*$/.exec(value);
	return exact ? exact[1].toUpperCase() : null;
}

function labelledAirport(line: string, kind: 'from' | 'to'): string | null {
	const re =
		kind === 'from'
			? /\b(?:from|origin|departure(?:\s+airport)?|departs?\s+from)\b[^:\n]{0,24}:\s*(.+)$/i
			: /\b(?:to|destination|arrival(?:\s+airport)?|arrives?\s+(?:at|in))\b[^:\n]{0,24}:\s*(.+)$/i;
	const match = re.exec(line);
	return match ? airportCode(match[1]) : null;
}

function routeAirports(line: string): [string, string] | null {
	const match = /\b([A-Z]{3})\s*(?:→|->|–|—|-)\s*([A-Z]{3})\b/.exec(line);
	return match ? [match[1], match[2]] : null;
}

// --- Parser -----------------------------------------------------------------

type FoundMap = Partial<Record<ParsedFieldKey, ParsedValue<string | number>>>;

function put(
	found: FoundMap,
	key: Exclude<ParsedFieldKey, 'partySize'>,
	value: string,
	confidence: Confidence
) {
	const existing = found[key];
	// A later explicit label ("Hotel: …") beats an earlier sentence guess.
	if (existing === undefined || (existing.confidence === 'medium' && confidence === 'high')) {
		found[key] = { value, confidence };
	}
}

export function parseConfirmation(text: string): ParsedConfirmation {
	const lines = text
		.split(/\r?\n/)
		.map((line) => line.replace(/\u00a0/g, ' ').trim())
		.filter((line) => line.length > 0);
	const joined = lines.join('\n');
	const order = detectDateOrder(joined);
	const flight = isFlightContext(joined);
	const lodging = isLodgingContext(joined) && !flight;
	const found: FoundMap = {};
	const consumed = new Set<number>();

	lines.forEach((line, index) => {
		let used = false;
		const roles = keywordHits(line, flight, lodging);

		for (const date of findDates(line, order)) {
			const role = nearestRole(roles, date.index);
			let key: 'startDate' | 'endDate' | null = null;
			if (role === 'start') key = 'startDate';
			else if (role === 'end') key = 'endDate';
			else if (role === 'generic') {
				if (found.startDate === undefined) key = 'startDate';
				else if (found.endDate === undefined) key = 'endDate';
			}
			if (!key || found[key] !== undefined) continue;
			put(found, key, date.value, labelConfidence(line, roles, date.index));
			used = true;
		}

		for (const time of findTimes(line)) {
			const role = nearestRole(roles, time.index);
			let key: 'startTime' | 'endTime' | null = null;
			if (role === 'start') key = 'startTime';
			else if (role === 'end') key = 'endTime';
			else if (role === 'generic') {
				if (found.startTime === undefined) key = 'startTime';
				else if (found.endTime === undefined) key = 'endTime';
			}
			if (!key || found[key] !== undefined) continue;
			put(found, key, time.value, labelConfidence(line, roles, time.index));
			used = true;
		}

		const code = labelledCode(line);
		if (code) {
			put(found, 'bookingRef', code, 'high');
			used = true;
		}

		const phone = labelledPhone(line);
		if (phone) {
			put(found, 'phone', phone, 'high');
			used = true;
		}

		const email = labelledEmail(line);
		if (email) {
			put(found, 'email', email, 'high');
			used = true;
		}

		const address = labelledAddress(line);
		if (address) {
			put(found, 'address', address, 'high');
			used = true;
		}

		const name = labelledName(line);
		if (name) {
			put(found, 'name', name.value, name.confidence);
			used = true;
		}

		const passenger = labelledPassenger(line);
		if (passenger) {
			put(found, 'passenger', passenger, 'high');
			used = true;
		}

		const size = labelledPartySize(line);
		if (size != null && found.partySize === undefined) {
			found.partySize = { value: size, confidence: 'high' };
			used = true;
		}

		const flightNumber = labelledFlightNumber(line);
		if (flightNumber) {
			put(found, 'flightNumber', flightNumber, 'high');
			used = true;
		}

		const from = labelledAirport(line, 'from');
		if (from) {
			put(found, 'departureAirport', from, 'high');
			used = true;
		}

		const to = labelledAirport(line, 'to');
		if (to) {
			put(found, 'arrivalAirport', to, 'high');
			used = true;
		}

		if (used) consumed.add(index);
	});

	// A route line such as "LIS → FCO" is unambiguous only in a flight document.
	if (flight && (found.departureAirport === undefined || found.arrivalAirport === undefined)) {
		lines.forEach((line, index) => {
			const route = routeAirports(line);
			if (!route) return;
			if (found.departureAirport === undefined) {
				put(found, 'departureAirport', route[0], 'medium');
			}
			if (found.arrivalAirport === undefined) {
				put(found, 'arrivalAirport', route[1], 'medium');
			}
			consumed.add(index);
		});
	}

	// Unlabelled flight numbers are accepted only when the document is a ticket.
	if (found.flightNumber === undefined && flight) {
		for (const [index, line] of lines.entries()) {
			const match = /\b([A-Z]{2})\s?(\d{2,4})\b/.exec(line);
			if (!match) continue;
			put(found, 'flightNumber', `${match[1]}${match[2]}`, 'medium');
			consumed.add(index);
			break;
		}
	}

	const result = { unparsed: [] as string[] } as ParsedConfirmation;
	for (const key of PARSED_FIELD_KEYS) {
		const value = found[key];
		if (value !== undefined) Object.assign(result, { [key]: value });
	}
	result.unparsed = lines.filter((_, index) => !consumed.has(index));
	return result;
}
