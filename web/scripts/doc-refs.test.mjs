// @vitest-environment node
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { collectRefs, evaluate, findDocRefs, nextBaseline } from './doc-refs.mjs';

/**
 * The docs lint is a ratchet, so the case that matters most is the one where it
 * lets something through: a *new* dangling citation has to fail the run even
 * though the ledger already has entries in it. And `--update` must never be a way
 * to make a new one pass.
 */

const dirs = [];
function fixture(files) {
	const root = mkdtempSync(join(tmpdir(), 'docrefs-'));
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

describe('findDocRefs', () => {
	it('finds a citation in a comment', () => {
		expect(findDocRefs('/** See docs/04-data-model.md for the shape. */')).toEqual([
			'docs/04-data-model.md'
		]);
	});

	it('finds several, and reports each once', () => {
		const text = 'docs/01-requirements.md and docs/04-data-model.md and docs/01-requirements.md';
		expect(findDocRefs(text)).toEqual(['docs/01-requirements.md', 'docs/04-data-model.md']);
	});

	it('strips an anchor', () => {
		expect(findDocRefs('docs/04-data-model.md#trip-document')).toEqual(['docs/04-data-model.md']);
	});

	it('accepts a path that walks up to the repo root, and normalises it', () => {
		expect(findDocRefs('// see ../docs/05-offline-and-sync.md')).toEqual([
			'docs/05-offline-and-sync.md'
		]);
		expect(findDocRefs('// see ./docs/05-offline-and-sync.md')).toEqual([
			'docs/05-offline-and-sync.md'
		]);
	});

	it('ignores a citation that names a document elsewhere in the tree', () => {
		// `vendor/docs/x.md` is a different document from `docs/x.md`; calling it
		// missing would be a false alarm.
		expect(findDocRefs('https://example.com/docs/04-data-model.md')).toEqual([]);
	});

	it('does not treat a slash-joined word ending in "docs" as the docs directory', () => {
		expect(findDocRefs('the webdocs/04-data-model.md file')).toEqual([]);
	});

	it('ignores a directory that merely ends in "docs"', () => {
		expect(findDocRefs('webdocs/04-data-model.md')).toEqual([]);
		expect(findDocRefs('mydocs/04-data-model.md')).toEqual([]);
	});

	it('ignores a document under a subdirectory it does not own', () => {
		expect(findDocRefs('vendor/docs/04-data-model.md')).toEqual([]);
	});

	it('ignores non-markdown files', () => {
		expect(findDocRefs('docs/notes.txt docs/diagram.png')).toEqual([]);
	});

	it('finds nothing in text without a citation', () => {
		expect(findDocRefs('the data model is described elsewhere')).toEqual([]);
	});
});

describe('evaluate', () => {
	const refs = new Map([
		['docs/there.md', ['a.ts']],
		['docs/missing.md', ['b.ts']],
		['docs/newly-missing.md', ['c.ts']]
	]);
	const exists = (ref) => ref === 'docs/there.md';

	it('separates what resolves from what does not', () => {
		const result = evaluate(refs, ['docs/missing.md'], exists);
		expect(result.dangling).toEqual(['docs/missing.md', 'docs/newly-missing.md']);
		expect(result.added).toEqual(['docs/newly-missing.md']);
	});

	it('reports a ledger entry whose document now exists', () => {
		const result = evaluate(refs, ['docs/there.md'], exists);
		expect(result.fixed).toEqual(['docs/there.md']);
	});

	it('reports a ledger entry nothing cites any more', () => {
		const result = evaluate(refs, ['docs/missing.md', 'docs/deleted-long-ago.md'], exists);
		expect(result.stale).toEqual(['docs/deleted-long-ago.md']);
	});

	it('passes when the ledger matches the tree exactly', () => {
		const result = evaluate(
			new Map([['docs/missing.md', ['b.ts']]]),
			['docs/missing.md'],
			() => false
		);
		expect(result.added).toEqual([]);
		expect(result.fixed).toEqual([]);
		expect(result.stale).toEqual([]);
	});

	it('passes an empty tree with an empty ledger', () => {
		expect(evaluate(new Map(), [], () => false)).toEqual({
			dangling: [],
			added: [],
			fixed: [],
			stale: []
		});
	});
});

describe('nextBaseline', () => {
	const exists = (ref) => ref === 'docs/there.md';

	it('strikes off an entry whose document exists now', () => {
		const refs = new Map([['docs/there.md', ['a.ts']]]);
		expect(nextBaseline(refs, ['docs/there.md'], exists)).toEqual({ kept: [], additions: [] });
	});

	it('keeps an entry that still dangles', () => {
		const refs = new Map([['docs/missing.md', ['b.ts']]]);
		expect(nextBaseline(refs, ['docs/missing.md'], exists).kept).toEqual(['docs/missing.md']);
	});

	it('keeps an entry nothing cites, rather than quietly dropping the debt', () => {
		// Dropping it would be harmless today and misleading tomorrow: the file
		// it names is still missing, whoever reintroduces the citation.
		const { kept, additions } = nextBaseline(new Map(), ['docs/missing.md'], exists);
		expect(kept).toEqual(['docs/missing.md']);
		expect(additions).toEqual([]);
	});

	it('reports a new dangling reference as an addition, not as a silent entry', () => {
		const refs = new Map([['docs/brand-new.md', ['c.ts']]]);
		const { kept, additions } = nextBaseline(refs, [], exists);
		expect(kept).toEqual([]);
		expect(additions).toEqual(['docs/brand-new.md']);
	});

	it('never adds a reference that resolves', () => {
		const refs = new Map([['docs/there.md', ['a.ts']]]);
		expect(nextBaseline(refs, [], exists).additions).toEqual([]);
	});
});

describe('collectRefs', () => {
	it('walks the tree and maps each citation to the files citing it', () => {
		const root = fixture({
			'src/a.ts': '// docs/missing.md',
			'src/nested/b.svelte': '<!-- docs/missing.md -->',
			'src/c.ts': '// docs/there.md',
			'docs/there.md': '# here'
		});

		const refs = collectRefs(root);

		expect([...refs.keys()].sort()).toEqual(['docs/missing.md', 'docs/there.md']);
		expect(refs.get('docs/missing.md')).toEqual(['src/a.ts', 'src/nested/b.svelte']);
		expect(refs.get('docs/there.md')).toEqual(['src/c.ts']);
	});

	it('skips the directories that are never source', () => {
		const root = fixture({
			'node_modules/pkg/index.js': '// docs/from-a-dependency.md',
			'build/_app/x.js': '// docs/from-a-build.md',
			'src/real.ts': '// docs/missing.md'
		});

		expect([...collectRefs(root).keys()]).toEqual(['docs/missing.md']);
	});

	it('skips an audit, whose citations are findings rather than references', () => {
		const root = fixture({
			'docs/audits/2026-01-audit.md': 'The code cites docs/99-nonexistent.md in 25 places.',
			'src/real.ts': '// docs/missing.md'
		});

		expect([...collectRefs(root).keys()]).toEqual(['docs/missing.md']);
	});

	it('descends into a directory whose name looks like a source file', () => {
		const root = fixture({
			'src/a.ts': '// docs/missing.md',
			'src/component.ts/inner.svelte': '<!-- docs/missing.md -->'
		});
		expect(collectRefs(root).get('docs/missing.md')).toEqual([
			'src/a.ts',
			'src/component.ts/inner.svelte'
		]);
	});

	it('ignores files whose type cannot carry a reference', () => {
		const root = fixture({
			'src/data.bin': 'docs/missing.md',
			'src/a.ts': '// docs/missing.md'
		});
		expect(collectRefs(root).get('docs/missing.md')).toEqual(['src/a.ts']);
	});
});
