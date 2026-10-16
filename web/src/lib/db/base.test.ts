import { beforeEach, describe, expect, it } from 'vitest';
import PouchDB from 'pouchdb-browser';
import memory from 'pouchdb-adapter-memory';
import { configureDb, getDb } from './pouch';
import { bulkPut, getDoc, purgeDoc, purgeManyDocs, putDoc } from './base';
import { clearPending, pendingWriteCount } from './pending';
import type { AnyDoc } from './schemas';

/**
 * The write funnel is where the outbox counter is maintained, so this is where
 * it has to be pinned: a write that forgets to mark itself is a write the
 * status pill will report as already saved.
 */

PouchDB.plugin(memory as never);

let counter = 0;

function freshDb(): void {
	counter += 1;
	configureDb({
		PouchImpl: PouchDB as never,
		adapter: 'memory',
		name: `itinera-base-test-${counter}`
	});
	clearPending();
}

const doc = (id: string, type = 'note'): AnyDoc =>
	({
		_id: id,
		type,
		createdAt: '2026-10-16T09:00:00.000Z',
		updatedAt: '2026-10-16T09:00:00.000Z'
	}) as unknown as AnyDoc;

describe('the outbox counter follows every write path', () => {
	beforeEach(freshDb);

	it('counts a single put', async () => {
		await putDoc(doc('n:1'));
		expect(pendingWriteCount()).toBe(1);
	});

	it('counts a bulk write once per document', async () => {
		await bulkPut([doc('n:1'), doc('n:2'), doc('n:3')]);
		expect(pendingWriteCount()).toBe(3);
	});

	it('counts a purge', async () => {
		await putDoc(doc('n:1'));
		clearPending();
		await purgeDoc('n:1');
		expect(pendingWriteCount()).toBe(1);
	});

	it('counts a bulk purge once per document', async () => {
		await bulkPut([doc('n:1'), doc('n:2')]);
		clearPending();
		await purgeManyDocs(['n:1', 'n:2']);
		expect(pendingWriteCount()).toBe(2);
	});

	it('leaves the store untouched when there is nothing to purge', async () => {
		await purgeManyDocs([]);
		expect(pendingWriteCount()).toBe(0);
	});
});

describe('purgeManyDocs', () => {
	beforeEach(freshDb);

	it('removes the documents', async () => {
		await bulkPut([doc('n:1'), doc('n:2'), doc('n:3')]);
		await purgeManyDocs(['n:1', 'n:2']);
		expect(await getDoc('n:1')).toBeNull();
		expect(await getDoc('n:2')).toBeNull();
		expect(await getDoc('n:3')).not.toBeNull();
	});

	it('tolerates an id that another device already deleted', async () => {
		await bulkPut([doc('n:1')]);
		// A `keys` scan answers a missing document with a row and no error, so
		// the purge must skip it rather than write a tombstone with no `_rev`.
		await expect(purgeManyDocs(['n:1', 'n:gone'])).resolves.toBeUndefined();
		expect(await getDoc('n:1')).toBeNull();
	});

	it('does not resurrect a purged document on a later read', async () => {
		await bulkPut([doc('n:1')]);
		await purgeManyDocs(['n:1']);
		expect(await getDoc('n:1')).toBeNull();
	});
});

/**
 * The write funnel also rewrites documents to drop `undefined` keys, and the
 * rewrite used to rebuild *every* nested object from `Object.entries`. A Blob
 * has no enumerable own properties, so attachment bytes arrived at PouchDB as
 * `{}` and its reader rejected them — `attachments.create()` could not store a
 * file at all, and nothing in the UI said why.
 */
describe('values the write funnel must not rebuild', () => {
	beforeEach(freshDb);

	/**
	 * What the write funnel hands the driver.
	 *
	 * `put` is replaced rather than spied on, and the replacement does not call
	 * through. Real PouchDB clones the body it is given and rewrites a `Date`
	 * into its JSON string on the way in — true of PouchDB, but it would hide
	 * which layer mangled the value. Reading the document back is worse still: a
	 * swallowed Blob comes back as an absent field, which looks like a schema
	 * problem rather than this one.
	 */
	async function putAndCapture(extra: Record<string, unknown>): Promise<Record<string, unknown>> {
		const db = getDb();
		let seen: Record<string, unknown> = {};
		db.put = ((body: Record<string, unknown>) => {
			seen = body;
			return Promise.resolve({ id: String(body._id), rev: '1-test' });
		}) as unknown as typeof db.put;
		await putDoc({ ...doc('a:1', 'attachment'), ...extra } as unknown as AnyDoc, db, {
			validate: false
		});
		return seen;
	}

	it('hands a Blob to the driver intact', async () => {
		const bytes = new Blob(['boarding pass'], { type: 'application/pdf' });
		const seen = await putAndCapture({ blob: bytes });

		expect(seen.blob).toBe(bytes);
		expect(seen.blob).toBeInstanceOf(Blob);
		expect((seen.blob as Blob).size).toBe(bytes.size);
	});

	it('keeps a Blob nested the way `_attachments` nests one', async () => {
		const bytes = new Blob(['x']);
		const seen = await putAndCapture({
			_attachments: { 'pass.pdf': { content_type: 'application/pdf', data: bytes } }
		});

		const attachment = (seen._attachments as Record<string, { data: unknown }>)['pass.pdf'];
		expect(attachment.data).toBe(bytes);
	});

	it('keeps a Date and a typed array, which have the same problem', async () => {
		const when = new Date('2026-10-16T09:00:00.000Z');
		const raw = new Uint8Array([1, 2, 3]);
		const seen = await putAndCapture({ when, raw });

		expect(seen.when).toBe(when);
		expect(seen.raw).toBe(raw);
	});

	it('still drops undefined keys from the plain objects it owns', async () => {
		const seen = await putAndCapture({ keep: 'yes', drop: undefined, nested: { gone: undefined } });

		expect(seen.keep).toBe('yes');
		expect('drop' in seen).toBe(false);
		expect(seen.nested).toEqual({});
	});
});
