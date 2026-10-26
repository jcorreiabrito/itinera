import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import type { ChecklistItem } from '$lib/db';
import ChecklistItemRow from './ChecklistItemRow.svelte';

function makeItem(overrides: Partial<ChecklistItem> = {}): ChecklistItem {
	return {
		_id: 'chk-1',
		tripid: 'trip-1',
		group: 'Documents',
		text: 'Passport',
		done: false,
		order: 0,
		...overrides
	} as ChecklistItem;
}

function pointer(type: string, x: number, y: number): MouseEvent {
	/*
	 * jsdom has no PointerEvent, and the row only reads coordinates and the
	 * pointer id from the event. A bubbling MouseEvent carries the coordinates,
	 * and an undefined pointerId matches on both ends of the gesture.
	 */
	return new MouseEvent(type, { bubbles: true, cancelable: true, clientX: x, clientY: y });
}

function setup(item: ChecklistItem) {
	const onswipe = vi.fn();
	const onedit = vi.fn();
	const { getByRole, container } = render(ChecklistItemRow, {
		item,
		tripId: 'trip-1',
		ontoggle: vi.fn(),
		onedit,
		ondelete: vi.fn(),
		onswipe
	});
	const title = getByRole('button', { name: /Passport/ });
	return { onswipe, onedit, title, container };
}

function swipe(target: HTMLElement, fromX: number, toX: number) {
	target.dispatchEvent(pointer('pointerdown', fromX, 100));
	window.dispatchEvent(pointer('pointermove', toX, 102));
	window.dispatchEvent(pointer('pointerup', toX, 102));
}

describe('checklist row swipe', () => {
	it('shows both reveal labels only when swipe is enabled', () => {
		const { container } = setup(makeItem());
		expect(container.textContent).toContain('done');
		expect(container.textContent).toContain('not done');

		const { container: withoutSwipe } = render(ChecklistItemRow, {
			item: makeItem(),
			tripId: 'trip-1',
			ontoggle: vi.fn(),
			onedit: vi.fn(),
			ondelete: vi.fn()
		});
		expect(withoutSwipe.textContent).not.toContain('not done');
	});

	it('reports a right swipe on an open item as done', () => {
		const { onswipe, title } = setup(makeItem());
		swipe(title, 20, 120);
		expect(onswipe).toHaveBeenCalledWith(expect.objectContaining({ _id: 'chk-1' }), 'right');
	});

	it('reports a left swipe on a done item as reopened', () => {
		const { onswipe, title } = setup(makeItem({ done: true }));
		swipe(title, 120, 20);
		expect(onswipe).toHaveBeenCalledWith(expect.objectContaining({ _id: 'chk-1' }), 'left');
	});

	it('does nothing when the swipe points at the state the item is already in', () => {
		const { onswipe, title } = setup(makeItem({ done: true }));
		swipe(title, 20, 120);
		expect(onswipe).not.toHaveBeenCalled();
	});

	it('swallows the click a completed swipe would deliver, then lets the next one through', () => {
		const { onedit, title } = setup(makeItem());
		swipe(title, 20, 120);

		title.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		expect(onedit).not.toHaveBeenCalled();

		title.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }));
		expect(onedit).toHaveBeenCalledTimes(1);
	});

	it('ignores a vertical gesture', () => {
		const { onswipe, title } = setup(makeItem());
		title.dispatchEvent(pointer('pointerdown', 20, 20));
		window.dispatchEvent(pointer('pointermove', 30, 120));
		window.dispatchEvent(pointer('pointerup', 30, 120));
		expect(onswipe).not.toHaveBeenCalled();
	});
});
