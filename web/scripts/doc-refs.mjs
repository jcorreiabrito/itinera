#!/usr/bin/env node
/**
 * Comments in this repo cite design documents by path — `see docs/04-data-model.md`
 * — and most of those documents do not exist. A citation to a file that is not
 * there is worse than no citation: it reads as an authority for the code beside
 * it, and it sends the next person looking for something that was never written.
 *
 * This lint finds those citations and holds the count with a ratchet, because
 * fixing all of them at once is not the point. The baseline in
 * `doc-refs-baseline.json` is a debt ledger: the check fails on a *new* dangling
 * reference (write the document, or drop the reference), and it also fails when
 * a baseline entry stops dangling (run `--update` to strike it off). The list can
 * only ever get shorter on its own.
 *
 *   node scripts/doc-refs.mjs            # check
 *   node scripts/doc-refs.mjs --update   # strike fixed entries off the ledger
 *
 * `--update` refuses to *add* entries. New dangling references have to be dealt
 * with, not recorded, unless you pass `--allow-new` and mean it.
 */

import { readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));

/** Repo root, from `web/scripts/`. */
export const REPO_ROOT = resolve(HERE, '..', '..');

/** Where the ledger of known-dangling references lives. */
export const BASELINE_PATH = join(HERE, 'doc-refs-baseline.json');

/**
 * Directories never worth walking. `docs/audits` is excluded deliberately: an
 * audit quotes the very paths it is reporting missing, so its citations are
 * findings, not references, and counting them would drown the real ones.
 */
export const SKIP_DIRS = new Set([
	'.git',
	'node_modules',
	'build',
	'.svelte-kit',
	'dist',
	'coverage',
	'__pycache__',
	'.venv',
	'venv',
	'.mypy_cache',
	'.ruff_cache',
	'playwright-report',
	'test-results'
]);

const SKIP_PATHS = [join('docs', 'audits')];

/**
 * Files that must not be linted: this one and its tests. A linter whose subject
 * is "the text of a citation" cannot also be a citation — the fixtures are
 * deliberately citations to documents that do not exist, and the prose above
 * quotes the very paths it looks for.
 */
const SKIP_FILES = new Set([
	join('web', 'scripts', 'doc-refs.mjs'),
	join('web', 'scripts', 'doc-refs.test.mjs')
]);

/** File types whose text can carry a reference. */
const TEXT_EXT = new Set([
	'.ts',
	'.js',
	'.mjs',
	'.cjs',
	'.svelte',
	'.py',
	'.md',
	'.yml',
	'.yaml',
	'.json',
	'.css',
	'.html',
	'.toml',
	'.sql',
	'.sh'
]);

/**
 * A citation names a markdown file under `docs/`, optionally reached through `./`
 * or `../`, and it has to start where a path can start — after whitespace, or after one of the
 * characters prose puts in front of a path (`(`, a backtick, a quote, `*` in a
 * block comment, `[` in a markdown link). Requiring that boundary is what keeps
 * `vendor/docs/…` and a URL's `/docs/…` out of the results: those name a document
 * somewhere else, and reporting them as missing here would be a false alarm.
 */
const REF_RE = /(?:^|[\s(`'"<[{,;:*])((?:\.{1,2}\/)*docs\/[A-Za-z0-9._/-]*?\.md)/gm;

/**
 * Every document path cited in `text`, deduplicated, anchor-stripped and
 * normalised to repo-root-relative form.
 *
 * @param {string} text
 * @returns {string[]} repo-relative paths, e.g. `docs/04-data-model.md`
 */
export function findDocRefs(text) {
	const found = new Set();
	for (const match of text.matchAll(REF_RE)) {
		// Drop any `./` / `../` prefix: the same document, however it is reached.
		found.add(match[1].replace(/^(?:\.{1,2}\/)+/, ''));
	}
	return [...found];
}

function isTextFile(name) {
	const dot = name.lastIndexOf('.');
	return dot > 0 && TEXT_EXT.has(name.slice(dot).toLowerCase());
}

function walk(dir, root, out = []) {
	let entries;
	try {
		entries = readdirSync(dir, { withFileTypes: true });
	} catch {
		return out;
	}
	for (const entry of entries) {
		const full = join(dir, entry.name);
		if (entry.isDirectory()) {
			if (SKIP_DIRS.has(entry.name)) continue;
			if (
				SKIP_PATHS.some(
					(skip) => full === join(root, skip) || full.startsWith(join(root, skip) + '/')
				)
			)
				continue;
			walk(full, root, out);
		} else if (entry.isFile() && isTextFile(entry.name)) {
			if (!SKIP_FILES.has(relative(root, full).split(sep).join('/'))) out.push(full);
		}
	}
	return out;
}

/**
 * Every citation in the tree, mapped to the files that make it.
 *
 * @param {string} root
 * @returns {Map<string, string[]>} `docs/x.md` → sorted, repo-relative citing files
 */
export function collectRefs(root = REPO_ROOT) {
	/** @type {Map<string, Set<string>>} */
	const refs = new Map();
	for (const file of walk(root, root)) {
		let text;
		try {
			text = readFileSync(file, 'utf8');
		} catch {
			continue;
		}
		for (const ref of findDocRefs(text)) {
			if (!refs.has(ref)) refs.set(ref, new Set());
			refs.get(ref).add(relative(root, file));
		}
	}
	return new Map([...refs].map(([ref, files]) => [ref, [...files].sort()]));
}

/**
 * Compare the citations against the ledger.
 *
 * @param {Map<string, string[]>} refs
 * @param {string[]} baseline
 * @param {(ref: string) => boolean} exists
 * @returns {{ dangling: string[], added: string[], fixed: string[], stale: string[] }}
 *   `dangling` is everything currently broken; `added` is the part of it the
 *   ledger does not know about (the failure); `fixed` is ledger entries that now
 *   resolve; `stale` is ledger entries nothing cites any more.
 */
export function evaluate(refs, baseline, exists) {
	const known = new Set(baseline);
	const dangling = [...refs.keys()].filter((ref) => !exists(ref)).sort();
	const added = dangling.filter((ref) => !known.has(ref));
	const fixed = baseline.filter((ref) => exists(ref)).sort();
	const stale = baseline.filter((ref) => !refs.has(ref)).sort();
	return { dangling, added, fixed, stale };
}

/**
 * The ledger this run would write: entries that still dangle, in sorted order.
 *
 * @param {Map<string, string[]>} refs
 * @param {string[]} baseline
 * @param {(ref: string) => boolean} exists
 */
export function nextBaseline(refs, baseline, exists) {
	const fixed = new Set(evaluate(refs, baseline, exists).fixed);
	const kept = baseline.filter((ref) => !fixed.has(ref));
	const known = new Set(kept);
	const additions = [...refs.keys()].filter((ref) => !exists(ref) && !known.has(ref));
	return { kept: kept.sort(), additions: additions.sort() };
}

function readBaseline(path) {
	try {
		const parsed = JSON.parse(readFileSync(path, 'utf8'));
		return Array.isArray(parsed.dangling) ? parsed.dangling : [];
	} catch {
		return [];
	}
}

function existsFn(root) {
	return (ref) => {
		try {
			return statSync(join(root, ref)).isFile();
		} catch {
			return false;
		}
	};
}

export function formatRefs(refs) {
	return [...refs].map(([ref, files]) => `  ${ref}\n      cited by ${files.join(', ')}`).join('\n');
}

function main() {
	const argv = process.argv.slice(2);
	const root = REPO_ROOT;
	const refs = collectRefs(root);
	const baseline = readBaseline(BASELINE_PATH);
	const exists = existsFn(root);
	const { dangling, added, fixed, stale } = evaluate(refs, baseline, exists);

	if (argv.includes('--update')) {
		const { kept, additions } = nextBaseline(refs, baseline, exists);
		if (additions.length && !argv.includes('--allow-new')) {
			console.error(
				`Refusing to add ${additions.length} new dangling reference(s) to the ledger:\n` +
					additions.map((ref) => `  ${ref}`).join('\n') +
					'\n\nWrite the document, or delete the reference. `--allow-new` records it instead.'
			);
			process.exit(1);
		}
		const body = {
			// Written by `node scripts/doc-refs.mjs --update`.
			note:
				'Citations to design documents that do not exist yet. This is a debt ledger, ' +
				'not an approval: entries may only be removed, by writing the document or dropping ' +
				'the citation. New entries require --allow-new.',
			dangling: [...kept, ...additions].sort()
		};
		writeFileSync(BASELINE_PATH, `${JSON.stringify(body, null, '\t')}\n`);
		console.log(
			`Ledger updated: ${fixed.length} fixed, ${stale.length} uncited, ${additions.length} added.`
		);
		for (const ref of fixed) console.log(`  fixed   ${ref}`);
		for (const ref of stale) console.log(`  uncited ${ref}`);
		return;
	}

	const cited = refs.size;
	const resolving = cited - dangling.length;
	console.log(
		`Document references: ${cited} cited, ${resolving} resolve, ${dangling.length} dangling ` +
			`(${baseline.length} on the ledger).`
	);

	if (added.length) {
		console.error(
			`\n${added.length} reference(s) to a document that does not exist:\n` +
				`${formatRefs(added.map((ref) => [ref, refs.get(ref)]))}\n\n` +
				'Write the document, or drop the reference. Do not add it to the ledger.'
		);
		process.exit(1);
	}

	if (fixed.length || stale.length) {
		const lines = [
			...fixed.map((ref) => `  fixed   ${ref} — the document exists now`),
			...stale.map((ref) => `  uncited ${ref} — nothing references it any more`)
		];
		console.error(
			`\nThe ledger is out of date:\n${lines.join('\n')}\n\n` +
				'Run `node scripts/doc-refs.mjs --update` to strike these off.'
		);
		process.exit(1);
	}
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
	main();
}
