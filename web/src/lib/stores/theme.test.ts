import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, it, expect, beforeEach } from 'vitest';
import { THEME_COLOR, theme, themeColor } from './theme.svelte';

/** app.html ships the pre-hydration default, so its literals must not drift. */
const APP_HTML = readFileSync(
	join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'app.html'),
	'utf8'
);

const metaContents = () =>
	Array.from(document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')).map(
		(meta) => meta.content
	);

describe('theme-color meta', () => {
	beforeEach(() => {
		// The two tags app.html ships, media-keyed on the OS scheme.
		document.head.innerHTML = `
			<meta name="theme-color" media="(prefers-color-scheme: light)" content="#fbf7f1" />
			<meta name="theme-color" media="(prefers-color-scheme: dark)" content="#111613" />
		`;
	});

	it('maps the effective theme onto the colours app.html ships', () => {
		expect(themeColor(false)).toBe('#fbf7f1');
		expect(themeColor(true)).toBe('#111613');
		expect(APP_HTML).toContain(`content="${THEME_COLOR.light}"`);
		expect(APP_HTML).toContain(`content="${THEME_COLOR.dark}"`);
	});

	it('rewrites both tags when a theme is picked by hand', () => {
		// The OS-light meta still matches when the app is dark, so it is the one
		// that must be corrected — setting only the dark-keyed tag would leave the
		// light status bar the user is complaining about.
		theme.set('dark');
		expect(metaContents()).toEqual(['#111613', '#111613']);

		theme.set('light');
		expect(metaContents()).toEqual(['#fbf7f1', '#fbf7f1']);
	});
});
