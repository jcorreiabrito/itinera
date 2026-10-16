/**
 * The app's global keyboard shortcuts.
 *
 * Kept pure and separate from the routes so the rules that matter — never eat a
 * keystroke the user is typing, never fire under a modifier, never fire while a
 * sheet has the screen — are testable without a browser.
 *
 * The set is deliberately small. A shortcut nobody can discover is worse than no
 * shortcut, so these are the three a planning session actually repeats: move to
 * the next day, move to the previous one, add an item.
 */

export type Shortcut = 'prev-day' | 'next-day' | 'new-item';

/**
 * True when the keystroke belongs to whatever the user is typing into.
 *
 * Without this, `n` while naming a restaurant opens the new-item sheet on top of
 * the field being typed into. `isContentEditable` matters as much as the tag
 * names: the notes editor is a `div`.
 */
export function isTypingTarget(target: EventTarget | null): boolean {
	if (!(target instanceof HTMLElement)) return false;
	if (target.isContentEditable) return true;
	const tag = target.tagName;
	return tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT';
}

/**
 * The shortcut a keystroke means, or `null` to leave the event alone.
 *
 * Modifiers disqualify a key rather than combining with it: `Ctrl+N` is the
 * browser's new-window, and `⌘[` is Back. `event.key` is used rather than
 * `event.code` so the binding follows the user's layout — on a French keyboard
 * `[` is where the user's `[` is printed, not where a US keyboard keeps it.
 */
export function matchShortcut(event: KeyboardEvent): Shortcut | null {
	if (event.altKey || event.ctrlKey || event.metaKey) return null;
	if (isTypingTarget(event.target)) return null;
	/*
	 * `event.key`, not `event.code`: the binding follows the character the key
	 * actually produces on the user's layout. `code` would move days on a German
	 * keyboard's `Ü`, which is where a US keyboard keeps `[`.
	 */
	if (event.key === '[') return 'prev-day';
	if (event.key === ']') return 'next-day';
	if (event.key === 'n' || event.key === 'N') return 'new-item';
	return null;
}
