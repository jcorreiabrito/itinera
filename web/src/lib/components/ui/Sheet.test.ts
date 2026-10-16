import { describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/svelte';
import { createRawSnippet } from 'svelte';
import Sheet from './Sheet.svelte';

/**
 * The dirty guard, which exists to stop a half-filled form from being thrown
 * away by a gesture. Every exit from the sheet — the close button, the backdrop,
 * Escape and the swipe-down handle — goes through one `requestClose()`, so
 * testing the button covers the routing and these tests cover the decision.
 */

const text = (value: string) =>
	createRawSnippet(() => ({ render: () => `<span>${value}</span>` }));

function open(props: Record<string, unknown> = {}) {
	return render(Sheet, {
		props: {
			open: true,
			title: 'Edit item',
			children: text('form body'),
			...props
		}
	});
}

const closeButton = (container: HTMLElement) =>
	container.querySelector<HTMLButtonElement>('button[aria-label="Close"]')!;

// `Array.from`, not a spread: `NodeList` is only iterable under `dom.iterable`,
// which this project's `lib` does not include.
const buttonByText = (container: HTMLElement, label: string) =>
	Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === label);

describe('Sheet close confirmation', () => {
	it('closes straight away when nothing is dirty', async () => {
		const onclose = vi.fn();
		const { container } = open({ onclose });

		closeButton(container).click();
		await Promise.resolve();

		expect(onclose).toHaveBeenCalledOnce();
		expect(container.querySelector('[role="alertdialog"]')).toBeNull();
	});

	it('asks before closing a dirty sheet', async () => {
		const onclose = vi.fn();
		const { container } = open({ dirty: true, onclose });

		closeButton(container).click();
		await Promise.resolve();

		expect(onclose).not.toHaveBeenCalled();
		expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();
		expect(container.textContent).toContain('Discard unsaved changes?');
	});

	it('keeps the edits when the user chooses to keep editing', async () => {
		const onclose = vi.fn();
		const { container } = open({ dirty: true, onclose });

		closeButton(container).click();
		await Promise.resolve();
		buttonByText(container, 'Keep editing')!.click();
		await Promise.resolve();

		expect(onclose).not.toHaveBeenCalled();
		expect(container.querySelector('[role="alertdialog"]')).toBeNull();
	});

	it('closes when the user confirms the discard', async () => {
		const onclose = vi.fn();
		const { container } = open({ dirty: true, onclose });

		closeButton(container).click();
		await Promise.resolve();
		buttonByText(container, 'Discard')!.click();
		await Promise.resolve();

		expect(onclose).toHaveBeenCalledOnce();
	});

	it('treats a second dismissal gesture on the prompt as "keep editing"', async () => {
		// Escape lands on the dialog's `cancel`, which routes through the same
		// single exit as the button; on the prompt it must back out of the
		// prompt, not out of the sheet.
		const onclose = vi.fn();
		const { container } = open({ dirty: true, onclose });

		closeButton(container).click();
		await Promise.resolve();
		expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();

		closeButton(container).click();
		await Promise.resolve();

		expect(onclose).not.toHaveBeenCalled();
		expect(container.querySelector('[role="alertdialog"]')).toBeNull();
	});

	it('drops the prompt once the sheet stops being dirty', async () => {
		const onclose = vi.fn();
		const { container, rerender } = open({ dirty: true, onclose });

		closeButton(container).click();
		await Promise.resolve();
		expect(container.querySelector('[role="alertdialog"]')).not.toBeNull();

		// A save elsewhere cleared the form's dirty flag.
		await rerender({ open: true, dirty: false, onclose });
		await Promise.resolve();

		expect(container.querySelector('[role="alertdialog"]')).toBeNull();
	});

	it('takes the labels from the caller', async () => {
		const { container } = open({
			dirty: true,
			discardTitle: 'Descartar alterações?',
			discardLabel: 'Descartar',
			keepEditingLabel: 'Continuar editando'
		});

		closeButton(container).click();
		await Promise.resolve();

		expect(container.textContent).toContain('Descartar alterações?');
		expect(buttonByText(container, 'Descartar')).toBeDefined();
		expect(buttonByText(container, 'Continuar editando')).toBeDefined();
	});

	it('marks the form inert while the prompt is up', async () => {
		// Read through the property, not the attribute: jsdom (25) does not
		// implement `inert`, so Svelte sets the property directly and nothing
		// reflects it back to markup. Browsers do, which is what matters.
		const { container } = open({ dirty: true });
		const content = container.querySelector<HTMLElement>('div.overflow-y-auto') as HTMLElement & {
			inert?: boolean;
		};

		expect(content.inert ?? false).toBe(false);

		closeButton(container).click();
		await Promise.resolve();

		expect(content.inert).toBe(true);
	});
});
