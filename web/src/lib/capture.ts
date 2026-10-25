/**
 * Quick Capture – the pure half of the one-thumb expense / note / photo sheet.
 *
 * Defaults and validation live here rather than in the component so they can be
 * pinned by tests without a DOM: a blank amount is not zero, a comma is a
 * decimal separator (`12,50` is twelve and a half), and the FX field is asked
 * for exactly when the expense is in a currency other than the trip's home one.
 */

import type { ExpenseCategory } from './db/schemas';

export type CaptureMode = 'expense' | 'note' | 'photo';

/** The sheet opens on the capture people reach for most. */
export const DEFAULT_CAPTURE_MODE: CaptureMode = 'expense';

export interface CaptureDefaultsContext {
	/** Trip home currency; a new expense starts in it. */
	homeCurrency: string;
	/** Trip day to start on. Falls back to `today` when absent. */
	defaultDate?: string | null;
	/** Today as an ISO date. Passed in rather than read so tests never race the clock. */
	today: string;
}

export interface ExpenseCaptureForm {
	amount: string;
	currency: string;
	category: ExpenseCategory;
	paid: boolean;
	/** ISO day; an empty string saves the expense against the whole trip. */
	date: string;
	fxRate: string;
	costType: 'total' | 'per_person';
}

export interface NoteCaptureForm {
	title: string;
	body: string;
	/** ISO day, or an empty string for the Unscheduled bucket. */
	date: string;
}

/**
 * A photo has nothing to prefill: the camera or picker supplies the file. The
 * file is held until the write resolves so a failed save can be retried without
 * asking the user to take the picture again.
 */
export interface PhotoCaptureState {
	file: File | null;
	/** Object URL for the preview, or `null` when no file is held. */
	previewUrl: string | null;
}

export interface CaptureDefaults {
	expense: ExpenseCaptureForm;
	note: NoteCaptureForm;
	photo: PhotoCaptureState;
}

/** Uppercase a currency code, falling back to the app's default (`EUR`). */
export function normaliseCurrency(code: string | null | undefined): string {
	return (code ?? '').trim().toUpperCase() || 'EUR';
}

function seedDate(ctx: CaptureDefaultsContext): string {
	return ctx.defaultDate?.trim() || ctx.today;
}

export function expenseDefaults(ctx: CaptureDefaultsContext): ExpenseCaptureForm {
	return {
		amount: '',
		currency: normaliseCurrency(ctx.homeCurrency),
		category: 'food',
		paid: false,
		date: seedDate(ctx),
		fxRate: '',
		costType: 'total'
	};
}

export function noteDefaults(ctx: CaptureDefaultsContext): NoteCaptureForm {
	return {
		title: '',
		body: '',
		date: seedDate(ctx)
	};
}

export function photoDefaults(): PhotoCaptureState {
	return { file: null, previewUrl: null };
}

/** Every mode's starting state, in one call so the sheet resets atomically. */
export function captureDefaults(ctx: CaptureDefaultsContext): CaptureDefaults {
	return {
		expense: expenseDefaults(ctx),
		note: noteDefaults(ctx),
		photo: photoDefaults()
	};
}

// --- Amounts ---------------------------------------------------------------

/**
 * Digits with an optional decimal part, using either separator.
 *
 * Deliberately narrower than `Number()`: `Number('0x10')`, `Number('1e3')` and
 * `Number('12 ')` all succeed, and none of them is something a person typed as
 * a price. At most one separator is allowed, so `1.234,56` is rejected rather
 * than silently read as a different number.
 */
const AMOUNT_PATTERN = /^\d*(?:[.,]\d+)?$/;

/** A typed amount as a number, or `null` when it is blank or not money. */
export function parseAmount(raw: string): number | null {
	const value = raw.trim();
	if (!value || !AMOUNT_PATTERN.test(value)) return null;
	const parsed = Number(value.replace(',', '.'));
	return Number.isFinite(parsed) ? parsed : null;
}

export type AmountError = 'required' | 'invalid';

export function validateAmount(raw: string): AmountError | null {
	if (!raw.trim()) return 'required';
	return parseAmount(raw) == null ? 'invalid' : null;
}

/** An optional FX rate: blank is allowed, anything typed must be positive. */
export function parseFxRate(raw: string): number | null {
	const parsed = parseAmount(raw);
	return parsed != null && parsed > 0 ? parsed : null;
}

export type FxRateError = 'invalid';

export function validateFxRate(raw: string): FxRateError | null {
	if (!raw.trim()) return null;
	return parseFxRate(raw) == null ? 'invalid' : null;
}

/** Whether the expense's currency needs an FX rate back to the trip's home one. */
export function needsFxRate(currency: string, homeCurrency: string): boolean {
	const cur = currency.trim().toUpperCase();
	const home = homeCurrency.trim().toUpperCase();
	return cur !== '' && home !== '' && cur !== home;
}
