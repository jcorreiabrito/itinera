/**
 * Dream timelines and placement against a real (in-memory) PouchDB.
 *
 * The invariant these tests protect is single placement: an item is either on a
 * real date or on an ordinal, never both. The day list, the Ideas bucket and the
 * duplicate path all read that invariant, so a write that breaks it makes items
 * disappear from every view.
 */

import { describe, expect, it } from 'vitest';
import PouchDB from 'pouchdb-browser';
import memory from 'pouchdb-adapter-memory';
import { configureDb } from '../pouch';
import { dreamDayId } from '../ids';
import { getDoc } from '../base';
import type { TripDay } from '../schemas';
import {
	create as createItem,
	get as getItem,
	getDay,
	moveToDay,
	moveToOrdinal,
	setDayMeta,
	setWeekdayHint,
	tripTimeline,
	update
} from './itinerary';
import { create as createExpense } from './expenses';
import { create as createTrip, duplicate, setDreamDayCount } from './trips';

PouchDB.plugin(memory as never);

let counter = 0;

function freshDb(): void {
	counter += 1;
	configureDb({
		PouchImpl: PouchDB as never,
		adapter: 'memory',
		name: `itinera-dream-itinerary-test-${counter}`
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

function datedTrip() {
	return createTrip({
		title: 'Dated',
		startDate: '2026-06-01',
		endDate: '2026-06-02',
		homeCurrency: 'EUR'
	});
}

describe('dream timeline', () => {
	it('builds Day 1..N and never leaks ordinal items into Ideas or dates', async () => {
		freshDb();
		const trip = await dreamTrip(3);
		const allDay = await createItem(trip._id, {
			title: 'Ryokan',
			dayOrdinal: 1,
			allDay: true,
			order: 1
		});
		const timed = await createItem(trip._id, {
			title: 'Museum',
			dayOrdinal: 1,
			startTime: '10:00',
			order: 0
		});
		const dayTwo = await createItem(trip._id, { title: 'Market', dayOrdinal: 2 });
		const idea = await createItem(trip._id, { title: 'Maybe Nara' });
		// A stray real-dated item on a dream trip stays reachable in Ideas.
		const stale = await createItem(trip._id, { title: 'Old booking slot', date: '2026-05-01' });

		const { days, unscheduled } = await tripTimeline(trip._id);

		expect(days.map((day) => day.key)).toEqual(['dream-1', 'dream-2', 'dream-3']);
		expect(days.map((day) => day.kind)).toEqual(['dream', 'dream', 'dream']);
		expect(days.map((day) => day.date)).toEqual([null, null, null]);
		expect(days.map((day) => day.ordinal)).toEqual([1, 2, 3]);
		expect(days[0].allDay.map((item) => item._id)).toEqual([allDay._id]);
		expect(days[0].timed.map((entry) => entry.item?._id)).toEqual([timed._id]);
		expect(days[1].timed.map((entry) => entry.item?._id)).toEqual([dayTwo._id]);

		const ideaIds = unscheduled.timed.map((entry) => entry.item?._id);
		expect(ideaIds).toEqual([idea._id, stale._id]);
		expect(unscheduled.kind).toBe('ideas');
		expect(unscheduled.ordinal).toBeNull();
	});

	it('counts expenses linked to a dream day on that day, not in Ideas', async () => {
		freshDb();
		const trip = await dreamTrip(2);
		const item = await createItem(trip._id, { title: 'Museum', dayOrdinal: 1 });
		await createExpense(trip._id, {
			description: 'Ticket',
			category: 'activities',
			date: null,
			amountActual: 20,
			linkedType: 'itineraryItem',
			linkedId: item._id
		});
		await createExpense(trip._id, {
			description: 'Insurance',
			category: 'fees',
			amountActual: 5
		});

		const { days, unscheduled } = await tripTimeline(trip._id);
		expect(days[0].subtotal.spent).toBe(20);
		expect(unscheduled.subtotal.spent).toBe(5);
	});

	it('exposes day metadata under dream keys and parses unpadded legacy keys', async () => {
		freshDb();
		const trip = await dreamTrip(2);
		await setDayMeta(trip._id, 'dream-2', { title: 'Old town' });
		await setWeekdayHint(trip._id, 2, 6);

		const day = await getDay(trip._id, 'dream-2');
		expect(day).toMatchObject({ ordinal: 2, title: 'Old town', weekdayHint: 6 });
		expect((await tripTimeline(trip._id)).days[1].weekdayHint).toBe(6);
	});

	it('still builds dated days for a dated trip', async () => {
		freshDb();
		const trip = await datedTrip();
		const { days, unscheduled } = await tripTimeline(trip._id);
		expect(days.map((day) => day.key)).toEqual(['2026-06-01', '2026-06-02']);
		expect(days.map((day) => day.ordinal)).toEqual([1, 2]);
		expect(unscheduled.key).toBe('ideas');
	});
});

describe('placement', () => {
	it('keeps exactly one placement through create, update and moves', async () => {
		freshDb();
		const trip = await dreamTrip(3);

		const item = await createItem(trip._id, {
			title: 'Both',
			date: '2026-01-01',
			dayOrdinal: 2
		});
		expect(item).toMatchObject({ date: null, dayOrdinal: 2 });

		const dated = await update(item._id, { date: '2026-01-03' });
		expect(dated).toMatchObject({ date: '2026-01-03', dayOrdinal: null });

		const ordinal = await update(item._id, { dayOrdinal: 1 });
		expect(ordinal).toMatchObject({ date: null, dayOrdinal: 1 });

		const moved = await moveToOrdinal(item._id, 3, 5);
		expect(moved).toMatchObject({ date: null, dayOrdinal: 3, order: 5 });

		const datedAgain = await moveToDay(item._id, '2026-06-04', 2);
		expect(datedAgain).toMatchObject({ date: '2026-06-04', dayOrdinal: null, order: 2 });

		const toIdeas = await moveToOrdinal(item._id, null, 0);
		expect(toIdeas).toMatchObject({ date: null, dayOrdinal: null });
	});
});

describe('setDreamDayCount', () => {
	it('grows without losing anything and shrinks by moving items to Ideas', async () => {
		freshDb();
		const trip = await dreamTrip(3);
		const kept = await createItem(trip._id, { title: 'Kept', dayOrdinal: 2 });
		const removed = await createItem(trip._id, { title: 'Removed', dayOrdinal: 3 });
		await setWeekdayHint(trip._id, 3, 7);

		const shrunk = await setDreamDayCount(trip._id, 2);
		expect(shrunk.dreamDayCount).toBe(2);
		expect((await getItem(kept._id))?.dayOrdinal).toBe(2);
		expect(await getItem(removed._id)).toMatchObject({ date: null, dayOrdinal: null });
		expect(await getDoc<TripDay>(dreamDayId(trip._id, 3))).toBeNull();
		expect((await tripTimeline(trip._id)).days).toHaveLength(2);

		const grown = await setDreamDayCount(trip._id, 4);
		expect(grown.dreamDayCount).toBe(4);
		const { days } = await tripTimeline(trip._id);
		expect(days).toHaveLength(4);
		expect(days[3].allDay).toHaveLength(0);
		expect(days[3].timed).toHaveLength(0);
	});

	it('refuses a dated trip', async () => {
		freshDb();
		const trip = await datedTrip();
		await expect(setDreamDayCount(trip._id, 4)).rejects.toThrow(/not a dream plan/);
	});
});

describe('duplicate', () => {
	it('copies a dream plan as a dream plan', async () => {
		freshDb();
		const trip = await dreamTrip(2);
		const dayOne = await createItem(trip._id, { title: 'One', dayOrdinal: 1 });
		const dayTwo = await createItem(trip._id, { title: 'Two', dayOrdinal: 2 });
		await setDayMeta(trip._id, 'dream-1', { title: 'Arrival' });
		await setWeekdayHint(trip._id, 1, 5);

		const copy = await duplicate(trip._id);

		expect(copy).toMatchObject({ dateMode: 'dream', dreamDayCount: 2 });
		expect(copy.startDate).toBeUndefined();
		expect(copy.endDate).toBeUndefined();

		const { days } = await tripTimeline(copy._id);
		expect(days.map((day) => day.key)).toEqual(['dream-1', 'dream-2']);
		expect(days[0].timed[0].item?.title).toBe('One');
		expect(days[0].timed[0].item?._id).not.toBe(dayOne._id);
		expect(days[1].timed[0].item?._id).not.toBe(dayTwo._id);
		expect(days[0].day).toMatchObject({ ordinal: 1, title: 'Arrival', weekdayHint: 5 });
	});

	it('turns a dream plan into a dated copy when a start date is chosen', async () => {
		freshDb();
		const trip = await dreamTrip(2);
		await createItem(trip._id, { title: 'One', dayOrdinal: 1 });
		await createItem(trip._id, { title: 'Two', dayOrdinal: 2 });
		await setDayMeta(trip._id, 'dream-2', { title: 'Late' });

		const copy = await duplicate(trip._id, { newStartDate: '2026-07-01' });

		expect(copy).toMatchObject({
			dateMode: 'dated',
			startDate: '2026-07-01',
			endDate: '2026-07-02'
		});
		expect(copy.dreamDayCount).toBeUndefined();

		const { days } = await tripTimeline(copy._id);
		expect(days.map((day) => day.key)).toEqual(['2026-07-01', '2026-07-02']);
		expect(days[0].timed[0].item).toMatchObject({ title: 'One', date: '2026-07-01' });
		expect(days[1].timed[0].item).toMatchObject({ title: 'Two', date: '2026-07-02' });
		expect(days[1].day).toMatchObject({ date: '2026-07-02', title: 'Late' });
		expect(days[0].kind).toBe('dated');
	});
});
