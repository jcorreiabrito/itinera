import { describe, expect, it } from 'vitest';
import { isTypingTarget, matchShortcut, type Shortcut } from './shortcuts';

/**
 * The rules that keep global shortcuts from becoming global annoyances.
 *
 * A shortcut that fires while the user is typing is the bug people remember:
 * they press `n` in the middle of a restaurant name and a sheet takes over the
 * screen. These tests pin the guards, not the key choices.
 */

const press = (
	key: string,
	options: { target?: EventTarget | null; alt?: boolean; ctrl?: boolean; meta?: boolean } = {}
): Shortcut | null => {
	const event = new KeyboardEvent('keydown', {
		key,
		altKey: options.alt ?? false,
		ctrlKey: options.ctrl ?? false,
		metaKey: options.meta ?? false
	});
	// `new KeyboardEvent` ignores a `target` in its init dict, so it is set here.
	if (options.target) Object.defineProperty(event, 'target', { value: options.target });
	return matchShortcut(event);
};

const el = (tag: string, props: Record<string, unknown> = {}) =>
	Object.assign(document.createElement(tag), props);

describe('isTypingTarget', () => {
	it('recognises the fields a user types into', () => {
		expect(isTypingTarget(el('input'))).toBe(true);
		expect(isTypingTarget(el('textarea'))).toBe(true);
		expect(isTypingTarget(el('select'))).toBe(true);
	});

	it('recognises a contenteditable, which is a div and not a field', () => {
		// The notes editor is a `div contenteditable`, so the tag list alone
		// would let `n` open a sheet over the paragraph being written.
		const div = el('div');
		Object.defineProperty(div, 'isContentEditable', { value: true });
		expect(isTypingTarget(div)).toBe(true);
	});

	it('leaves buttons and the document alone', () => {
		expect(isTypingTarget(el('button'))).toBe(false);
		expect(isTypingTarget(el('div'))).toBe(false);
		expect(isTypingTarget(document)).toBe(false);
		expect(isTypingTarget(null)).toBe(false);
	});
});

describe('matchShortcut', () => {
	it('maps the day pair and the new-item key', () => {
		expect(press('[')).toBe('prev-day');
		expect(press(']')).toBe('next-day');
		expect(press('n')).toBe('new-item');
		expect(press('N')).toBe('new-item');
	});

	it('ignores every other key', () => {
		for (const key of ['a', 'Enter', 'Escape', 'ArrowDown', '1', '{']) {
			expect(press(key), key).toBeNull();
		}
	});

	it('leaves modified keys to the browser', () => {
		// Ctrl+N is a new window and Cmd+[ is Back. Both are the browser's.
		expect(press('n', { ctrl: true })).toBeNull();
		expect(press('[', { meta: true })).toBeNull();
		expect(press('n', { alt: true })).toBeNull();
	});

	it('stays out of the way while the user is typing', () => {
		expect(press('n', { target: el('input') })).toBeNull();
		expect(press('[', { target: el('textarea') })).toBeNull();
		expect(press(']', { target: el('select') })).toBeNull();
	});

	it('still fires from a button or the page body', () => {
		expect(press('n', { target: el('button') })).toBe('new-item');
		expect(press('[', { target: document.body })).toBe('prev-day');
	});
});
