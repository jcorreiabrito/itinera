/**
 * Editing a dream plan as JSON.
 *
 * The downloaded template is the user's contract with the outside world: it
 * must round-trip without noise, and an edited copy must change the plan
 * without losing what the template does not show — locations, links, costs.
 * These tests exercise the format against a real (in-memory) PouchDB.
 */

import { describe, expect, it } from 'vitest';
import PouchDB from 'pouchdb-browser';
import memory from 'pouchdb-adapter-memory';
import { getDoc } from './base';
import { configureDb } from './pouch';
import { dreamDayId } from './ids';
import {
	dreamTemplateForTrip,
	parseDreamTemplate,
	prepareDreamTemplateDiff,
	type DreamTemplatePayload
} from './dream-template';
import type { TripDay } from './schemas';
import {
	create as createItem,
	get as getItem,
	setDayMeta,
	setWeekdayHint
} from './repositories/itinerary';
import { create as createTrip, get as getTrip } from './repositories/trips';

PouchDB.plugin(memory as never);

let counter = 0;

function freshDb(): void {
	counter += 1;
	configureDb({
		PouchImpl: PouchDB as never,
		adapter: 'memory',
		name: `itinera-dream-template-test-${counter}`
	});
}

function makeDreamTrip(dayCount = 3) {
	return createTrip({
		title: 'Japan someday',
		homeCurrency: 'EUR',
		dateMode: 'dream',
		dreamDayCount: dayCount
	});
}

/** A copy safe to edit the way a person would edit the downloaded file. */
function editable(payload: DreamTemplatePayload): DreamTemplatePayload {
	return JSON.parse(JSON.stringify(payload)) as DreamTemplatePayload;
}

describe('buildDreamTemplate', () => {
	it('exposes the numbered days, their wishes and their items', async () => {
		freshDb();
		const trip = await makeDreamTrip(3);
		const allDay = await createItem(trip._id, {
			title: 'Ryokan',
			dayOrdinal: 2,
			allDay: true,
			category: 'lodging',
			order: 1
		});
		const museum = await createItem(trip._id, {
			title: 'Museum',
			dayOrdinal: 2,
			startTime: '10:00',
			endTime: '12:00',
			category: 'sightseeing',
			order: 0
		});
		const stray = await createItem(trip._id, { title: 'Maybe Kyoto', category: 'other' });
		await setDayMeta(trip._id, 'dream-2', { title: 'Old town', notes: 'Early start' });
		await setWeekdayHint(trip._id, 2, 6);

		const payload = await dreamTemplateForTrip(trip._id);

		expect(payload.schema).toBe('itinera.dream-plan');
		expect(payload.days.map((day) => day.day)).toEqual([1, 2, 3]);
		expect(payload.days[1].title).toBe('Old town');
		expect(payload.days[1].notes).toBe('Early start');
		expect(payload.days[1].weekdayHint).toBe('sat');
		// The all-day lane is listed first; each lane keeps its stored order.
		expect(payload.days[1].items.map((item) => item.id)).toEqual([allDay._id, museum._id]);
		expect(payload.days[1].items[1]).toMatchObject({
			title: 'Museum',
			startTime: '10:00',
			endTime: '12:00',
			category: 'sightseeing'
		});
		expect(payload.ideas).toHaveLength(1);
		expect(payload.ideas[0].id).toBe(stray._id);
	});

	it('refuses a dated trip', async () => {
		freshDb();
		const trip = await createTrip({
			title: 'Dated',
			startDate: '2026-06-01',
			endDate: '2026-06-03',
			homeCurrency: 'EUR'
		});
		await expect(dreamTemplateForTrip(trip._id)).rejects.toThrow(/not a dream plan/);
	});
});

describe('prepareDreamTemplateDiff', () => {
	it('is a no-op for an unchanged download', async () => {
		freshDb();
		const trip = await makeDreamTrip(2);
		await createItem(trip._id, { title: 'Museum', dayOrdinal: 1, category: 'sightseeing' });
		await createItem(trip._id, { title: 'Idea', category: 'other' });

		const payload = await dreamTemplateForTrip(trip._id);
		const diff = await prepareDreamTemplateDiff(trip._id, payload);

		expect(diff.isNoOp).toBe(true);
		expect(diff.readyToSaveDocs).toHaveLength(0);
		expect(diff.movedToIdeas).toHaveLength(0);
	});

	it('updates in place, creates unknown ids and moves omitted items to Ideas', async () => {
		freshDb();
		const trip = await makeDreamTrip(2);
		const keep = await createItem(trip._id, {
			title: 'Museum',
			dayOrdinal: 1,
			category: 'sightseeing',
			notes: 'Buy tickets',
			location: { name: 'Ueno', lat: 35.7, lng: 139.7 }
		});
		const removed = await createItem(trip._id, { title: 'Rainy day plan', dayOrdinal: 2 });

		const payload = editable(await dreamTemplateForTrip(trip._id));
		payload.trip.title = 'Japan, maybe next spring';
		payload.days[0].items[0].title = 'Tokyo National Museum';
		payload.days[1].items = [];
		payload.days[1].items.push({
			title: 'Night market',
			startTime: '19:00',
			category: 'food'
		});
		payload.ideas.push({ title: 'Day trip to Nara' });

		const diff = await prepareDreamTemplateDiff(trip._id, payload);
		expect(diff.added).toHaveLength(2);
		expect(diff.updated).toHaveLength(2); // the item and the trip title
		expect(diff.movedToIdeas).toHaveLength(1);

		await diff.apply?.();

		const renamed = await getItem(keep._id);
		expect(renamed?.title).toBe('Tokyo National Museum');
		// Fields the template does not show survive an edit.
		expect(renamed?.notes).toBe('Buy tickets');
		expect(renamed?.location).toMatchObject({ name: 'Ueno', lat: 35.7, lng: 139.7 });

		const moved = await getItem(removed._id);
		expect(moved?.date).toBeNull();
		expect(moved?.dayOrdinal).toBeNull();

		const items = await dreamTemplateForTrip(trip._id);
		expect(items.trip.title).toBe('Japan, maybe next spring');
		expect(items.days[1].items.map((item) => item.title)).toEqual(['Night market']);
		expect(items.ideas.map((item) => item.title).sort()).toEqual([
			'Day trip to Nara',
			'Rainy day plan'
		]);
	});

	it('writes day metadata, shrinks the plan and purges removed day docs', async () => {
		freshDb();
		const trip = await makeDreamTrip(3);
		const onDay3 = await createItem(trip._id, { title: 'Last day', dayOrdinal: 3 });
		await setWeekdayHint(trip._id, 3, 7);

		const payload = editable(await dreamTemplateForTrip(trip._id));
		payload.days = payload.days.slice(0, 2);
		payload.days[0].title = 'Arrival';
		payload.days[0].notes = 'Late flight';
		payload.days[0].weekdayHint = 'Friday';

		const diff = await prepareDreamTemplateDiff(trip._id, payload);
		expect(diff.purgeIds).toContain(dreamDayId(trip._id, 3));
		expect(diff.movedToIdeas?.map((doc) => doc._id)).toContain(onDay3._id);

		await diff.apply?.();

		const updatedTrip = await getTrip(trip._id);
		expect(updatedTrip?.dreamDayCount).toBe(2);
		expect(updatedTrip?.dateMode).toBe('dream');
		expect((await getItem(onDay3._id))?.dayOrdinal).toBeNull();

		const day1 = await getDoc<TripDay>(dreamDayId(trip._id, 1));
		expect(day1).toMatchObject({
			ordinal: 1,
			title: 'Arrival',
			notes: 'Late flight',
			weekdayHint: 5
		});
		expect(await getDoc<TripDay>(dreamDayId(trip._id, 3))).toBeNull();
	});

	it('accepts weekday hints as names or numbers, in any day order', () => {
		const payload = {
			schema: 'itinera.dream-plan',
			version: 1,
			trip: { title: 'Loop' },
			days: [
				{ day: 2, weekdayHint: 1, items: [] },
				{ day: 1, weekdayHint: 'saturday', items: [] }
			],
			ideas: [{ title: 'Someday', date: '2027-01-02' }]
		};

		const parsed = parseDreamTemplate(payload);
		expect(parsed.days.map((day) => day.day)).toEqual([1, 2]);
		expect(parsed.days[0].weekdayHint).toBe(6);
		expect(parsed.days[1].weekdayHint).toBe(1);
		expect(parsed.ideas[0].date).toBe('2027-01-02');
	});

	it('rejects an invalid template', () => {
		const base = {
			schema: 'itinera.dream-plan',
			version: 1,
			trip: { title: 'Loop' },
			days: [{ day: 1, items: [] }],
			ideas: []
		};

		expect(() => parseDreamTemplate({ ...base, schema: 'itinera.trip-export' })).toThrow(
			/expected schema/
		);
		expect(() =>
			parseDreamTemplate({
				...base,
				days: [
					{ day: 1, items: [] },
					{ day: 3, items: [] }
				]
			})
		).toThrow(/without gaps/);
		expect(() =>
			parseDreamTemplate({
				...base,
				days: [{ day: 1, items: [{ title: 'X', category: 'shopping' }] }]
			})
		).toThrow(/category must be one of/);
		expect(() =>
			parseDreamTemplate({ ...base, days: [{ day: 1, items: [{ title: '' }] }] })
		).toThrow(/title is required/);
		expect(() =>
			parseDreamTemplate({ ...base, days: [{ day: 1, weekdayHint: 'funday', items: [] }] })
		).toThrow(/weekdayHint/);
		expect(() => parseDreamTemplate({ ...base, days: [] })).toThrow(/at least one day/);
	});

	it('rejects a dated trip, duplicate ids and ids from another trip', async () => {
		freshDb();
		const dated = await createTrip({
			title: 'Dated',
			startDate: '2026-06-01',
			endDate: '2026-06-02',
			homeCurrency: 'EUR'
		});
		const payload = {
			schema: 'itinera.dream-plan',
			version: 1,
			days: [{ day: 1, items: [] }],
			ideas: []
		};
		await expect(prepareDreamTemplateDiff(dated._id, payload)).rejects.toThrow(/dream plan/);

		const dream = await makeDreamTrip(1);
		const item = await createItem(dream._id, { title: 'Museum', dayOrdinal: 1 });
		const duplicate = {
			...payload,
			days: [
				{
					day: 1,
					items: [
						{ id: item._id, title: 'A' },
						{ id: item._id, title: 'B' }
					]
				}
			]
		};
		await expect(prepareDreamTemplateDiff(dream._id, duplicate)).rejects.toThrow(/appears twice/);

		const foreign = {
			...payload,
			days: [{ day: 1, items: [{ id: 'itin:OTHER:xyz', title: 'Elsewhere' }] }]
		};
		await expect(prepareDreamTemplateDiff(dream._id, foreign)).rejects.toThrow(/another trip/);
	});
});
