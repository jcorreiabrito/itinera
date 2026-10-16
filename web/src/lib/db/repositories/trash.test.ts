import { beforeEach, describe, expect, it } from 'vitest';
import PouchDB from 'pouchdb-browser';
import memory from 'pouchdb-adapter-memory';
import { configureDb } from '../pouch';
import { getDoc, listDeleted, softDeleteDoc } from '../base';
import * as trash from './trash';
import * as trips from './trips';
import * as settings from './settings';
import type { AnyDoc } from '../schemas';

/**
 * The Trash round trip, against a real (in-memory) PouchDB.
 *
 * These run against the store rather than a mock because the bug they cover is
 * about *what ends up in the database*: restoring a trip from the flat Trash
 * list cleared `deletedAt` on the trip alone, so the itinerary, flights,
 * reservations, checklist and expenses stayed deleted and the restored trip
 * looked empty. Nothing threw, and a mock would happily have agreed.
 */

PouchDB.plugin(memory as never);

let counter = 0;

/** A fresh database per test: `configureDb` resets the handle. */
function freshDb(): void {
	counter += 1;
	configureDb({
		PouchImpl: PouchDB as never,
		adapter: 'memory',
		name: `itinera-trash-test-${counter}`
	});
}

const STAMP = '2026-10-16T09:00:00.000Z';

const tripDoc = (id = 'trip:T1') => ({
	_id: id,
	type: 'trip',
	title: 'Kyoto in autumn',
	startDate: '2026-11-02',
	endDate: '2026-11-09',
	homeCurrency: 'EUR',
	destinations: [],
	archived: false,
	stage: 'confirmed',
	tags: [],
	travelerCount: 1,
	createdAt: STAMP,
	updatedAt: STAMP,
	deletedAt: null,
	schemaVersion: 1
});

/** One child of each kind, so the cascade is covered for every type. */
const childDocs = (tripId = 'trip:T1') => {
	const uid = tripId.replace('trip:', '');
	const common = {
		tripid: tripId,
		createdAt: STAMP,
		updatedAt: STAMP,
		deletedAt: null,
		schemaVersion: 1
	};
	return [
		{ ...common, _id: `day:${uid}:2026-11-02`, type: 'tripDay', date: '2026-11-02' },
		{
			...common,
			_id: `itin:${uid}:A`,
			type: 'itineraryItem',
			title: 'Fushimi Inari',
			date: '2026-11-03',
			order: 0
		},
		{ ...common, _id: `chk:${uid}:A`, type: 'checklistItem', text: 'Passport', done: false },
		{ ...common, _id: `flt:${uid}:A`, type: 'flight', segments: [], attachmentIds: [], order: 0 },
		{
			...common,
			_id: `res:${uid}:A`,
			type: 'reservation',
			kind: 'lodging',
			name: 'Hotel',
			details: {},
			attachmentIds: [],
			order: 0
		},
		{
			...common,
			_id: `exp:${uid}:A`,
			type: 'expense',
			description: 'Taxi',
			amountActual: 20,
			currency: 'EUR'
		},
		{
			...common,
			_id: `att:${uid}:A`,
			type: 'attachment',
			filename: 'ticket.pdf',
			mime: 'application/pdf'
		}
	];
};

async function seed(): Promise<void> {
	const db = (await import('../pouch')).getDb();
	await db.bulkDocs([tripDoc(), ...childDocs()] as never);
}

const ids = async () => (await listDeleted()).map((doc) => doc._id).sort();
const alive = async (id: string) => (await getDoc<AnyDoc>(id))?.deletedAt ?? null;

describe('trash cascade', () => {
	beforeEach(() => {
		freshDb();
		return seed();
	});

	it('restores a trip together with everything in it', async () => {
		await trips.softDelete('trip:T1');
		expect(await ids()).toHaveLength(8);

		await trash.restore('trip:T1');

		expect(await ids()).toEqual([]);
		expect(await alive('trip:T1')).toBeNull();
		expect(await alive('itin:T1:A')).toBeNull();
		expect(await alive('att:T1:A')).toBeNull();
	});

	it('restores a lone child on its own', async () => {
		await trips.softDelete('trip:T1');
		await trash.restore('itin:T1:A');

		// The item comes back; its siblings and the trip stay in the Trash.
		expect(await alive('itin:T1:A')).toBeNull();
		expect(await alive('trip:T1')).not.toBeNull();
		expect(await ids()).toHaveLength(7);
	});

	it('purges a trip without stranding its children', async () => {
		await trips.softDelete('trip:T1');
		await trash.purge('trip:T1');

		// Left behind they would be orphans: nothing links to them, so the only
		// way to reach them would be the Trash list itself, forever.
		expect(await ids()).toEqual([]);
		expect(await getDoc<AnyDoc>('itin:T1:A')).toBeNull();
	});

	it('purges a mixed selection, cascading only for trips', async () => {
		await trips.softDelete('trip:T1');
		await trash.purgeMany(['trip:T1', 'flt:T1:A']);

		expect(await getDoc<AnyDoc>('trip:T1')).toBeNull();
		expect(await getDoc<AnyDoc>('flt:T1:A')).toBeNull();
		expect(await ids()).toEqual([]);
	});

	it('empties everything in one go', async () => {
		await trips.softDelete('trip:T1');
		expect(await trash.empty()).toBe(8);
		expect(await ids()).toEqual([]);
	});

	it('restores a whole selection', async () => {
		await trips.softDelete('trip:T1');
		await trash.restoreMany(['trip:T1', 'itin:T1:A']);

		expect(await ids()).toEqual([]);
	});
});

describe('trash listing', () => {
	beforeEach(() => {
		freshDb();
		return seed();
	});

	it('labels entries from the document', async () => {
		await trips.softDelete('trip:T1');
		const entries = await trash.list();
		const byId = new Map(entries.map((entry) => [entry.id, entry]));

		expect(byId.get('trip:T1')?.label).toBe('Kyoto in autumn');
		expect(byId.get('itin:T1:A')?.label).toBe('Fushimi Inari');
		// A child carries the trip it belongs to; a trip carries no `tripid`.
		expect(byId.get('itin:T1:A')?.tripid).toBe('trip:T1');
		expect(byId.get('trip:T1')?.tripid).toBeUndefined();
	});

	it('groups a deleted trip with everything in it', async () => {
		await trips.softDelete('trip:T1');
		const { groups, loose } = await trash.listGrouped();

		expect(loose).toEqual([]);
		expect(groups).toHaveLength(1);
		expect(groups[0].tripId).toBe('trip:T1');
		expect(groups[0].title).toBe('Kyoto in autumn');
		expect(groups[0].trip?.id).toBe('trip:T1');
		// Seven children, and the trip itself is not one of them.
		expect(groups[0].entries).toHaveLength(7);
	});

	it('names a group after a trip that is still alive', async () => {
		// Only the itinerary item was deleted; the trip is fine.
		await softDeleteDoc('itin:T1:A');
		const { groups } = await trash.listGrouped();

		expect(groups).toHaveLength(1);
		expect(groups[0].trip).toBeNull();
		expect(groups[0].title).toBe('Kyoto in autumn');
		expect(groups[0].entries.map((entry) => entry.id)).toEqual(['itin:T1:A']);
	});

	it('keeps trip-less documents out of the groups', async () => {
		const db = (await import('../pouch')).getDb();
		await db.put({
			_id: 'tpl:1',
			type: 'checklistTemplate',
			name: 'Beach',
			createdAt: STAMP,
			updatedAt: STAMP,
			deletedAt: STAMP,
			schemaVersion: 1
		} as never);

		const { groups, loose } = await trash.listGrouped();
		expect(groups).toEqual([]);
		expect(loose.map((entry) => entry.id)).toEqual(['tpl:1']);
	});

	it('orders groups by their most recent deletion', async () => {
		const db = (await import('../pouch')).getDb();
		await db.bulkDocs([{ ...tripDoc('trip:T2'), title: 'Older trip' }] as never);
		const t2 = (await db.get('trip:T2')) as never as Record<string, unknown>;
		await db.put({ ...t2, deletedAt: '2026-09-01T00:00:00.000Z' } as never);

		// T1's day goes now, which is after T2's September deletion.
		await softDeleteDoc('day:T1:2026-11-02');

		const { groups } = await trash.listGrouped();
		expect(groups.map((group) => group.tripId)).toEqual(['trip:T1', 'trip:T2']);
	});

	it('lists most recently deleted first', async () => {
		const db = (await import('../pouch')).getDb();
		const older = (await db.get('chk:T1:A')) as never as Record<string, unknown>;
		await db.put({ ...older, deletedAt: '2026-10-01T00:00:00.000Z' } as never);
		const newer = (await db.get('exp:T1:A')) as never as Record<string, unknown>;
		await db.put({ ...newer, deletedAt: '2026-10-15T00:00:00.000Z' } as never);

		const entries = await trash.list();
		expect(entries.map((entry) => entry.id)).toEqual(['exp:T1:A', 'chk:T1:A']);
	});
});

describe('trash retention', () => {
	beforeEach(() => {
		freshDb();
		return seed();
	});

	/** Backdate a document's deletion so a retention window can reach it. */
	async function setDeletedAt(id: string, iso: string): Promise<void> {
		const db = (await import('../pouch')).getDb();
		const doc = (await db.get(id)) as never as Record<string, unknown>;
		await db.put({ ...doc, deletedAt: iso } as never);
	}

	const NOW = new Date('2026-10-16T12:00:00.000Z');

	it('keeps everything when no window is set', async () => {
		await trips.softDelete('trip:T1');
		await setDeletedAt('trip:T1', '2020-01-01T00:00:00.000Z');

		expect(await trash.purgeExpired(0, NOW)).toBe(0);
		expect(await ids()).toHaveLength(8);
	});

	it('keeps a document that is still inside the window', async () => {
		await trips.softDelete('trip:T1');
		await setDeletedAt('trip:T1', '2026-10-10T00:00:00.000Z');

		expect(await trash.purgeExpired(30, NOW)).toBe(0);
		expect(await ids()).toHaveLength(8);
	});

	it('purges what is past the window, cascading for a trip', async () => {
		await trips.softDelete('trip:T1');
		await setDeletedAt('trip:T1', '2026-08-01T00:00:00.000Z');

		expect(await trash.purgeExpired(30, NOW)).toBe(1);
		// The trip's day was deleted with it and carries a fresh `deletedAt`, so
		// the cascade — not the clock — is what removes it.
		expect(await ids()).toEqual([]);
	});

	it('reads the window from settings, and does nothing without one', async () => {
		await trips.softDelete('trip:T1');
		await setDeletedAt('trip:T1', '2026-08-01T00:00:00.000Z');

		// The settings document is created with the default: keep forever.
		expect(await trash.runRetention(NOW)).toBe(0);
		expect(await ids()).toHaveLength(8);

		await settings.update({ trashRetentionDays: 30 });
		expect(await trash.runRetention(NOW)).toBe(1);
		expect(await ids()).toEqual([]);
	});

	it('treats a nonsense window as "keep"', async () => {
		await trips.softDelete('trip:T1');
		await setDeletedAt('trip:T1', '2020-01-01T00:00:00.000Z');

		expect(await trash.purgeExpired(Number.NaN, NOW)).toBe(0);
		expect(await trash.purgeExpired(-7, NOW)).toBe(0);
		expect(await ids()).toHaveLength(8);
	});
});
