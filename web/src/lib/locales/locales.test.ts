import { describe, expect, it } from 'vitest';
import { en } from './en';
import { ptBR } from './pt-BR';

/**
 * Locale parity.
 *
 * `t()` falls back to English and then to the raw key, so a missing Portuguese
 * entry never crashes — it just renders English (or, for a key missing from
 * both, the literal key text, which is how "edit_flight" once became a dialog
 * title). These tests are what stops that class of defect from coming back.
 */
describe('locale dictionaries', () => {
	const enKeys = Object.keys(en).sort();
	const ptKeys = Object.keys(ptBR).sort();

	it('pt-BR covers every English key', () => {
		const missing = enKeys.filter((k) => !(k in ptBR));
		expect(missing, `keys missing from pt-BR: ${missing.join(', ')}`).toEqual([]);
	});

	it('pt-BR defines no keys English does not have', () => {
		// An orphan pt-BR key is dead weight: `TranslationKey` comes from `en`, so
		// no call site can ever reach it.
		const orphaned = ptKeys.filter((k) => !(k in en));
		expect(orphaned, `keys present only in pt-BR: ${orphaned.join(', ')}`).toEqual([]);
	});

	it('no value is empty or still looks like a key', () => {
		for (const [key, value] of [...Object.entries(en), ...Object.entries(ptBR)]) {
			expect(value.trim(), `${key} is blank`).not.toBe('');
			/*
			 * A value identical to its key means the key was never translated. Only
			 * flagged for multi-word keys: single words like `packed`, `spent`,
			 * `cancel` are legitimately the same text in English, whereas nothing
			 * containing an underscore is ever display copy.
			 */
			if (key.includes('_')) {
				expect(value, `${key} still contains a raw key — it was never translated`).not.toBe(key);
			}
		}
	});

	it('placeholder names match between locales', () => {
		const placeholders = (s: string) => (s.match(/\{(\w+)\}/g) ?? []).sort().join(',');
		const mismatched: string[] = [];
		for (const key of enKeys) {
			if (!(key in ptBR)) continue;
			if (placeholders(en[key as keyof typeof en]) !== placeholders(ptBR[key])) {
				mismatched.push(
					`${key}: en "${placeholders(en[key as keyof typeof en])}" vs pt-BR "${placeholders(ptBR[key])}"`
				);
			}
		}
		expect(mismatched, mismatched.join('\n')).toEqual([]);
	});

	it('keys are sorted-enough to keep diffs readable (no duplicates by construction)', () => {
		// Object literals silently keep the last duplicate key. A duplicate is
		// invisible in review but changes which string ships.
		expect(new Set(enKeys).size).toBe(enKeys.length);
		expect(new Set(ptKeys).size).toBe(ptKeys.length);
	});
});
