import { writable } from 'svelte/store';

export type ToastVariant = 'default' | 'success' | 'warning' | 'danger' | 'info';

/** An optional inline button on a toast (e.g. "Retry" or "Undo"). */
export interface ToastAction {
	label: string;
	onClick: () => void;
}

export interface Toast {
	id: string;
	message: string;
	variant: ToastVariant;
	duration: number;
	action?: ToastAction;
}

/** Options for {@link toast.show}. */
export interface ToastOptions {
	variant: ToastVariant;
	duration: number;
	action?: ToastAction;
}

/** Variant helpers accept a bare duration (back-compat) or full options. */
type VariantOptions = number | Omit<ToastOptions, 'variant'>;

const store = writable<Toast[]>([]);

let counter = 0;

function normalize(opts?: VariantOptions): Omit<ToastOptions, 'variant'> {
	return typeof opts === 'number' ? { duration: opts } : (opts ?? {});
}

function show(message: string, options: ToastOptions = {}): string {
	const id = `toast-${++counter}`;
	// Actionable toasts linger so the user can reach the button.
	const fallback = options.action ? 8000 : 4000;
	const item: Toast = {
		id,
		message,
		variant: options.variant ?? 'default',
		duration: options.duration ?? fallback,
		action: options.action
	};
	store.update((all) => [...all, item]);
	if (item.duration > 0 && typeof window !== 'undefined') {
		window.setTimeout(() => dismiss(id), item.duration);
	}
	return id;
}

function dismiss(id: string): void {
	store.update((all) => all.filter((t) => t.id !== id));
}

function clear(): void {
	store.set([]);
}

/** Read-only store of active toasts (subscribe with `$toasts`). */
export const toasts = { subscribe: store.subscribe };

/** Imperative API for showing toasts. */
export const toast = {
	show,
	success: (message: string, opts?: VariantOptions) =>
		show(message, { variant: 'success', ...normalize(opts) }),
	warning: (message: string, opts?: VariantOptions) =>
		show(message, { variant: 'warning', ...normalize(opts) }),
	error: (message: string, opts?: VariantOptions) =>
		show(message, { variant: 'danger', ...normalize(opts) }),
	info: (message: string, opts?: VariantOptions) =>
		show(message, { variant: 'info', ...normalize(opts) }),
	dismiss,
	clear
};
