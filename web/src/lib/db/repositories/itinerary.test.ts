import { describe, expect, it } from 'vitest';
import PouchDB from 'pouchdb-browser';
import memory from 'pouchdb-adapter-memory';
import { configureDb } from '../pouch';
import { create as createTrip } from './trips';
import { create as createExpense } from './expenses';
import { create as createItem, tripTimeline } from './itinerary';

/**
 * The day timeline against a real (in-memory) PouchDB.
 *
 * The pure lane helpers have their own test; what this file pins is the join:
 * a trip's dates produce days, each day carries its own items, and — the reason
 * it exists — the day's money subtotal is computed with the same rules as the
 * Costs page and the PDF. A "120 per person" dinner for four must read 480
 * under the day, not 120.
 */

PouchDB.plugin(memory as never);

let counter = 0;

function freshDb(): void {
	counter += 1;
	configureDb({
		PouchImpl: PouchDB as never,
		adapter: 'memory',
		name: `itinera-itinerary-test-${counter}`
	});
}

function makeTrip(travelerCount = 1) {
	return createTrip({
		title: 'Test trip',
		startDate: '2026-06-01',
		endDate: '2026-06-02',
		homeCurrency: 'EUR',
		primaryTimezone: 'Europe/Lisbon',
		travelerCount
	});
}

describe('tripTimeline', () => {
	it('builds one day per trip date, inclusive', async () => {
		freshDb();
		const trip = await makeTrip();
		const { days } = await tripTimeline(trip._id);
		expect(days.map((day) => day.date)).toEqual(['2026-06-01', '2026-06-02']);
	});

	it('applies the per-person multiplier to a day subtotal', async () => {
		freshDb();
		const trip = await makeTrip(4);
		await createExpense(trip._id, {
			description: 'Dinner',
			category: 'food',
			date: '2026-06-01',
			amountActual: 120,
			currency: 'EUR',
			costType: 'per_person'
		});

		const { days } = await tripTimeline(trip._id);
		expect(days[0].subtotal.spent).toBe(480);
	});

	it('accumulates only the expenses dated to that day', async () => {
		freshDb();
		const trip = await makeTrip();
		await createExpense(trip._id, {
			description: 'Lunch',
			category: 'food',
			date: '2026-06-01',
			amountActual: 20,
			currency: 'EUR'
		});
		await createExpense(trip._id, {
			description: 'Museum',
			category: 'activities',
			date: '2026-06-02',
			amountActual: 30,
			currency: 'EUR'
		});

		const { days } = await tripTimeline(trip._id);
		expect(days[0].subtotal.spent).toBe(20);
		expect(days[1].subtotal.spent).toBe(30);
	});

	it('counts a foreign expense with no rate instead of summing it', async () => {
		freshDb();
		const trip = await makeTrip();
		await createExpense(trip._id, {
			description: 'Taxi',
			category: 'transport',
			date: '2026-06-01',
			amountActual: 40,
			currency: 'USD'
		});

		const { days } = await tripTimeline(trip._id);
		expect(days[0].subtotal.spent).toBe(0);
		expect(days[0].subtotal.missingRateCount).toBe(1);
	});

	it('reports undated expenses in the unscheduled bucket', async () => {
		freshDb();
		const trip = await makeTrip(2);
		await createExpense(trip._id, {
			description: 'Travel insurance',
			category: 'fees',
			amountActual: 30,
			currency: 'EUR',
			costType: 'per_person'
		});

		const { days, unscheduled } = await tripTimeline(trip._id);
		expect(unscheduled.subtotal.spent).toBe(60);
		expect(days[0].subtotal.spent).toBe(0);
	});

	it('places items on their day and leaves undated ones unscheduled', async () => {
		freshDb();
		const trip = await makeTrip();
		await createItem(trip._id, {
			title: 'Castle',
			date: '2026-06-01',
			allDay: true,
			category: 'sightseeing'
		});
		await createItem(trip._id, {
			title: 'Maybe the beach',
			allDay: true,
			category: 'sightseeing'
		});

		const { days, unscheduled } = await tripTimeline(trip._id);
		expect(days[0].allDay.map((item) => item.title)).toEqual(['Castle']);
		expect(unscheduled.allDay.map((item) => item.title)).toEqual(['Maybe the beach']);
	});
});
