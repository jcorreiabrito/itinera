import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import PouchDB from 'pouchdb-browser';
import memory from 'pouchdb-adapter-memory';
import { putDoc } from './base';
import { configureDb, getDb } from './pouch';
import { currentSyncStatus, probeRemote, startSync, stopSync, syncNow } from './sync';

/**
 * The false-synced rate has to be zero.
 *
 * The pill says "Synced" in green, and it is the only thing standing between a
 * user and the belief that this device holds the only copy of their trip. It
 * used to be reachable while the server was unreachable — `navigator.onLine`
 * says an interface is up, which on a LAN or a tailnet says nothing about the
 * machine at the other end — so these tests pin the failure direction: when the
 * remote cannot be reached, the status must never settle on "synced".
 */

PouchDB.plugin(memory as never);

/** A port nothing listens on, so the connection is refused immediately. */
const DEAD_REMOTE = 'http://127.0.0.1:9/db/itinera';

let counter = 0;

function freshDb(remoteUrl: string): void {
	counter += 1;
	configureDb({
		PouchImpl: PouchDB as never,
		adapter: 'memory',
		name: `itinera-sync-test-${counter}`,
		remoteUrl
	});
}

beforeEach(() => {
	freshDb(DEAD_REMOTE);
	localStorage.clear();
});

afterEach(() => {
	stopSync();
	vi.unstubAllGlobals();
});

describe('probeRemote', () => {
	it('reports an unreachable server as unreachable', async () => {
		await expect(probeRemote(500)).resolves.toBe(false);
	});

	it('accepts any answer from the server', async () => {
		for (const status of [200, 204, 401, 403]) {
			vi.stubGlobal(
				'fetch',
				vi.fn(async () => new Response(null, { status }))
			);
			await expect(probeRemote(500)).resolves.toBe(true);
		}
	});

	it('rejects a server that answers with a failure', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => new Response(null, { status: 502 }))
		);
		await expect(probeRemote(500)).resolves.toBe(false);
	});

	it('treats a thrown fetch as unreachable', async () => {
		vi.stubGlobal(
			'fetch',
			vi.fn(async () => {
				throw new TypeError('Failed to fetch');
			})
		);
		await expect(probeRemote(500)).resolves.toBe(false);
	});
});

describe('status honesty', () => {
	it('never reports "synced" when the server is unreachable', async () => {
		await expect(syncNow(getDb())).rejects.toBeTruthy();

		const status = currentSyncStatus();
		expect(status.state).not.toBe('synced');
		// Offline, not an error: the device is fine, the server is not there.
		expect(status.state).toBe('offline');
		expect(status.error).toBeNull();
	});

	it('never reports "synced" while a background sync cannot connect', async () => {
		startSync(getDb());
		// Give the replicas a moment to fail. `retry: true` keeps them trying,
		// so the assertion is about what is *reported*, not about giving up.
		await new Promise((resolve) => setTimeout(resolve, 250));
		expect(currentSyncStatus().state).not.toBe('synced');
		stopSync();
	});

	it('does not report "synced" for a write it has not delivered', async () => {
		freshDb(DEAD_REMOTE);
		// Through the write funnel, which is what maintains the count.
		await putDoc({ _id: 'note:1', type: 'note', title: 'offline edit' } as never);
		await expect(syncNow(getDb())).rejects.toBeTruthy();

		const status = currentSyncStatus();
		expect(status.state).toBe('offline');
		// The `'pending'` state and its count are what make an unpushed write
		// visible; neither may read as an empty outbox here.
		expect(status.pendingCount).toBeGreaterThan(0);
		expect(status.pendingChanges).toBe(true);
	});
});
// The positive path — a reachable CouchDB ending in "Synced" — is covered by
// the deployment smoke check, which talks to a real server. What matters here
// is the direction of the failure: unreachable must never look like saved.
