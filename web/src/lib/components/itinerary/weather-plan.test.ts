import { describe, expect, it } from 'vitest';
import type { ItineraryItem } from '$lib/db';
import type { DayWeather } from '$lib/utils/weather';
import { isOutdoorEligible, moveableOutdoorItems, planDriestDay } from './weather-plan';

let seq = 0;

function item(over: Partial<ItineraryItem> = {}): ItineraryItem {
	seq += 1;
	return { _id: `item-${seq}`, type: 'itineraryItem', order: 0, ...over } as ItineraryItem;
}

function weather(date: string, probability?: number): DayWeather {
	const day: DayWeather = {
		date,
		maxTemp: 20,
		minTemp: 10,
		icon: '',
		description: 'Clear sky'
	};
	if (probability != null) day.precipitationProbability = probability;
	return day;
}

describe('isOutdoorEligible', () => {
	it('accepts untimed sightseeing and activities', () => {
		expect(isOutdoorEligible(item({ category: 'sightseeing' }))).toBe(true);
		expect(isOutdoorEligible(item({ category: 'activity', allDay: true }))).toBe(true);
	});

	it('leaves food, transport, lodging and uncategorised items alone', () => {
		for (const category of ['food', 'transport', 'lodging', 'free', 'other'] as const) {
			expect(isOutdoorEligible(item({ category }))).toBe(false);
		}
		expect(isOutdoorEligible(item())).toBe(false);
	});

	it('refuses anything timed or linked to a booking', () => {
		expect(isOutdoorEligible(item({ category: 'sightseeing', startTime: '09:00' }))).toBe(false);
		expect(isOutdoorEligible(item({ category: 'activity', linkedFlightId: 'f1' }))).toBe(false);
		expect(isOutdoorEligible(item({ category: 'activity', linkedReservationId: 'r1' }))).toBe(
			false
		);
	});
});

describe('moveableOutdoorItems', () => {
	it('keeps the day order of the eligible items', () => {
		const first = item({ category: 'sightseeing', title: 'Forum' });
		const second = item({ category: 'food', title: 'Lunch' });
		const third = item({ category: 'activity', title: 'Boat tour' });

		expect(moveableOutdoorItems([first, second, third]).map((entry) => entry._id)).toEqual([
			first._id,
			third._id
		]);
	});
});

describe('planDriestDay', () => {
	const current = '2026-10-25';
	const candidates = ['2026-10-23', '2026-10-24', current, '2026-10-26', '2026-10-27'];

	it('picks the lowest precipitation chance within the window', () => {
		const plan = planDriestDay(current, candidates, {
			'2026-10-23': weather('2026-10-23', 40),
			'2026-10-24': weather('2026-10-24', 25),
			[current]: weather(current, 60),
			'2026-10-26': weather('2026-10-26', 5),
			'2026-10-27': weather('2026-10-27', 20)
		});

		expect(plan.current?.precipitationProbability).toBe(60);
		expect(plan.target?.date).toBe('2026-10-26');
		expect(plan.target?.chance).toBe(5);
	});

	it('offers nothing when no nearby day is strictly drier', () => {
		const plan = planDriestDay(current, candidates, {
			'2026-10-23': weather('2026-10-23', 60),
			'2026-10-24': weather('2026-10-24', 60),
			[current]: weather(current, 60),
			'2026-10-26': weather('2026-10-26', 80),
			'2026-10-27': weather('2026-10-27', 90)
		});

		expect(plan.target).toBeNull();
	});

	it('needs a probability on the current day and ignores candidates without one', () => {
		expect(
			planDriestDay(current, candidates, {
				[current]: weather(current),
				'2026-10-26': weather('2026-10-26', 5)
			}).target
		).toBeNull();

		const plan = planDriestDay(current, candidates, {
			[current]: weather(current, 30),
			'2026-10-26': weather('2026-10-26')
		});
		expect(plan.target).toBeNull();
	});
});
