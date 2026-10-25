#!/usr/bin/env node
/**
 * Payload budget for the built app.
 *
 * The service worker precaches the *entire* build on install — every chunk, every
 * stylesheet, every font file — because the app has to work offline on a phone in
 * a hotel with no wifi. That makes the build directory, not the first-load
 * waterfall, the number that decides whether the app is pleasant to install over
 * a tailnet or a slow connection.
 *
 * Nothing measured that number, so it grew: 3.26 MB of precache, of which 1.27 MB
 * was font files for scripts this app cannot display. Six budget rows now hold
 * the line, and one structural check backs the ratio up: a font in the build that
 * no stylesheet names is dead weight the service worker caches forever, and it
 * fails the run.
 *
 *   node scripts/bundle-budget.mjs [--build <dir>]
 *
 * Run it after `pnpm run build`. It exits non-zero on the first budget overrun.
 */

import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { gzipSync } from 'node:zlib';

const HERE = dirname(fileURLToPath(import.meta.url));

/** `web/build`, where adapter-static writes the site. */
export const DEFAULT_BUILD_DIR = resolve(HERE, '..', 'build');

const KB = 1024;

/**
 * Budget ceilings, in KB. Each one is a ceiling, not a target: it is set a little
 * above the size the app is today, so it fails on a regression rather than on a
 * refactor that moves bytes between groups.
 *
 * - `js` / `css`: gzipped, because that is what crosses the wire. Most of the
 *   JavaScript is still PouchDB. The ceiling rises with a deliberate wave of
 *   features (Today, Capture, Readiness, Packing, Feasibility, Command palette,
 *   Wallet, Export centre, print documents) and is then re-pinned a little above
 *   the measured build — it is a regression guard, not a target, and it must not
 *   be raised to excuse an accidental import.
 * - `fonts`: raw (woff2 is already compressed). 165 KB = latin, four weights,
 *   Inter + Fraunces. This ceiling is the guard on `app.css`: it is low enough
 *   that restoring `@import '@fontsource/inter/400.css'` — which pulls seven
 *   subsets in two formats, 1.2 MB — cannot pass.
 * - `images`: raw. Three PNG app icons, 307 KB between them; the 512px pair is
 *   the bulk. Worth optimizing some day; budgeted so it cannot grow quietly.
 * - `largest`: the single biggest file, gzipped. Catches one route ballooning
 *   while the totals still look fine.
 * - `precache`: everything in `build/`, raw, because that is what the service
 *   worker stores.
 */
export const DEFAULT_BUDGETS = [
	{ name: 'js (gzip)', group: 'js', metric: 'gzip', limitKb: 640 },
	{ name: 'css (gzip)', group: 'css', metric: 'gzip', limitKb: 32 },
	{ name: 'fonts (raw)', group: 'fonts', metric: 'bytes', limitKb: 200 },
	{ name: 'images (raw)', group: 'images', metric: 'bytes', limitKb: 320 },
	{ name: 'largest file (gzip)', metric: 'largestGzip', limitKb: 170 },
	{ name: 'precache total (raw)', metric: 'precache', limitKb: 2700 }
];

const GROUPS = {
	js: (rel) => rel.endsWith('.js') || rel.endsWith('.mjs'),
	css: (rel) => rel.endsWith('.css'),
	fonts: (rel) => /\.(woff2?|ttf|otf|eot)$/.test(rel),
	images: (rel) => /\.(png|jpe?g|gif|webp|avif|svg|ico)$/.test(rel),
	html: (rel) => rel.endsWith('.html')
};

function toPosix(path) {
	return path.split(sep).join('/');
}

function walk(dir, out = []) {
	for (const entry of readdirSync(dir, { withFileTypes: true })) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) walk(full, out);
		else if (entry.isFile()) out.push(full);
	}
	return out;
}

function groupOf(rel) {
	for (const [name, matches] of Object.entries(GROUPS)) {
		if (matches(rel)) return name;
	}
	return 'other';
}

/**
 * Font files in `text` that no source file names.
 *
 * Hashed filenames make this exact: a stylesheet that uses a font refers to it by
 * its full built name, so a name appearing in no stylesheet means no browser will
 * ever request it — while the service worker caches it regardless.
 *
 * @param {string[]} fontPaths build-relative posix paths
 * @param {string} sources concatenated text of the built css/js/html
 * @returns {string[]}
 */
export function findOrphanFonts(fontPaths, sources) {
	return fontPaths.filter((path) => {
		const base = path.slice(path.lastIndexOf('/') + 1);
		return !sources.includes(base);
	});
}

/**
 * Measure the build directory.
 *
 * @param {string} buildDir
 * @returns {{
 *   files: { path: string, bytes: number, gzip: number, group: string }[],
 *   totals: { bytes: number, gzip: number, count: number },
 *   precache: { bytes: number, count: number },
 *   largest: { path: string, bytes: number, gzip: number },
 *   orphanFonts: string[]
 * }}
 */
export function measure(buildDir = DEFAULT_BUILD_DIR) {
	const files = walk(buildDir).map((full) => {
		const path = toPosix(relative(buildDir, full));
		const raw = readFileSync(full);
		return {
			path,
			bytes: raw.length,
			// Binary formats are already compressed; gzipping them again would
			// report a number no one is ever charged.
			gzip: /\.(woff2?|png|jpe?g|gif|webp|avif|ico|zip)$/i.test(path)
				? raw.length
				: gzipSync(raw).length,
			group: groupOf(path)
		};
	});

	files.sort((a, b) => a.path.localeCompare(b.path));

	const sources = files
		.filter((f) => ['js', 'css', 'html'].includes(f.group))
		.map((f) => readFileSync(join(buildDir, f.path), 'utf8'))
		.join('\n');

	const totals = files.reduce(
		(acc, f) => ({ bytes: acc.bytes + f.bytes, gzip: acc.gzip + f.gzip, count: acc.count + 1 }),
		{ bytes: 0, gzip: 0, count: 0 }
	);

	return {
		files,
		totals,
		// The service worker precaches `[...build, ...files]`, which is every file
		// adapter-static wrote.
		precache: { bytes: totals.bytes, count: totals.count },
		largest: files.reduce((max, f) => (f.gzip > max.gzip ? f : max), {
			path: '(none)',
			bytes: 0,
			gzip: 0
		}),
		orphanFonts: findOrphanFonts(
			files.filter((f) => f.group === 'fonts').map((f) => f.path),
			sources
		)
	};
}

/** Sum a group's bytes or gzip size, in KB. */
export function groupTotal(report, group, metric) {
	return report.files.filter((f) => f.group === group).reduce((sum, f) => sum + f[metric], 0) / KB;
}

/** Read the metric a budget row names, in KB. */
export function metricValue(report, budget) {
	if (budget.metric === 'largestGzip') return report.largest.gzip / KB;
	if (budget.metric === 'precache') return report.precache.bytes / KB;
	return groupTotal(report, budget.group, budget.metric);
}

/**
 * Compare a report against the budget rows.
 *
 * @returns {{ rows: { name: string, actualKb: number, limitKb: number, ok: boolean }[], failures: string[] }}
 */
export function evaluateBudgets(report, budgets = DEFAULT_BUDGETS) {
	const rows = budgets.map((budget) => {
		const actualKb = metricValue(report, budget);
		return {
			name: budget.name,
			actualKb,
			limitKb: budget.limitKb,
			ok: actualKb <= budget.limitKb
		};
	});

	const failures = rows
		.filter((row) => !row.ok)
		.map(
			(row) =>
				`${row.name}: ${row.actualKb.toFixed(1)} KB exceeds the ${row.limitKb} KB budget ` +
				`by ${(row.actualKb - row.limitKb).toFixed(1)} KB`
		);

	for (const path of report.orphanFonts) {
		failures.push(
			`orphan font: ${path} is in the build but no stylesheet names it, so it is ` +
				'precached and never used'
		);
	}

	return { rows, failures };
}

/** The human-readable report, as printed by the CLI. */
export function formatReport(report, { rows, failures }) {
	const kb = (n) => `${n.toFixed(1)} KB`.padStart(10);
	const lines = ['Payload budget', ''];
	for (const row of rows) {
		const mark = row.ok ? 'ok  ' : 'OVER';
		lines.push(
			`  ${mark}  ${row.name.padEnd(24)}${kb(row.actualKb)}  / ${String(row.limitKb).padStart(5)} KB`
		);
	}
	lines.push(
		'',
		`  ${report.precache.count} files precached by the service worker`,
		`  largest: ${report.largest.path} (${(report.largest.gzip / KB).toFixed(1)} KB gzip)`
	);
	if (failures.length) {
		lines.push('', 'Failures:', ...failures.map((f) => `  - ${f}`));
	}
	return lines.join('\n');
}

function main() {
	const argv = process.argv.slice(2);
	const flag = argv.indexOf('--build');
	const buildDir = flag === -1 ? DEFAULT_BUILD_DIR : resolve(argv[flag + 1] ?? '');

	let report;
	try {
		report = measure(buildDir);
	} catch (error) {
		console.error(`Cannot read the build at ${buildDir} — run \`pnpm run build\` first.`);
		console.error(String(error?.message ?? error));
		process.exit(1);
	}

	const evaluation = evaluateBudgets(report);
	console.log(formatReport(report, evaluation));
	process.exit(evaluation.failures.length ? 1 : 0);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}
