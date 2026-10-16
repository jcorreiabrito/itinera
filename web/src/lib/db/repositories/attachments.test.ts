import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PouchDB from 'pouchdb-browser';
import memory from 'pouchdb-adapter-memory';
import { configureDb, getDb } from '../pouch';
import {
	AttachmentTooLargeError,
	MAX_ATTACHMENT_BYTES,
	StorageQuotaError,
	create,
	isQuotaExceededError,
	toStorageError,
	type NewAttachmentInput
} from './attachments';

/**
 * Attachment guardrails, against a real (in-memory) PouchDB.
 *
 * What these care about is which error a caller gets for which failure: an
 * oversized file must be refused *before* it is read, a write the browser
 * rejected for want of space must come back as something the UI can explain,
 * and an unrelated failure must not be dressed up as either. The write path
 * under test is the real one; only the browser failures that an in-memory
 * adapter cannot produce (a full disk) are simulated.
 */

PouchDB.plugin(memory as never);

let counter = 0;

/** A fresh database per test: `configureDb` resets the handle. */
function freshDb(): void {
	counter += 1;
	configureDb({
		PouchImpl: PouchDB as never,
		adapter: 'memory',
		name: `itinera-attachments-test-${counter}`
	});
}

afterEach(() => {
	vi.restoreAllMocks();
});

/**
 * Let `create` run to completion without the browser storing the bytes.
 *
 * The quota cases below need this: their failure has to be invented, because no
 * in-memory adapter runs out of space, and the two guard cases want to assert
 * what was handed to the driver rather than what a real store made of it.
 *
 * This used to be load-bearing for a second reason — `stripUndefined` in
 * `db/base.ts` rebuilt every nested object from its own enumerable keys, and a
 * Blob has none, so `_attachments[x].data` reached PouchDB as `{}`. That is
 * fixed, and `base.test.ts` now pins it ("hands a Blob to the driver intact"),
 * so the bytes survive a real `put` here too.
 */
function stubPut() {
	return vi
		.spyOn(getDb(), 'put')
		.mockResolvedValue({ ok: true, id: 'att:T1:X', rev: '1-x' } as never);
}

/**
 * A small file whose **reported** size is `size`.
 *
 * The cap is enforced from `Blob.size`, which is metadata, so stubbing it tests
 * the exact boundary without allocating – and base64-encoding into the database
 * – 25 MB of bytes for every case. The file itself stays real.
 */
function fileOfSize(size: number, name = 'boarding-pass.pdf'): File {
	const file = new File([new Uint8Array([1, 2, 3, 4])], name, { type: 'application/pdf' });
	Object.defineProperty(file, 'size', { value: size });
	return file;
}

function input(file: File): NewAttachmentInput {
	return { tripid: 'T1', ownerType: 'trip', ownerId: 'trip:T1', file };
}

const docCount = async () => (await getDb().allDocs()).total_rows;

/** Run `fn` and hand back whatever it threw, so a test can inspect the error. */
async function caught(fn: () => Promise<unknown>): Promise<unknown> {
	try {
		await fn();
		return null;
	} catch (err) {
		return err;
	}
}

describe('attachment size cap', () => {
	beforeEach(freshDb);

	it('accepts a file exactly at the cap', async () => {
		const put = stubPut();

		const att = await create(input(fileOfSize(MAX_ATTACHMENT_BYTES)));

		expect(att._id).toMatch(/^att:T1:/);
		expect(att.size).toBe(MAX_ATTACHMENT_BYTES);
		// At the cap means allowed through, not merely tolerated: the document was
		// built and handed to the database unchanged.
		expect(put).toHaveBeenCalledTimes(1);
		expect(put.mock.calls[0]?.[0]).toMatchObject({
			type: 'attachment',
			size: MAX_ATTACHMENT_BYTES
		});
	});

	it('stores real bytes, which the write path used to flatten to `{}`', async () => {
		// Deliberately unstubbed, and the one case here that has to be: the whole
		// point is that PouchDB accepts the attachment rather than choking on it.
		const file = new File([new Uint8Array([1, 2, 3, 4])], 'note.txt', { type: 'text/plain' });

		const att = await create(input(file));

		const stored = await getDb().get(att._id);
		const entry = Object.values(stored._attachments as Record<string, { length: number }>)[0];
		// PouchDB computes `length` from the bytes themselves, so a non-zero value
		// here could not have come from an empty object.
		expect(entry?.length).toBe(4);
	});

	it('rejects a file one byte over the cap with a typed error, before any write', async () => {
		const put = stubPut();

		const err = await caught(() => create(input(fileOfSize(MAX_ATTACHMENT_BYTES + 1))));

		expect(err).toBeInstanceOf(AttachmentTooLargeError);
		expect(err).toMatchObject({
			size: MAX_ATTACHMENT_BYTES + 1,
			maxBytes: MAX_ATTACHMENT_BYTES
		});
		// Neither of the other two outcomes: it is a refusal, not a storage
		// failure, and nothing reached the database – which is the whole point of
		// checking the size before the bytes are read.
		expect(err).not.toBeInstanceOf(StorageQuotaError);
		expect(put).not.toHaveBeenCalled();
		expect(await docCount()).toBe(0);
	});
});

describe('storage quota', () => {
	beforeEach(freshDb);

	it('converts a QuotaExceededError from the write into a StorageQuotaError', async () => {
		const quota = new DOMException('The quota has been exceeded.', 'QuotaExceededError');
		vi.spyOn(getDb(), 'put').mockRejectedValueOnce(quota);

		const err = await caught(() => create(input(fileOfSize(1024))));

		expect(err).toBeInstanceOf(StorageQuotaError);
		// The original is kept: "storage full" is a *classification*, and dropping
		// the DOMException would make the real failure impossible to inspect later.
		expect((err as StorageQuotaError).cause).toBe(quota);
	});

	it('does not report an unrelated write failure as a storage failure', async () => {
		const boom = new Error('indexeddb transaction aborted');
		vi.spyOn(getDb(), 'put').mockRejectedValueOnce(boom);

		const err = await caught(() => create(input(fileOfSize(1024))));

		// Identity, not just "some error": the generic handler needs the real
		// failure, not a quota story that sends the user off to delete photos.
		expect(err).toBe(boom);
		expect(err).not.toBeInstanceOf(StorageQuotaError);
	});
});

describe('isQuotaExceededError', () => {
	it('recognises every spelling the engines use', () => {
		expect(isQuotaExceededError(new DOMException('quota', 'QuotaExceededError'))).toBe(true);
		expect(isQuotaExceededError({ name: 'QuotaExceededError' })).toBe(true);
		// Firefox's older storage stack.
		expect(isQuotaExceededError({ name: 'NS_ERROR_DOM_QUOTA_REACHED' })).toBe(true);
		// Legacy DOMException codes, for a failure that crossed a realm (or a
		// serializer) and lost its name.
		expect(isQuotaExceededError({ code: 22 })).toBe(true);
		expect(isQuotaExceededError({ code: 1014 })).toBe(true);
	});

	it('mistakes nothing else for a quota failure', () => {
		expect(isQuotaExceededError(new Error('boom'))).toBe(false);
		expect(isQuotaExceededError({ name: 'conflict', status: 409 })).toBe(false);
		expect(isQuotaExceededError({ name: 'TypeError' })).toBe(false);
		expect(isQuotaExceededError(null)).toBe(false);
		expect(isQuotaExceededError(undefined)).toBe(false);
		expect(isQuotaExceededError('QuotaExceededError')).toBe(false);
	});

	it('toStorageError passes a non-quota failure through by identity', () => {
		const err = new Error('boom');

		expect(toStorageError(err)).toBe(err);
	});

	it('toStorageError wraps a quota failure and keeps it as the cause', () => {
		const quota = { name: 'QuotaExceededError' };

		const wrapped = toStorageError(quota);

		expect(wrapped).toBeInstanceOf(StorageQuotaError);
		expect((wrapped as StorageQuotaError).cause).toBe(quota);
	});
});
