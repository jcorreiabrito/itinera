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
	variant?: ToastVariant;
	duration?: number;
	action?: ToastAction;
}

/** Variant helpers accept a bare duration (back-compat) or full options. */
type VariantOptions = number | Omit<ToastOptions, 'variant'>;

const store = writable<Toast[]>([]);

let counter = 0;

function normalize(opts?: VariantOptions): Omit<ToastOptions, 'variant'> {
	return typeof opts === 'number' ? { duration: opts } : (opts ?? {});
}

/**
 * The countdown for one toast.
 *
 * Kept as a record rather than a bare timer handle so it can be stopped and
 * restarted: an actionable toast is a window in which the user can still undo
 * something, and a window that closes while they are reaching for it — or while
 * a screen reader is still reading the message — is the same as having no undo
 * at all. `remaining` is what is left to run; `startedAt` is when the current
 * run began, or `null` while it is paused.
 */
interface Countdown {
	/** Absent only in the instant between `pauseToast` and `resumeToast`. */
	timer?: ReturnType<typeof setTimeout>;
	remaining: number;
	startedAt: number | null;
}

const countdowns = new Map<string, Countdown>();

function runCountdown(id: string): void {
	const entry = countdowns.get(id);
	if (!entry) return;
	entry.startedAt = Date.now();
	entry.timer = setTimeout(() => dismiss(id), entry.remaining);
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
	if (item.duration > 0) {
		countdowns.set(id, { remaining: item.duration, startedAt: null });
		runCountdown(id);
	}
	return id;
}

function dismiss(id: string): void {
	const entry = countdowns.get(id);
	if (entry) {
		if (entry.timer !== undefined) clearTimeout(entry.timer);
		countdowns.delete(id);
	}
	store.update((all) => all.filter((t) => t.id !== id));
}

/**
 * Hold a toast open — the pointer is over it, or the keyboard has moved into it.
 *
 * Safe to call for a toast with no countdown (one that lives until dismissed),
 * and safe to call twice; the second call is ignored so a `mouseenter` followed
 * by a `focusin` cannot restart the clock.
 */
export function pauseToast(id: string): void {
	const entry = countdowns.get(id);
	if (!entry || entry.startedAt === null) return;
	clearTimeout(entry.timer);
	entry.remaining = Math.max(0, entry.remaining - (Date.now() - entry.startedAt));
	entry.startedAt = null;
}

/** Let a paused toast finish its remaining time. Ignored when it is not paused. */
export function resumeToast(id: string): void {
	const entry = countdowns.get(id);
	if (!entry || entry.startedAt !== null) return;
	runCountdown(id);
}

function clear(): void {
	for (const entry of countdowns.values()) {
		if (entry.timer !== undefined) clearTimeout(entry.timer);
	}
	countdowns.clear();
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
