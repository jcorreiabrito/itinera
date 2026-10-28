/**
 * Mode transitions against a real (in-memory) PouchDB.
 *
 * Dream → dated, dated → different dates, dated → dream. The pure planning is
 * covered by `date-assignment.test.ts`; here the concern is what actually gets
 * written: placements, day metadata ids, linked expenses, anchors, and that a
 * retry after a partial failure converges instead of duplicating or 409-ing.
 */

import { describe, expect, it } from 'vitest';
import PouchDB from 'pouchdb-browser';
import memory from 'pouchdb-adapter-memory';
import { configureDb } from '../pouch';
import { dreamDayId } from '../ids';
import { getDoc } from '../base';
import type { TripDay } from '../schemas';
import { clearDates, setDates } from './trip-dates';
import {
	create as createItem,
	get as getItem,
	getDay,
	setDayMeta,
	setWeekdayHint
} from './itinerary';
import { create as createExpense, get as getExpense } from './expenses';
import { create as createFlight, get as getFlight } from './flights';
import { create as createTrip, get as getTrip } from './trips';

PouchDB.plugin(memory as never);

let counter = 0;

function freshDb(): void {
	counter += 1;
	configureDb({
		PouchImpl: PouchDB as never,
		adapter: 'memory',
		name: `itinera-trip-dates-test-${counter}`
	});
}

function dreamTrip(dayCount = 3) {
	return createTrip({
		title: 'Dream',
		homeCurrency: 'EUR',
		dateMode: 'dream',
		dreamDayCount: dayCount
	});
}

function datedTrip(startDate = '2026-06-01', endDate = '2026-06-03') {
	return createTrip({
		title: 'Dated',
		startDate,
		endDate,
		homeCurrency: 'EUR'
	});
}

describe('setDates: dream → dated', () => {
	it('maps ordinals to dates, clears ordinals and keeps Ideas as Ideas', async () => {
		freshDb();
		const trip = await dreamTrip(3);
		const first = await createItem(trip._id, { title: 'Arrival walk', dayOrdinal: 1 });
		const last = await createItem(trip._id, { title: 'Last dinner', dayOrdinal: 3 });
		const idea = await createItem(trip._id, { title: 'Maybe Nara' });
		const ticket = await createExpense(trip._id, {
			description: 'Museum ticket',
			category: 'activities',
			date: null,
			linkedType: 'itineraryItem',
			linkedId: first._id
		});
		await setDayMeta(trip._id, 'dream-1', { title: 'Arrival', notes: 'Late' });
		await setWeekdayHint(trip._id, 1, 6);

		const updated = await setDates(trip._id, { startDate: '2026-06-01' });

		expect(updated).toMatchObject({
			dateMode: 'dated',
			startDate: '2026-06-01',
			endDate: '2026-06-03'
		});
		expect(updated.dreamDayCount).toBeUndefined();

		expect(await getItem(first._id)).toMatchObject({
			date: '2026-06-01',
			dayOrdinal: null
		});
		expect(await getItem(last._id)).toMatchObject({
			date: '2026-06-03',
			dayOrdinal: null
		});
		expect(await getItem(idea._id)).toMatchObject({ date: null, dayOrdinal: null });
		expect((await getExpense(ticket._id))?.date).toBe('2026-06-01');

		const day = await getDay(trip._id, '2026-06-01');
		expect(day).toMatchObject({
			date: '2026-06-01',
			title: 'Arrival',
			notes: 'Late',
			// The wish survives as informational metadata for making dates flexible again.
			weekdayHint: 6
		});
		expect(await getDay(trip._id, 'dream-1')).toBeNull();
	});

	it('honours per-day offsets and inserts days before the requested ordinal', async () => {
		freshDb();
		const trip = await dreamTrip(3);
		const one = await createItem(trip._id, { title: 'One', dayOrdinal: 1 });
		const two = await createItem(trip._id, { title: 'Two', dayOrdinal: 2 });
		const three = await createItem(trip._id, { title: 'Three', dayOrdinal: 3 });

		await setDates(trip._id, { startDate: '2026-06-01', offsets: { 2: 2, 3: 2 } });

		expect((await getItem(one._id))?.date).toBe('2026-06-01');
		expect((await getItem(two._id))?.date).toBe('2026-06-04');
		expect((await getItem(three._id))?.date).toBe('2026-06-05');
		expect((await getTrip(trip._id))?.endDate).toBe('2026-06-05');
	});

	it('is idempotent when the same mapping is applied twice', async () => {
		freshDb();
		const trip = await dreamTrip(2);
		const item = await createItem(trip._id, { title: 'Museum', dayOrdinal: 2 });

		await setDates(trip._id, { startDate: '2026-06-01' });
		await expect(setDates(trip._id, { startDate: '2026-06-01' })).resolves.toBeTruthy();

		expect((await getItem(item._id))?.date).toBe('2026-06-02');
		expect((await getTrip(trip._id))?.startDate).toBe('2026-06-01');
	});

	it('rejects an invalid mapping without writing anything', async () => {
		freshDb();
		const trip = await dreamTrip(3);
		const item = await createItem(trip._id, { title: 'Museum', dayOrdinal: 2 });

		await expect(
			setDates(trip._id, { startDate: '2026-06-01', offsets: { 2: 2, 3: 1 } })
		).rejects.toThrow(/invalid date mapping/);
		await expect(setDates(trip._id, { startDate: 'tomorrow' })).rejects.toThrow(
			/invalid date mapping/
		);

		expect(await getItem(item._id)).toMatchObject({ date: null, dayOrdinal: 2 });
		expect((await getTrip(trip._id))?.dateMode).toBe('dream');
	});

	it('moves anchors only when asked, shifting by the anchor-to-start distance', async () => {
		freshDb();
		const trip = await dreamTrip(2);
		const flight = await createFlight(trip._id, {
			segments: [
				{
					flightNumber: 'TP1',
					from: { code: 'LIS' },
					to: { code: 'CDG' },
					departLocal: '2026-07-10T09:00',
					arriveLocal: '2026-07-10T12:00'
				}
			]
		});

		await setDates(trip._id, { startDate: '2026-07-08' });
		expect((await getFlight(flight._id))?.segments?.[0].departLocal).toBe('2026-07-10T09:00');

		await clearDates(trip._id);
		await setDates(trip._id, { startDate: '2026-07-08', moveBookings: true });

		const moved = await getFlight(flight._id);
		expect(moved?.segments?.[0].departLocal).toContain('2026-07-08T09:00');
		expect(moved?.segments?.[0].arriveLocal).toContain('2026-07-08T12:00');
	});
});

describe('setDates: re-dating', () => {
	it('remaps days whose target ids already exist, without a conflict', async () => {
		freshDb();
		const trip = await datedTrip('2026-06-01', '2026-06-03');
		const one = await createItem(trip._id, { title: 'One', date: '2026-06-01' });
		const two = await createItem(trip._id, { title: 'Two', date: '2026-06-02' });
		const three = await createItem(trip._id, { title: 'Three', date: '2026-06-03' });
		await setDayMeta(trip._id, '2026-06-01', { title: 'Day one' });
		await setDayMeta(trip._id, '2026-06-02', { title: 'Day two' });
		await setDayMeta(trip._id, '2026-06-03', { title: 'Day three' });

		const updated = await setDates(trip._id, { startDate: '2026-06-02' });

		expect(updated).toMatchObject({ startDate: '2026-06-02', endDate: '2026-06-04' });
		expect((await getItem(one._id))?.date).toBe('2026-06-02');
		expect((await getItem(two._id))?.date).toBe('2026-06-03');
		expect((await getItem(three._id))?.date).toBe('2026-06-04');

		expect((await getDay(trip._id, '2026-06-02'))?.title).toBe('Day one');
		expect((await getDay(trip._id, '2026-06-03'))?.title).toBe('Day two');
		expect((await getDay(trip._id, '2026-06-04'))?.title).toBe('Day three');
		expect(await getDay(trip._id, '2026-06-01')).toBeNull();
	});

	it('keeps in-range stray dates and moves the rest to Ideas', async () => {
		freshDb();
		const trip = await datedTrip('2026-06-01', '2026-06-03');
		const inside = await createItem(trip._id, { title: 'Inside', date: '2026-06-04' });
		const outside = await createItem(trip._id, { title: 'Outside', date: '2026-06-10' });
		const early = await createItem(trip._id, { title: 'Early', date: '2026-05-20' });

		await setDates(trip._id, { startDate: '2026-06-02' });

		// 06-04 is outside the old range but inside the new one.
		expect((await getItem(inside._id))?.date).toBe('2026-06-04');
		expect(await getItem(outside._id)).toMatchObject({ date: null, dayOrdinal: null });
		expect(await getItem(early._id)).toMatchObject({ date: null, dayOrdinal: null });
	});

	it('moves standalone expenses with their day but leaves Ideas expenses alone', async () => {
		freshDb();
		const trip = await datedTrip('2026-06-01', '2026-06-02');
		const inRange = await createExpense(trip._id, {
			description: 'Lunch',
			category: 'food',
			date: '2026-06-01'
		});
		const undated = await createExpense(trip._id, {
			description: 'Insurance',
			category: 'fees'
		});

		await setDates(trip._id, { startDate: '2026-06-02' });

		expect((await getExpense(inRange._id))?.date).toBe('2026-06-02');
		expect((await getExpense(undated._id))?.date).toBeNull();
	});
});

describe('clearDates', () => {
	it('restores ordinals and weekday wishes, and keeps bookings', async () => {
		freshDb();
		const trip = await datedTrip('2026-06-01', '2026-06-03');
		const one = await createItem(trip._id, { title: 'One', date: '2026-06-01' });
		const three = await createItem(trip._id, { title: 'Three', date: '2026-06-03' });
		const outside = await createItem(trip._id, { title: 'Outside', date: '2026-05-20' });
		const linked = await createExpense(trip._id, {
			description: 'Ticket',
			category: 'activities',
			date: '2026-06-01',
			linkedType: 'itineraryItem',
			linkedId: one._id
		});
		const standalone = await createExpense(trip._id, {
			description: 'Lunch',
			category: 'food',
			date: '2026-06-02'
		});
		await setDayMeta(trip._id, '2026-06-02', { title: 'Middle' });
		const flight = await createFlight(trip._id, {
			segments: [
				{
					from: { code: 'LIS' },
					to: { code: 'CDG' },
					departLocal: '2026-06-01T09:00',
					arriveLocal: '2026-06-01T12:00'
				}
			]
		});

		const updated = await clearDates(trip._id);

		expect(updated).toMatchObject({ dateMode: 'dream', dreamDayCount: 3 });
		expect(updated.startDate).toBeUndefined();
		expect(updated.endDate).toBeUndefined();

		expect(await getItem(one._id)).toMatchObject({ date: null, dayOrdinal: 1 });
		expect(await getItem(three._id)).toMatchObject({ date: null, dayOrdinal: 3 });
		expect(await getItem(outside._id)).toMatchObject({ date: null, dayOrdinal: null });
		expect((await getExpense(linked._id))?.date).toBeNull();
		expect((await getExpense(standalone._id))?.date).toBe('2026-06-02');

		const day = await getDay(trip._id, 'dream-2');
		expect(day).toMatchObject({ ordinal: 2, title: 'Middle', weekdayHint: 2 });
		expect(await getDay(trip._id, '2026-06-02')).toBeNull();
		expect((await getFlight(flight._id))?.segments?.[0].departLocal).toBe('2026-06-01T09:00');
	});

	it('is a no-op for a dream trip', async () => {
		freshDb();
		const trip = await dreamTrip(2);
		const result = await clearDates(trip._id);
		expect(result).toMatchObject({ dateMode: 'dream', dreamDayCount: 2 });
		expect(await getDoc<TripDay>(dreamDayId(trip._id, 1))).toBeNull();
	});
});
