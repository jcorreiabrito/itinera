import { beforeEach, describe, expect, it } from 'vitest';
import PouchDB from 'pouchdb-browser';
import memory from 'pouchdb-adapter-memory';
import { configureDb } from './pouch';
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
