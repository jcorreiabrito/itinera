import { describe, expect, it } from 'vitest';
import PouchDB from 'pouchdb-browser';
import memory from 'pouchdb-adapter-memory';
import { configureDb, getDb } from './pouch';
import { create as createTrip, get as getTrip } from './repositories/trips';
import { restoreConflictFields } from './sync';

/**
 * Recovering a value from a resolved conflict.
 *
 * The retention log is written by the sync loop, not by the UI. These tests put
 * a log entry in place directly, because the thing under test is the restore:
 * does the chosen field become a normal local edit, and does a revision that is
 * no longer retained fail loudly instead of pretending to succeed.
 */

PouchDB.plugin(memory as never);

let counter = 0;

function freshDb(): void {
	counter += 1;
	configureDb({
		PouchImpl: PouchDB as never,
		adapter: 'memory',
		name: `itinera-conflict-restore-${counter}`
	});
}

async function seedLog(docId: string, loserRev: string, loserDoc: Record<string, unknown>) {
	const now = new Date().toISOString();
	await getDb().put({
		_id: '_local/itinera-conflicts',
		entries: {
			[docId]: {
				docId,
				winnerRev: '2-winner',
				resolvedAt: now,
				losers: [{ rev: loserRev, updatedAt: now, retainedAt: now, doc: loserDoc }]
			}
		}
	} as never);
}

describe('restoreConflictFields', () => {
	it('writes the chosen field back as a new local edit', async () => {
		freshDb();
		const trip = await createTrip({
			title: 'Kept title',
			startDate: '2026-06-01',
			endDate: '2026-06-02',
			homeCurrency: 'EUR'
		});

		await seedLog(trip._id, '1-loser', {
			...trip,
			title: 'Set aside title',
			_rev: '1-loser'
		});

		await restoreConflictFields(trip._id, '1-loser', ['title']);

		const after = await getTrip(trip._id);
		expect(after?.title).toBe('Set aside title');
	});

	it('refuses a revision the log no longer retains', async () => {
		freshDb();
		const trip = await createTrip({
			title: 'Only version',
			startDate: '2026-06-01',
			endDate: '2026-06-02',
			homeCurrency: 'EUR'
		});

		await expect(restoreConflictFields(trip._id, 'gone', ['title'])).rejects.toThrow(
			/no retained revision/
		);
		expect((await getTrip(trip._id))?.title).toBe('Only version');
	});
});
