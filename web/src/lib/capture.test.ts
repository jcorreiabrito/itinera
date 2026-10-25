import { describe, expect, it } from 'vitest';
import {
	DEFAULT_CAPTURE_MODE,
	captureDefaults,
	expenseDefaults,
	needsFxRate,
	normaliseCurrency,
	noteDefaults,
	parseAmount,
	parseFxRate,
	photoDefaults,
	validateAmount,
	validateFxRate
} from './capture';

/**
 * Quick Capture is the sheet you use with one thumb, often for money typed in a
 * hurry. These pin the three decisions the DOM cannot: what a fresh form holds,
 * what counts as an amount, and when a foreign currency asks for a rate.
 */

const ctx = {
	homeCurrency: 'brl',
	defaultDate: '2026-10-20',
	today: '2026-10-25'
};

describe('capture defaults', () => {
	it('starts on the expense tab', () => {
		expect(DEFAULT_CAPTURE_MODE).toBe('expense');
	});

	it('starts an expense in the home currency, on the seeded day', () => {
		expect(expenseDefaults(ctx)).toEqual({
			amount: '',
			currency: 'BRL',
			category: 'food',
			paid: false,
			date: '2026-10-20',
			fxRate: '',
			costType: 'total'
		});
	});

	it('falls back to today when no day is seeded', () => {
		const noSeed = { homeCurrency: 'EUR', today: '2026-10-25' };
		expect(expenseDefaults(noSeed).date).toBe('2026-10-25');
		expect(expenseDefaults({ ...noSeed, defaultDate: '' }).date).toBe('2026-10-25');
		expect(noteDefaults(noSeed).date).toBe('2026-10-25');
	});

	it('starts a note empty and on the seeded day', () => {
		expect(noteDefaults(ctx)).toEqual({ title: '', body: '', date: '2026-10-20' });
	});

	it('starts photo mode with no file and no preview', () => {
		expect(photoDefaults()).toEqual({ file: null, previewUrl: null });
	});

	it('returns every mode at once so one reset clears the sheet', () => {
		expect(captureDefaults(ctx)).toEqual({
			expense: expenseDefaults(ctx),
			note: noteDefaults(ctx),
			photo: photoDefaults()
		});
	});

	it('normalises a currency code and falls back to EUR', () => {
		expect(normaliseCurrency(' usd ')).toBe('USD');
		expect(normaliseCurrency('')).toBe('EUR');
		expect(normaliseCurrency(null)).toBe('EUR');
	});
});

describe('amount validation', () => {
	it('rejects a blank amount as required', () => {
		expect(validateAmount('')).toBe('required');
		expect(validateAmount('   ')).toBe('required');
	});

	it('accepts plain and comma-decimal amounts', () => {
		expect(validateAmount('12')).toBeNull();
		expect(validateAmount('12.50')).toBeNull();
		expect(validateAmount('12,50')).toBeNull();
		expect(validateAmount(',50')).toBeNull();
		expect(validateAmount('0')).toBeNull();
		expect(validateAmount(' 12,5 ')).toBeNull();
	});

	it('rejects anything that is not a decimal number', () => {
		expect(validateAmount('twelve')).toBe('invalid');
		expect(validateAmount('-5')).toBe('invalid');
		expect(validateAmount('1e3')).toBe('invalid');
		expect(validateAmount('0x10')).toBe('invalid');
		expect(validateAmount('12,')).toBe('invalid');
		expect(validateAmount('1.234,56')).toBe('invalid');
	});

	it('parses a comma decimal exactly like a dot', () => {
		expect(parseAmount('12,50')).toBe(12.5);
		expect(parseAmount('12.50')).toBe(12.5);
		expect(parseAmount('')).toBeNull();
		expect(parseAmount('nope')).toBeNull();
	});
});

describe('fx rate', () => {
	it('is only needed when the currency differs from home', () => {
		expect(needsFxRate('EUR', 'EUR')).toBe(false);
		expect(needsFxRate('eur', ' EUR ')).toBe(false);
		expect(needsFxRate('USD', 'EUR')).toBe(true);
		expect(needsFxRate('', 'EUR')).toBe(false);
		expect(needsFxRate('USD', '')).toBe(false);
	});

	it('accepts a blank rate because the field is optional', () => {
		expect(validateFxRate('')).toBeNull();
		expect(validateFxRate('   ')).toBeNull();
	});

	it('accepts a positive rate, comma or dot', () => {
		expect(validateFxRate('0.92')).toBeNull();
		expect(validateFxRate('6,14')).toBeNull();
		expect(parseFxRate('0,5')).toBe(0.5);
	});

	it('rejects zero, negatives and non-numbers', () => {
		expect(validateFxRate('0')).toBe('invalid');
		expect(validateFxRate('-1')).toBe('invalid');
		expect(validateFxRate('abc')).toBe('invalid');
		expect(parseFxRate('0')).toBeNull();
	});

	it('parses a typed rate or null', () => {
		expect(parseFxRate('1.25')).toBe(1.25);
		expect(parseFxRate('')).toBeNull();
	});
});
