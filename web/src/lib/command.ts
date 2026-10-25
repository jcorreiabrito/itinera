/**
 * The command palette's model, matcher and ranking.
 *
 * Kept pure and apart from the palette component: what a query matches, and the
 * order the groups appear in, decide what a keystroke does. Both are worth
 * pinning down without a browser or a database.
 */

export type CommandGroup = 'trips' | 'trip' | 'actions';

/** The order groups appear in every result list, whatever the query. */
export const COMMAND_GROUP_ORDER: readonly CommandGroup[] = ['trips', 'trip', 'actions'];

/** Work the palette performs itself instead of navigating to a route. */
export type CommandAction = 'toggle-theme' | 'toggle-language';

/**
 * One row in the palette.
 *
 * `href` is already resolved (the palette calls `resolve()` when it builds the
 * list) and `action` names work done in place. A command carries at most one of
 * them; one with neither is a label the palette never runs.
 */
export interface Command {
	id: string;
	group: CommandGroup;
	label: string;
	/** Secondary text, such as a trip's dates. */
	hint?: string;
	/** Extra search terms that are not displayed (tags, destinations, route ids). */
	keywords?: readonly string[];
	href?: string;
	action?: CommandAction;
}

/** A group of commands, ready to render. */
export interface CommandGroupSection {
	group: CommandGroup;
	commands: Command[];
}

// U+0300–U+036F, the combining diacritics NFD leaves behind.
const COMBINING_MARKS = /[̀-ͯ]/g;

/**
 * Fold case and accents so `sao` finds `São` and `são` finds `Sao`.
 *
 * NFD splits `ã` into `a` plus a combining tilde; dropping the marks makes both
 * sides of the comparison plain ASCII. Without this, searching in Portuguese on
 * a keyboard without the accent keys finds nothing.
 */
export function normalize(value: string): string {
	return value.normalize('NFD').replace(COMBINING_MARKS, '').toLowerCase();
}

const PREFIX_SCORE = 1000;
const WORD_START_SCORE = 700;
const SUBSTRING_SCORE = 500;
const SUBSEQUENCE_SCORE = 400;

/**
 * A shorter or later match earns less, but never enough to jump a tier: the
 * length/index bonus tops out at 99 and the tiers are 200+ apart.
 */
function matchBonus(length: number, index = 0): number {
	return Math.max(0, 100 - length - index);
}

/**
 * `brc` → `Barcelona`: every query character appears in order, but not
 * contiguously. Scored below any contiguous match, and lower still when the
 * matched characters are spread far apart.
 */
function subsequenceScore(haystack: string, needle: string): number | null {
	const compact = needle.replace(/\s+/g, '');
	if (!compact) return null;
	let cursor = 0;
	let first = -1;
	let last = -1;
	for (const char of compact) {
		const found = haystack.indexOf(char, cursor);
		if (found === -1) return null;
		if (first === -1) first = found;
		last = found;
		cursor = found + 1;
	}
	const span = last - first + 1;
	return Math.max(1, SUBSEQUENCE_SCORE - (span - compact.length) * 8 - first * 2);
}

/**
 * Rank `text` against `query`, or `null` when it does not match.
 *
 * A prefix match outranks a match at the start of a later word, which outranks
 * one buried inside a word; a subsequence is the last resort. The gaps between
 * tiers are what keep "Trip to Porto" above "Weekend trip" for the query
 * "trip" regardless of how much shorter the second title is.
 */
export function fuzzyScore(text: string, query: string): number | null {
	const needle = normalize(query).replace(/\s+/g, ' ').trim();
	if (!needle) return 0;
	const haystack = normalize(text);
	const index = haystack.indexOf(needle);
	if (index === 0) return PREFIX_SCORE + matchBonus(haystack.length);
	if (index > 0) {
		const startsWord = !/[a-z0-9]/.test(haystack[index - 1]);
		return (startsWord ? WORD_START_SCORE : SUBSTRING_SCORE) + matchBonus(haystack.length, index);
	}
	return subsequenceScore(haystack, needle);
}

/** The best score across a command's label and its hidden keywords. */
export function scoreCommand(command: Command, query: string): number | null {
	let best = fuzzyScore(command.label, query);
	for (const keyword of command.keywords ?? []) {
		const score = fuzzyScore(keyword, query);
		if (score === null) continue;
		/*
		 * A keyword match is a hint, not the label on screen, so it sits one
		 * point below the same match on the label. Typing a route id still finds
		 * the command, but a visible label match wins a near tie.
		 */
		const adjusted = Math.max(1, score - 1);
		if (best === null || adjusted > best) best = adjusted;
	}
	return best;
}

/**
 * Rank every matching command, highest score first.
 *
 * Ties keep their declaration order: the palette declares trips by start date
 * and actions in a deliberate order, and re-sorting equal scores would undo it.
 * An empty query keeps the given order untouched.
 */
export function matchCommands(commands: readonly Command[], query: string): Command[] {
	const needle = normalize(query).trim();
	if (!needle) return [...commands];

	const ranked: { command: Command; order: number; score: number }[] = [];
	commands.forEach((command, order) => {
		const score = scoreCommand(command, needle);
		if (score !== null) ranked.push({ command, order, score });
	});
	ranked.sort((a, b) => b.score - a.score || a.order - b.order);
	return ranked.map((entry) => entry.command);
}

/** Bucket commands into the fixed group order, preserving rank inside a group. */
export function groupCommands(commands: readonly Command[]): CommandGroupSection[] {
	return COMMAND_GROUP_ORDER.map((group) => ({
		group,
		commands: commands.filter((command) => command.group === group)
	})).filter((section) => section.commands.length > 0);
}

/**
 * Move recently run commands to the front, in recency order.
 *
 * Used only while the query is empty: recents are the way back to somewhere
 * you have already been, not a substitute for searching the whole list.
 */
export function orderByRecents(
	commands: readonly Command[],
	recentIds: readonly string[]
): Command[] {
	const rank = new Map(recentIds.map((id, index) => [id, index]));
	return commands
		.map((command, index) => ({ command, index }))
		.sort((a, b) => {
			const aRank = rank.get(a.command.id);
			const bRank = rank.get(b.command.id);
			if (aRank !== undefined && bRank !== undefined) return aRank - bRank;
			if (aRank !== undefined) return -1;
			if (bRank !== undefined) return 1;
			return a.index - b.index;
		})
		.map((entry) => entry.command);
}

/** The stable id a trip command is remembered under. */
export function tripCommandId(tripId: string): string {
	return `trip:${tripId}`;
}

/** A trip the palette can jump to. */
export interface TripCommandSource {
	/** Bare trip id, without the `trip:` prefix. */
	id: string;
	title: string;
	/** Secondary text, such as the date range. */
	hint?: string;
	keywords?: readonly string[];
}

/** One command per trip, in the order given. */
export function tripCommands(
	trips: readonly TripCommandSource[],
	href: (tripId: string) => string
): Command[] {
	return trips.map((trip) => ({
		id: tripCommandId(trip.id),
		group: 'trips',
		label: trip.title,
		hint: trip.hint,
		keywords: trip.keywords,
		href: href(trip.id)
	}));
}

/** A section of the trip currently open in the shell. */
export interface TripSectionCommandSource {
	id: string;
	label: string;
	href: string;
	keywords?: readonly string[];
}

/** One command per section, prefixed with the trip so recents stay per trip. */
export function tripSectionCommands(
	tripId: string,
	sections: readonly TripSectionCommandSource[]
): Command[] {
	return sections.map((section) => ({
		id: `section:${tripId}:${section.id}`,
		group: 'trip',
		label: section.label,
		keywords: section.keywords,
		href: section.href
	}));
}
