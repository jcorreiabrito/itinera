import { describe, expect, it } from 'vitest';
import { baseEn, en } from './en';
import { basePtBR, ptBR } from './pt-BR';
import { batchEn, batchPt } from './features/batch';
import { captureEn, capturePt } from './features/capture';
import { commandEn, commandPt } from './features/command';
import { configEn, configPt } from './features/config';
import { conflictsEn, conflictsPt } from './features/conflicts';
import { densityEn, densityPt } from './features/density';
import { exportCenterEn, exportCenterPt } from './features/export-center';
import { feasibilityEn, feasibilityPt } from './features/feasibility';
import { packingEn, packingPt } from './features/packing';
import { printDocEn, printDocPt } from './features/print-doc';
import { readinessEn, readinessPt } from './features/readiness';
import { restoreEn, restorePt } from './features/restore';
import { todayEn, todayPt } from './features/today';
import { walletEn, walletPt } from './features/wallet';
import { workspaceEn, workspacePt } from './features/workspace';

/**
 * Every feature-owned slice, paired with its Portuguese twin.
 *
 * Adding a slice to `en.ts` without adding it here would leave it unguarded —
 * the compiler cannot tell us about a spread we forgot to test, so this list is
 * the second half of the registration.
 */
const SLICES: ReadonlyArray<readonly [string, Record<string, string>, Record<string, string>]> = [
	['batch', batchEn, batchPt],
	['capture', captureEn, capturePt],
	['command', commandEn, commandPt],
	['config', configEn, configPt],
	['conflicts', conflictsEn, conflictsPt],
	['density', densityEn, densityPt],
	['export-center', exportCenterEn, exportCenterPt],
	['feasibility', feasibilityEn, feasibilityPt],
	['packing', packingEn, packingPt],
	['print-doc', printDocEn, printDocPt],
	['readiness', readinessEn, readinessPt],
	['restore', restoreEn, restorePt],
	['today', todayEn, todayPt],
	['wallet', walletEn, walletPt],
	['workspace', workspaceEn, workspacePt]
];

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

	it('feature slices never shadow a core key', () => {
		// `{ ...base, ...slice }` lets a slice win. If a feature redefines
		// `retry`, every unrelated screen changes text and the diff that did it
		// is a one-line addition in a new file — invisible in review.
		const clashes: string[] = [];
		for (const [name, sliceEn, slicePt] of SLICES) {
			for (const key of Object.keys(sliceEn)) {
				if (key in baseEn) clashes.push(`${name}: "${key}" shadows a core English key`);
				if (!(key in slicePt)) clashes.push(`${name}: "${key}" has no pt-BR value`);
			}
			for (const key of Object.keys(slicePt)) {
				if (!(key in sliceEn)) clashes.push(`${name}: "${key}" exists only in pt-BR`);
				if (key in basePtBR) clashes.push(`${name}: "${key}" shadows a core pt-BR key`);
			}
		}
		expect(clashes, clashes.join('\n')).toEqual([]);
	});

	it('feature slices do not overlap each other', () => {
		// Two features picking the same key would ship whichever module happens to
		// be spread last, decided by import order rather than by intent.
		const owner = new Map<string, string>();
		const clashes: string[] = [];
		for (const [name, sliceEn] of SLICES) {
			for (const key of Object.keys(sliceEn)) {
				const previous = owner.get(key);
				if (previous) clashes.push(`"${key}" is defined by both ${previous} and ${name}`);
				else owner.set(key, name);
			}
		}
		expect(clashes, clashes.join('\n')).toEqual([]);
	});
});
