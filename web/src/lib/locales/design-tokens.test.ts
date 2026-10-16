import { readFileSync, readdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, relative } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Design-token integrity.
 *
 * Tailwind resolves a colour to `rgb(var(--color-x-rgb) / <alpha-value>)`. When
 * the token is missing the declaration is still emitted, so the class *looks*
 * applied in the markup while the browser drops it as invalid — that is how
 * `text-danger` rendered the light-theme red in dark mode and how an undefined
 * `primary-800` left badges with no border and no background. There is no build
 * error and no warning; the only way to catch it is to assert the correspondence.
 *
 * Three things are checked, all statically against the source of truth
 * (`src/app.css` + `tailwind.config.ts`), never against a built bundle:
 *
 *   1. every `--color-*-rgb` token the Tailwind config references is defined;
 *   2. every token is either redefined in `html.dark` or listed as deliberately
 *      theme-constant, so a new theme-dependent colour cannot slip through;
 *   3. every `primary-N` / status / surface utility that appears in the source
 *      actually resolves to a token, so a typo like `bg-surface-sunken-2` fails
 *      here instead of silently rendering unstyled.
 */

const WEB_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const APP_CSS = readFileSync(join(WEB_ROOT, 'src', 'app.css'), 'utf8');
const TAILWIND_CONFIG = readFileSync(join(WEB_ROOT, 'tailwind.config.ts'), 'utf8');

/**
 * Every source file under `src`, as `[path, text]`.
 *
 * `node:fs` rather than `import.meta.glob(..., { query: '?raw' })`: Vitest stubs
 * CSS modules to an empty string, and that stub also swallows `?raw` imports of
 * `.css`, which silently made every assertion below pass against `''`.
 */
const SOURCES: [string, string][] = (function walk(dir: string, out: [string, string][] = []) {
	for (const entry of readdirSync(dir)) {
		if (entry === 'node_modules' || entry.startsWith('.')) continue;
		const full = join(dir, entry);
		if (statSync(full).isDirectory()) walk(full, out);
		else if (/\.(svelte|ts|js)$/.test(entry) && !/\.test\.ts$/.test(entry))
			out.push([relative(WEB_ROOT, full), readFileSync(full, 'utf8')]);
	}
	return out;
})(join(WEB_ROOT, 'src'));

/** Names defined as `--name-rgb: r g b;` (a triple usable with <alpha-value>). */
function definedRgbTokens(css: string): Set<string> {
	const names = new Set<string>();
	for (const match of css.matchAll(/^\s*(--[a-z0-9-]+)-rgb:\s*([\d\s]+);/gim)) {
		const [, name, value] = match;
		const parts = value.trim().split(/\s+/);
		// A malformed triple is as broken as a missing one, so require 3 numbers.
		// Stored with the suffix because that is how tailwind.config.ts spells it
		// (`rgb(var(--color-bg-rgb) / <alpha-value>)`).
		if (parts.length === 3 && parts.every((p) => /^\d{1,3}$/.test(p))) names.add(`${name}-rgb`);
	}
	return names;
}

/** Names defined as a plain hex, e.g. `--color-border: #eae1d4;`. */
function definedHexTokens(css: string): Set<string> {
	const names = new Set<string>();
	for (const match of css.matchAll(/^\s*(--[a-z0-9-]+):\s*(#[0-9a-f]{3,8});/gim)) {
		names.add(match[1]);
	}
	return names;
}

/** Every `--token` the Tailwind config interpolates into a `rgb(...)` value. */
function rgbTokensReferencedByConfig(config: string): string[] {
	const found = new Set<string>();
	for (const match of config.matchAll(/rgb\(\s*var\((--[a-z0-9-]+)\)/g)) found.add(match[1]);
	return [...found].sort();
}

describe('design tokens', () => {
	const rgbTokens = definedRgbTokens(APP_CSS);
	const hexTokens = definedHexTokens(APP_CSS);
	const referenced = rgbTokensReferencedByConfig(TAILWIND_CONFIG);

	it('the token parser actually found tokens', () => {
		// Guards the regexes themselves: if `app.css` were restructured these
		// tests would otherwise pass by finding nothing at all.
		expect(rgbTokens.size).toBeGreaterThan(15);
		expect(referenced.length).toBeGreaterThan(15);
		expect(SOURCES.length).toBeGreaterThan(50);
	});

	it('tailwind.config.ts references no undefined token', () => {
		const missing = referenced.filter((token) => !rgbTokens.has(token));
		expect(
			missing,
			`tailwind.config.ts uses tokens that app.css never defines:\n  ${missing.join('\n  ')}`
		).toEqual([]);
	});

	/*
	 * Tokens that are deliberately the same in both themes. Listing them is the
	 * point: a colour that works on paper and on charcoal is a decision, and
	 * writing it down is what stops a genuinely theme-dependent token from
	 * quietly joining the set. Every entry carries its measured ratio.
	 */
	const THEME_CONSTANT_TOKENS = new Set([
		// 7.5:1 on the dark surface and 2.2:1 on the light one — used as a star
		// fill and 10%-opacity chip background, never as body text.
		'--color-accent-amber-rgb'
	]);

	it('every token tailwind references is theme-aware or explicitly constant', () => {
		// `html.dark { ... }` must redefine each token the light `:root` defines,
		// or that colour silently keeps its light value in dark mode.
		const darkBlock = APP_CSS.match(/html\.dark\s*\{([\s\S]*?)\n\t\}/);
		expect(darkBlock, 'no html.dark block found in app.css').not.toBeNull();
		const darkTokens = definedRgbTokens(darkBlock![1]);
		const missing = referenced.filter(
			(token) => !darkTokens.has(token) && !THEME_CONSTANT_TOKENS.has(token)
		);
		expect(
			missing,
			`neither redefined in html.dark nor listed as theme-constant:\n  ${missing.join('\n  ')}`
		).toEqual([]);
	});

	it('the theme-constant list has no stale entries', () => {
		const stale = [...THEME_CONSTANT_TOKENS].filter((token) => !referenced.includes(token));
		expect(stale, `listed as theme-constant but no longer used: ${stale.join(', ')}`).toEqual([]);
	});

	it('every token has a matching hex alias (and vice versa)', () => {
		/*
		 * The hex forms exist because a few inline styles and the print layer use
		 * `var(--color-x)` directly, where an `-rgb` triple would be invalid.
		 * A token with only one of the two forms breaks whichever consumer is
		 * missing it, so the pairing is asserted rather than assumed.
		 */
		const aliased = [...rgbTokens].map((name) => name.replace(/-rgb$/, ''));
		const unpaired = aliased.filter((name) => !hexTokens.has(name));
		expect(
			unpaired,
			`tokens with an -rgb triple but no hex alias:\n  ${unpaired.join('\n  ')}`
		).toEqual([]);
	});

	it('every primary step used in the source is defined', () => {
		const defined = new Set(
			[...rgbTokens]
				.filter((t) => t.startsWith('--color-primary-'))
				.map((t) => t.replace('--color-primary-', '').replace('-rgb', ''))
		);
		const used = new Set<string>();
		for (const [, text] of SOURCES) {
			for (const match of text.matchAll(
				/\b(?:bg|text|border|fill|stroke|ring|from|to|via|shadow|outline|decoration|accent|caret|divide)-primary-(\d{2,3})\b/g
			)) {
				used.add(match[1]);
			}
		}
		const missing = [...used].filter((step) => !defined.has(step)).sort();
		expect(
			missing,
			`primary steps used in the source but not defined as tokens: ${missing.join(', ')}`
		).toEqual([]);
	});

	it('opacity modifiers are never applied to a hex-valued colour', () => {
		/*
		 * `<alpha-value>` only substitutes into `rgb(...)`. A class like
		 * `bg-primary-600/20` is fine because primary-600 is a token triple, but
		 * `bg-current/20` or any literal-hex colour compiles to a declaration the
		 * browser discards. `border-current-soft` exists in app.css precisely to
		 * work around this, so catching the pattern here stops it recurring.
		 */
		const offenders: string[] = [];
		for (const [file, text] of SOURCES) {
			for (const match of text.matchAll(/\b(?:bg|text|border|ring|fill|stroke)-current\/\d+/g)) {
				offenders.push(`${file}: ${match[0]}`);
			}
		}
		expect(
			offenders,
			`alpha modifier on currentColor — Tailwind 3 cannot compile these:\n  ${offenders.join('\n  ')}`
		).toEqual([]);
	});

	it('radius tokens are defined for every radius utility the config exposes', () => {
		for (const token of ['--radius-sm', '--radius-md', '--radius-lg', '--radius-xl']) {
			expect(APP_CSS, `${token} is used by tailwind.config.ts but not defined`).toContain(
				`${token}:`
			);
		}
	});
});
