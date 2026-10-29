/**
 * Trip lifecycle against documents the JSON importer wrote.
 *
 * The importer stores the uploaded payload as-is, so a hand-edited plan
 * commonly contains `null` where the app writes `undefined` — e.g.
 * `"startDate": null` on a dream trip. Validation used to accept that on read
 * but reject it on the next write, so archive and delete failed with a generic
 * "could not" toast. These tests pin the schema tolerance that fixes it.
 */

import { describe, expect, it } from 'vitest';
import PouchDB from 'pouchdb-browser';
import memory from 'pouchdb-adapter-memory';
import { configureDb, getDb } from '../pouch';
import { getDoc, putDoc } from '../base';
import type { AnyDoc, Trip, TripDay } from '../schemas';
import { archive, softDelete, update } from './trips';

PouchDB.plugin(memory as never);

let counter = 0;

function freshDb(): void {
	counter += 1;
	configureDb({
		PouchImpl: PouchDB as never,
		adapter: 'memory',
		name: `itinera-trip-lifecycle-test-${counter}`
	});
}

const TRIP_ID = 'trip:01IMPORTED0000000000000000';
const NOW = '2026-10-28T15:00:00.000Z';

/** A trip shaped like the ones the JSON importer writes: nulls for absent values. */
function importedTrip(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		_id: TRIP_ID,
		type: 'trip',
		title: 'Patagonia Winter Dream',
		startDate: null,
		endDate: null,
		stage: 'planning',
		travelerCount: 2,
		homeCurrency: 'USD',
		primaryTimezone: null,
		destinations: [
			{ name: 'Ushuaia', country: null, lat: null, lng: null, arriveDate: null, departDate: null }
		],
		budget: { total: 5500, perDay: null, byCategory: { lodging: 1100 } },
		tags: ['patagonia'],
		notes: null,
		archived: false,
		coverImageAttId: null,
		createdAt: NOW,
		updatedAt: NOW,
		schemaVersion: 1,
		...overrides
	};
}

function importedDay(overrides: Record<string, unknown> = {}): Record<string, unknown> {
	return {
		_id: `day:01IMPORTED0000000000000000:undated`,
		type: 'tripDay',
		tripid: TRIP_ID,
		tripId: TRIP_ID,
		date: null,
		title: null,
		notes: null,
		createdAt: NOW,
		updatedAt: NOW,
		deletedAt: null,
		schemaVersion: 1,
		...overrides
	};
}

describe('trip lifecycle with imported nulls', () => {
	it('archives a trip whose dates are stored as null, cleaning them on write', async () => {
		freshDb();
		await getDb().put(importedTrip() as never);

		await archive('01IMPORTED0000000000000000');

		const stored = (await getDoc<Trip>(TRIP_ID)) as Trip;
		expect(stored.archived).toBe(true);
		expect(stored.archivedAt).toEqual(expect.any(String));
		// The null spellings are gone from the document, not just tolerated once.
		expect(stored.startDate).toBeUndefined();
		expect(stored.endDate).toBeUndefined();
		expect(stored.primaryTimezone).toBeUndefined();
	});

	it('edits an imported trip without tripping over nested nulls', async () => {
		freshDb();
		await getDb().put(importedTrip() as never);

		await update('01IMPORTED0000000000000000', { title: 'Patagonia, revised' });

		const stored = (await getDoc<Trip>(TRIP_ID)) as Trip;
		expect(stored.title).toBe('Patagonia, revised');
		expect(stored.destinations?.[0]?.country).toBeUndefined();
		expect(stored.budget?.perDay).toBeUndefined();
	});

	it('soft-deletes an imported trip and its null-carrying day', async () => {
		freshDb();
		await getDb().bulkDocs([importedTrip(), importedDay()] as never);

		await softDelete('01IMPORTED0000000000000000');

		const trip = (await getDoc<Trip>(TRIP_ID, getDb())) as Trip | null;
		expect(trip?.deletedAt).toEqual(expect.any(String));

		const day = (await getDoc<TripDay>(`day:01IMPORTED0000000000000000:undated`)) as TripDay | null;
		expect(day?.deletedAt).toEqual(expect.any(String));
	});

	it('keeps a child document writable after an import with null fields', async () => {
		freshDb();
		const day = importedDay() as unknown as AnyDoc;
		await getDb().put(day as never);

		const current = (await getDoc<TripDay>(day._id)) as TripDay;
		await putDoc({ ...current, title: 'Day one' } as AnyDoc);
		const stored = (await getDoc<TripDay>(day._id)) as TripDay;
		expect(stored.title).toBe('Day one');
		expect(stored.date).toBeUndefined();
	});
});
