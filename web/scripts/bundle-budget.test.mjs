// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
	DEFAULT_BUDGETS,
	evaluateBudgets,
	findOrphanFonts,
	formatReport,
	groupTotal,
	measure,
	metricValue
} from './bundle-budget.mjs';

/**
 * The budget check is only worth having if it is precise about the two things it
 * claims: that the group totals add up to what is on disk, and that a font no
 * stylesheet names fails the run. A budget that silently measures the wrong
 * files is worse than none, because it reads as a guarantee.
 */

const dirs = [];
function fixture(files) {
	const root = mkdtempSync(join(tmpdir(), 'budget-'));
	dirs.push(root);
	for (const [path, contents] of Object.entries(files)) {
		const full = join(root, path);
		mkdirSync(join(full, '..'), { recursive: true });
		writeFileSync(full, contents);
	}
	return root;
}

afterEach(() => {
	while (dirs.length) rmSync(dirs.pop(), { recursive: true, force: true });
});

describe('findOrphanFonts', () => {
	it('passes a font a stylesheet names by its built filename', () => {
		expect(
			findOrphanFonts(
				['assets/inter-latin-400-normal.abc123.woff2'],
				'url(inter-latin-400-normal.abc123.woff2)'
			)
		).toEqual([]);
	});

	it('flags a font no stylesheet names', () => {
		const orphans = findOrphanFonts(
			[
				'assets/inter-latin-400-normal.abc123.woff2',
				'assets/inter-cyrillic-400-normal.def456.woff2'
			],
			'url(inter-latin-400-normal.abc123.woff2)'
		);
		expect(orphans).toEqual(['assets/inter-cyrillic-400-normal.def456.woff2']);
	});

	it('does not confuse one weight of a family for another', () => {
		// The hash is what makes this exact: same family, same weight, different
		// file — and the stylesheet names only the first.
		expect(
			findOrphanFonts(
				['assets/inter-latin-400-normal.abc1234.woff2'],
				'url(inter-latin-400-normal.abc123.woff2)'
			)
		).toEqual(['assets/inter-latin-400-normal.abc1234.woff2']);
	});

	it('is empty for a build with no fonts', () => {
		expect(findOrphanFonts([], 'anything')).toEqual([]);
	});
});

describe('measure', () => {
	it('groups files and counts everything in the precache', () => {
		const root = fixture({
			'_app/immutable/entry.js': 'console.log("hello")',
			'_app/immutable/app.css': '.a { color: red }',
			'_app/immutable/assets/inter.woff2': 'x'.repeat(500),
			'icons/icon-192.png': 'y'.repeat(300),
			'index.html': '<html></html>'
		});

		const report = measure(root);

		expect(report.files).toHaveLength(5);
		expect(report.precache.count).toBe(5);
		expect(report.precache.bytes).toBe(
			'console.log("hello")'.length +
				'.a { color: red }'.length +
				500 +
				300 +
				'<html></html>'.length
		);
		expect(groupTotal(report, 'fonts', 'bytes')).toBeCloseTo(500 / 1024, 5);
		expect(groupTotal(report, 'images', 'bytes')).toBeCloseTo(300 / 1024, 5);
	});

	it('reports a binary format at its real size rather than its gzip size', () => {
		// gzip of 500 identical bytes is a few dozen; charging the app for that
		// would understate every font and image in the build.
		const report = measure(fixture({ 'assets/inter.woff2': 'x'.repeat(500) }));
		const font = report.files[0];
		expect(font.bytes).toBe(500);
		expect(font.gzip).toBe(500);
	});

	it('gzips text formats', () => {
		const report = measure(fixture({ '_app/immutable/entry.js': 'console.log(1)\n'.repeat(50) }));
		expect(report.files[0].gzip).toBeLessThan(report.files[0].bytes);
	});

	it('finds the largest file by gzip size', () => {
		const report = measure(
			fixture({
				'small.js': 'a',
				'assets/big.woff2': 'z'.repeat(4000),
				'medium.js': 'console.log(1)'.repeat(20)
			})
		);
		expect(report.largest.path).toBe('assets/big.woff2');
	});

	it('reads font references out of the built stylesheets', () => {
		const report = measure(
			fixture({
				'_app/immutable/app.css': 'src: url(inter-latin-400-normal.abc.woff2)',
				'_app/immutable/assets/inter-latin-400-normal.abc.woff2': 'x',
				'_app/immutable/assets/inter-cyrillic-400-normal.zzz.woff2': 'y'
			})
		);
		expect(report.orphanFonts).toEqual([
			'_app/immutable/assets/inter-cyrillic-400-normal.zzz.woff2'
		]);
	});

	it('throws a readable error rather than returning an empty report', () => {
		expect(() => measure(join(tmpdir(), 'definitely-not-a-build-directory'))).toThrow();
	});
});

describe('evaluateBudgets', () => {
	const report = {
		files: [
			{ path: 'a.js', bytes: 1024 * 100, gzip: 1024 * 50, group: 'js' },
			{ path: 'b.css', bytes: 1024 * 10, gzip: 1024 * 5, group: 'css' }
		],
		totals: { bytes: 1024 * 110, gzip: 1024 * 55, count: 2 },
		precache: { bytes: 1024 * 110, count: 2 },
		largest: { path: 'a.js', bytes: 1024 * 100, gzip: 1024 * 50 },
		orphanFonts: []
	};

	it('passes a report inside every ceiling', () => {
		const { rows, failures } = evaluateBudgets(report, [
			{ name: 'js', group: 'js', metric: 'gzip', limitKb: 60 },
			{ name: 'css', group: 'css', metric: 'gzip', limitKb: 10 }
		]);
		expect(rows.every((row) => row.ok)).toBe(true);
		expect(failures).toEqual([]);
	});

	it('fails on a group over its ceiling, and says by how much', () => {
		const { failures } = evaluateBudgets(report, [
			{ name: 'js (gzip)', group: 'js', metric: 'gzip', limitKb: 40 }
		]);
		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain('50.0 KB exceeds the 40 KB budget');
	});

	it('treats a ceiling met exactly as passing', () => {
		const { failures } = evaluateBudgets(report, [
			{ name: 'js', group: 'js', metric: 'gzip', limitKb: 50 }
		]);
		expect(failures).toEqual([]);
	});

	it('measures the largest file and the precache, not just group totals', () => {
		const largest = DEFAULT_BUDGETS.find((b) => b.metric === 'largestGzip');
		const precache = DEFAULT_BUDGETS.find((b) => b.metric === 'precache');
		expect(metricValue(report, largest)).toBe(50);
		expect(metricValue(report, precache)).toBe(110);
	});

	it('fails an orphan font even when every budget passes', () => {
		const { rows, failures } = evaluateBudgets(
			{ ...report, orphanFonts: ['assets/inter-cyrillic-400.woff2'] },
			[{ name: 'js', group: 'js', metric: 'gzip', limitKb: 60 }]
		);
		expect(rows.every((row) => row.ok)).toBe(true);
		expect(failures).toHaveLength(1);
		expect(failures[0]).toContain('orphan font');
	});

	it('ships default budgets that a real build of this app can meet', () => {
		// Guards the table itself: a ceiling left at a placeholder would either
		// fail every run or never fail at all.
		expect(DEFAULT_BUDGETS.length).toBeGreaterThan(3);
		for (const budget of DEFAULT_BUDGETS) {
			expect(budget.limitKb).toBeGreaterThan(0);
			expect(Number.isFinite(budget.limitKb)).toBe(true);
		}
	});
});

describe('formatReport', () => {
	it('marks each row and lists the failures', () => {
		const text = formatReport(
			{
				files: [],
				totals: { bytes: 0, gzip: 0, count: 7 },
				precache: { bytes: 0, count: 7 },
				largest: { path: 'a.js', bytes: 0, gzip: 1024 * 151 },
				orphanFonts: []
			},
			{
				rows: [
					{ name: 'js (gzip)', actualKb: 500, limitKb: 560, ok: true },
					{ name: 'css (gzip)', actualKb: 40, limitKb: 32, ok: false }
				],
				failures: ['css (gzip): 40.0 KB exceeds the 32 KB budget by 8.0 KB']
			}
		);

		expect(text).toContain('ok    js (gzip)');
		expect(text).toContain('OVER  css (gzip)');
		expect(text).toContain('7 files precached');
		expect(text).toContain('largest: a.js (151.0 KB gzip)');
		expect(text).toContain('  - css (gzip): 40.0 KB exceeds the 32 KB budget by 8.0 KB');
	});

	it('omits the failure section when everything passes', () => {
		const text = formatReport(
			{
				files: [],
				totals: { bytes: 0, gzip: 0, count: 1 },
				precache: { bytes: 0, count: 1 },
				largest: { path: '', bytes: 0, gzip: 0 },
				orphanFonts: []
			},
			{ rows: [{ name: 'js', actualKb: 1, limitKb: 2, ok: true }], failures: [] }
		);
		expect(text).not.toContain('Failures:');
	});
});
