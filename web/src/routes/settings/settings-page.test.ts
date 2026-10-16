/**
 * The settings page stores each field the moment it changes.
 *
 * It used to mix two models: the language select saved itself, while the
 * currency, week-start and CARTO-key fields waited for a Save button. Backing
 * out with the arrow therefore discarded whichever edits the button did not
 * cover, with no warning. These tests pin the replacement behaviour, because
 * "there is no Save button any more" is exactly the kind of invariant that
 * comes back the next time someone adds a field.
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, waitFor } from '@testing-library/svelte';

const settingsMock = vi.hoisted(() => ({
	update: vi.fn(async () => ({ _id: 'settings:app' })),
	get: vi.fn(async () => ({
		_id: 'settings:app',
		homeCurrencyDefault: 'EUR',
		firstDayOfWeek: 1,
		language: 'en',
		cartoApiKey: ''
	}))
}));

const statusMock = vi.hoisted(() => {
	const snapshot = {
		state: 'synced',
		lastSyncedAt: null,
		pendingChanges: false,
		pendingCount: 0,
		error: null
	};
	return {
		subscribe: (run: (value: typeof snapshot) => void) => {
			run(snapshot);
			return () => {};
		}
	};
});

// Only the pieces the page and its children reach for; nothing here touches a
// real database.
vi.mock('$lib/db', () => ({
	settings: { get: settingsMock.get, update: settingsMock.update },
	checklist: {
		templates: {
			list: async () => [],
			setDefault: async () => {},
			update: async () => {},
			remove: async () => {}
		}
	},
	storageEstimate: async () => ({ usage: 1024, quota: 4096 }),
	requestPersistentStorage: async () => true,
	syncStatus: statusMock,
	syncNow: async () => {},
	listConflicts: async () => []
}));

vi.mock('$lib/api', () => ({
	listBackups: async () => ({ dir: '/srv/backups', backups: [] }),
	runBackup: async () => ({}),
	downloadAllExport: async () => {}
}));

// The header links back with `resolve()`, which expects the router's context.
vi.mock('$app/paths', () => ({
	resolve: (path: string) => path,
	asset: (path: string) => path
}));

import SettingsPage from './+page.svelte';
import { toast, toasts, type Toast } from '$lib/components/ui';

// Each test asserts on the writes and toasts *it* caused, so both start clean.
beforeEach(() => {
	settingsMock.update.mockClear();
	toast.clear();
});

/** Messages of the active toasts of one variant. */
function toastMessages(variant: Toast['variant']): string[] {
	let active: Toast[] = [];
	const unsubscribe = toasts.subscribe((value) => (active = value));
	unsubscribe();
	return active.filter((entry) => entry.variant === variant).map((entry) => entry.message);
}

/** Rendered and settled: the page loads its settings document in `onMount`. */
async function open() {
	const rendered = render(SettingsPage);
	await waitFor(() => expect(settingsMock.get).toHaveBeenCalled());
	return rendered;
}

function control<T extends HTMLElement>(container: HTMLElement, id: string): T {
	return container.querySelector<T>(`#${id}`)!;
}

describe('settings page saving', () => {
	it('offers no Save button', async () => {
		const { container } = await open();
		const labels = Array.from(container.querySelectorAll('main button')).map((b) =>
			b.textContent?.trim()
		);
		expect(labels).not.toContain('Save');
	});

	it('writes the home currency as soon as one is picked', async () => {
		const { container } = await open();
		await fireEvent.change(control<HTMLSelectElement>(container, 'settings-currency'), {
			target: { value: 'USD' }
		});
		await waitFor(() =>
			expect(settingsMock.update).toHaveBeenCalledWith({ homeCurrencyDefault: 'USD' })
		);
	});

	it('writes the first day of the week as soon as one is picked', async () => {
		const { container } = await open();
		await fireEvent.change(control<HTMLSelectElement>(container, 'settings-week-start'), {
			target: { value: '0' }
		});
		await waitFor(() => expect(settingsMock.update).toHaveBeenCalledWith({ firstDayOfWeek: 0 }));
	});

	it('writes the language as soon as one is picked', async () => {
		const { container } = await open();
		await fireEvent.change(control<HTMLSelectElement>(container, 'settings-language'), {
			target: { value: 'pt-BR' }
		});
		await waitFor(() => expect(settingsMock.update).toHaveBeenCalledWith({ language: 'pt-BR' }));
	});

	it('surfaces a failed write instead of swallowing it', async () => {
		settingsMock.update.mockRejectedValueOnce(new Error('storage is closed'));
		const { container } = await open();
		await fireEvent.change(control<HTMLSelectElement>(container, 'settings-currency'), {
			target: { value: 'USD' }
		});
		await waitFor(() => {
			const errors = toastMessages('danger');
			expect(errors.length).toBeGreaterThan(0);
		});
	});

	it('coalesces typing in the CARTO key field into a single write', async () => {
		const { container } = await open();
		const input = control<HTMLInputElement>(container, 'settings-carto-key');

		await fireEvent.input(input, { target: { value: 'k' } });
		await fireEvent.input(input, { target: { value: 'ke' } });
		await fireEvent.input(input, { target: { value: 'key' } });

		// Not per keystroke: the field debounces before it writes.
		expect(settingsMock.update).not.toHaveBeenCalled();

		await waitFor(
			() => {
				expect(settingsMock.update).toHaveBeenCalledWith({ cartoApiKey: 'key' });
			},
			{ timeout: 2000 }
		);
		expect(settingsMock.update).toHaveBeenCalledTimes(1);
	});
});
