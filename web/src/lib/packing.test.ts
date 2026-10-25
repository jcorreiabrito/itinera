/**
 * Unit tests for `$lib/packing.ts` – the trip-specific packing list.
 *
 * The generator is pure: dates, destinations, travellers, tags and an optional
 * forecast are passed in, so every rule is pinned down without a clock, a
 * network call or the i18n store.
 */

import { describe, expect, it } from 'vitest';
import { CHECKLIST_PRESET_GROUPS } from './db/constants';
import type { Destination } from './db/schemas';
import { packingEn, packingPt } from './locales/features/packing';
import {
	generatePackingList,
	groupPackingSuggestions,
	isSuggestionOnChecklist,
	type PackingInput,
	type PackingSuggestion,
	type PackingTitleKey,
	type PackingTrip
} from './packing';
import type { WeatherForecast } from './utils/weather';

function trip(overrides: Partial<PackingTrip> = {}): PackingTrip {
	return {
		startDate: '2026-07-01',
		endDate: '2026-07-06',
		destinations: [],
		travelerCount: 1,
		tags: [],
		...overrides
	};
}

function input(overrides: Partial<PackingInput> = {}): PackingInput {
	return { trip: trip(), existing: [], ...overrides };
}

function byTitle(
	suggestions: readonly PackingSuggestion[],
	titleKey: PackingTitleKey
): PackingSuggestion | undefined {
	return suggestions.find((suggestion) => suggestion.titleKey === titleKey);
}

function destination(name: string, country: string): Destination {
	return { name, country };
}

function forecast(
	days: Array<{ date: string; max: number; min: number; description?: string }>
): WeatherForecast {
	return {
		latitude: 0,
		longitude: 0,
		updatedAt: '2026-01-01T00:00:00.000Z',
		days: Object.fromEntries(
			days.map((day) => [
				day.date,
				{
					date: day.date,
					maxTemp: day.max,
					minTemp: day.min,
					icon: '',
					description: day.description ?? 'Clear sky'
				}
			])
		)
	};
}

function tripForecast(start: string, end: string, max: number, min: number, description?: string) {
	const dates: string[] = [];
	const cursor = new Date(`${start}T00:00:00Z`);
	const last = new Date(`${end}T00:00:00Z`);
	while (cursor <= last) {
		dates.push(cursor.toISOString().slice(0, 10));
		cursor.setUTCDate(cursor.getUTCDate() + 1);
	}
	return forecast(dates.map((date) => ({ date, max, min, description })));
}

describe('generatePackingList', () => {
	it('bands clothing quantities by trip length', () => {
		const cases = [
			{ endDate: '2026-07-04', quantity: 2, reason: 'packing_reason_length_short' },
			{ endDate: '2026-07-05', quantity: 4, reason: 'packing_reason_length_medium' },
			{ endDate: '2026-07-08', quantity: 4, reason: 'packing_reason_length_medium' },
			{ endDate: '2026-07-09', quantity: 6, reason: 'packing_reason_length_long' }
		] as const;

		for (const testCase of cases) {
			const suggestions = generatePackingList(input({ trip: trip({ endDate: testCase.endDate }) }));
			const tshirts = byTitle(suggestions, 'packing_item_tshirts');
			expect(tshirts?.quantity, testCase.endDate).toBe(testCase.quantity);
			expect(tshirts?.reasonKey, testCase.endDate).toBe(testCase.reason);
		}
	});

	it('derives the season from the month and reverses it in the southern hemisphere', () => {
		const julyFrance = generatePackingList(
			input({ trip: trip({ destinations: [destination('Paris', 'France')] }) })
		);
		expect(byTitle(julyFrance, 'packing_item_sun_hat')?.reasonKey).toBe('packing_reason_summer');
		expect(byTitle(julyFrance, 'packing_item_warm_coat')).toBeUndefined();

		const januaryFrance = generatePackingList(
			input({
				trip: trip({
					startDate: '2026-01-10',
					endDate: '2026-01-15',
					destinations: [destination('Paris', 'France')]
				})
			})
		);
		expect(byTitle(januaryFrance, 'packing_item_warm_coat')?.reasonKey).toBe(
			'packing_reason_winter'
		);
		expect(byTitle(januaryFrance, 'packing_item_sun_hat')).toBeUndefined();

		const januaryAustralia = generatePackingList(
			input({
				trip: trip({
					startDate: '2026-01-10',
					endDate: '2026-01-15',
					destinations: [destination('Sydney', 'Australia')]
				})
			})
		);
		expect(byTitle(januaryAustralia, 'packing_item_sun_hat')?.reasonKey).toBe(
			'packing_reason_summer'
		);
		expect(byTitle(januaryAustralia, 'packing_item_warm_coat')).toBeUndefined();
	});

	it('takes climate hints only from the country the trip stores', () => {
		const tropical = generatePackingList(
			input({ trip: trip({ destinations: [destination('Rio', 'Brazil')] }) })
		);
		expect(byTitle(tropical, 'packing_item_insect_repellent')?.reasonKey).toBe(
			'packing_reason_tropical'
		);
		expect(byTitle(tropical, 'packing_item_sunscreen')?.reasonKey).toBe('packing_reason_tropical');
		// Southern-hemisphere July would otherwise be winter; the tropics stay warm.
		expect(byTitle(tropical, 'packing_item_warm_coat')).toBeUndefined();

		const cold = generatePackingList(
			input({ trip: trip({ destinations: [destination('Reykjavik', 'Iceland')] }) })
		);
		expect(byTitle(cold, 'packing_item_warm_coat')?.reasonKey).toBe('packing_reason_cold_climate');

		const unknown = generatePackingList(
			input({ trip: trip({ destinations: [destination('Camelot', 'Narnia')] }) })
		);
		expect(byTitle(unknown, 'packing_item_insect_repellent')).toBeUndefined();
		expect(byTitle(unknown, 'packing_item_warm_coat')).toBeUndefined();
	});

	it('accepts ISO codes and folded Portuguese country names', () => {
		const byIsoCode = generatePackingList(
			input({ trip: trip({ destinations: [destination('Rio', 'BR')] }) })
		);
		expect(byTitle(byIsoCode, 'packing_item_insect_repellent')).toBeDefined();

		const byPortugueseName = generatePackingList(
			input({ trip: trip({ destinations: [destination('Rio', 'Brasil')] }) })
		);
		expect(byTitle(byPortugueseName, 'packing_item_insect_repellent')).toBeDefined();

		const accented = generatePackingList(
			input({
				trip: trip({
					startDate: '2026-01-10',
					endDate: '2026-01-15',
					destinations: [destination('Sydney', 'Austrália')]
				})
			})
		);
		expect(byTitle(accented, 'packing_item_sun_hat')?.reasonKey).toBe('packing_reason_summer');
	});

	it('multiplies toiletries by the number of travellers', () => {
		const suggestions = generatePackingList(input({ trip: trip({ travelerCount: 3 }) }));
		for (const key of [
			'packing_item_toothbrush',
			'packing_item_shampoo',
			'packing_item_hand_sanitiser',
			'packing_item_sunscreen'
		] as const) {
			expect(byTitle(suggestions, key)?.quantity, key).toBe(3);
		}

		const single = generatePackingList(input({ trip: trip({ travelerCount: 0 }) }));
		expect(byTitle(single, 'packing_item_toothbrush')?.quantity).toBe(1);
	});

	it('excludes items already on the checklist in either language', () => {
		const suggestions = generatePackingList(
			input({
				trip: trip(),
				existing: [{ text: 'Sunscreen' }, { text: packingPt.packing_item_tshirts }]
			})
		);
		expect(byTitle(suggestions, 'packing_item_sunscreen')).toBeUndefined();
		expect(byTitle(suggestions, 'packing_item_tshirts')).toBeUndefined();
	});

	it('uses a supplied forecast for heat, cold and rain hints', () => {
		const springTrip = trip({
			startDate: '2026-04-10',
			endDate: '2026-04-14',
			destinations: [destination('Lisbon', 'Portugal')]
		});
		const hot = generatePackingList(
			input({
				trip: springTrip,
				forecast: tripForecast('2026-04-10', '2026-04-14', 30, 20)
			})
		);
		expect(byTitle(hot, 'packing_item_sun_hat')?.reasonKey).toBe('packing_reason_forecast_hot');
		expect(byTitle(hot, 'packing_item_sunscreen')?.quantity).toBe(1);

		const cold = generatePackingList(
			input({
				trip: springTrip,
				forecast: tripForecast('2026-04-10', '2026-04-14', 4, -2)
			})
		);
		expect(byTitle(cold, 'packing_item_warm_coat')?.reasonKey).toBe('packing_reason_forecast_cold');
		expect(byTitle(cold, 'packing_item_thermal_layers')?.quantity).toBe(2);

		const wet = generatePackingList(
			input({
				trip: trip(),
				forecast: tripForecast('2026-07-01', '2026-07-06', 18, 12, 'Moderate rain')
			})
		);
		expect(byTitle(wet, 'packing_item_rain_jacket')?.reasonKey).toBe('packing_reason_forecast_wet');
	});

	it('ignores forecast days outside the trip and a missing forecast', () => {
		const july = generatePackingList(input({ trip: trip() }));
		expect(byTitle(july, 'packing_item_rain_jacket')).toBeUndefined();

		const outOfRange = generatePackingList(
			input({
				trip: trip(),
				forecast: tripForecast('2026-12-01', '2026-12-03', 18, 12, 'Heavy rain')
			})
		);
		expect(byTitle(outOfRange, 'packing_item_rain_jacket')).toBeUndefined();
	});

	it('adds trip-type extras from tags', () => {
		const beach = generatePackingList(input({ trip: trip({ tags: ['Beach'] }) }));
		expect(byTitle(beach, 'packing_item_flip_flops')?.reasonKey).toBe('packing_reason_beach');
		expect(byTitle(beach, 'packing_item_beach_towel')).toBeDefined();
		expect(byTitle(beach, 'packing_item_waterproof_pouch')?.checkedByDefault).toBe(false);

		const hiking = generatePackingList(input({ trip: trip({ tags: ['#hiking'] }) }));
		expect(byTitle(hiking, 'packing_item_hiking_boots')?.reasonKey).toBe('packing_reason_hiking');
		expect(byTitle(hiking, 'packing_item_water_bottle')).toBeDefined();
		expect(byTitle(hiking, 'packing_item_headlamp')?.checkedByDefault).toBe(false);

		const business = generatePackingList(input({ trip: trip({ tags: ['business trip'] }) }));
		expect(byTitle(business, 'packing_item_formal_outfit')?.reasonKey).toBe(
			'packing_reason_business'
		);
		expect(byTitle(business, 'packing_item_laptop_charger')).toBeDefined();
		expect(byTitle(business, 'packing_item_business_cards')?.checkedByDefault).toBe(false);

		const unrelated = generatePackingList(input({ trip: trip({ tags: ['city', 'culture'] }) }));
		expect(byTitle(unrelated, 'packing_item_flip_flops')).toBeUndefined();
	});

	it('never repeats a suggestion and always uses a preset group', () => {
		const suggestions = generatePackingList(
			input({
				trip: trip({ endDate: '2026-07-15', tags: ['beach', 'hiking', 'business'] })
			})
		);
		const keys = suggestions.map((suggestion) => suggestion.titleKey);
		expect(new Set(keys).size).toBe(keys.length);
		for (const suggestion of suggestions) {
			expect(CHECKLIST_PRESET_GROUPS).toContain(suggestion.groupKey);
		}
	});

	it('orders suggestions by the preset group order', () => {
		const suggestions = generatePackingList(
			input({ trip: trip({ endDate: '2026-07-15', tags: ['beach', 'hiking', 'business'] }) })
		);
		const ranks = suggestions.map((suggestion) =>
			CHECKLIST_PRESET_GROUPS.indexOf(suggestion.groupKey)
		);
		expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
	});

	it('groups suggestions without losing or reordering any', () => {
		const suggestions = generatePackingList(
			input({ trip: trip({ endDate: '2026-07-15', tags: ['beach'] }) })
		);
		const groups = groupPackingSuggestions(suggestions);

		expect(groups.flatMap((group) => group.suggestions)).toEqual(suggestions);
		expect(groups.every((group) => group.suggestions.length > 0)).toBe(true);
		const ranks = groups.map((group) => CHECKLIST_PRESET_GROUPS.indexOf(group.groupKey));
		expect(ranks).toEqual([...ranks].sort((a, b) => a - b));
	});

	it('marks optional extras as unticked and essentials as ticked', () => {
		const longTrip = generatePackingList(input({ trip: trip({ endDate: '2026-07-15' }) }));
		expect(byTitle(longTrip, 'packing_item_passport')?.checkedByDefault).toBe(true);
		expect(byTitle(longTrip, 'packing_item_local_cash')?.checkedByDefault).toBe(false);
		expect(byTitle(longTrip, 'packing_item_packing_cubes')?.checkedByDefault).toBe(false);

		const shortTrip = generatePackingList(input({ trip: trip({ endDate: '2026-07-03' }) }));
		expect(byTitle(shortTrip, 'packing_item_travel_toiletries')?.checkedByDefault).toBe(false);
	});

	it('still suggests the essentials on a trip without dates', () => {
		const suggestions = generatePackingList(input({ trip: { travelerCount: 1 } }));
		expect(byTitle(suggestions, 'packing_item_passport')).toBeDefined();
		expect(byTitle(suggestions, 'packing_item_bag')).toBeDefined();
		expect(byTitle(suggestions, 'packing_item_tshirts')).toBeUndefined();
		expect(byTitle(suggestions, 'packing_item_travel_toiletries')).toBeUndefined();
	});

	it('treats a reversed date range as no range', () => {
		const suggestions = generatePackingList(
			input({ trip: trip({ startDate: '2026-07-10', endDate: '2026-07-01' }) })
		);
		expect(byTitle(suggestions, 'packing_item_tshirts')).toBeUndefined();
	});
});

describe('isSuggestionOnChecklist', () => {
	const suggestions = generatePackingList(input());
	const sunscreen = byTitle(suggestions, 'packing_item_sunscreen');

	it('matches an English item ignoring case and whitespace', () => {
		expect(sunscreen).toBeDefined();
		expect(isSuggestionOnChecklist(sunscreen!, [{ text: '  SUNSCREEN  ' }])).toBe(true);
	});

	it('matches the Portuguese wording of the same item', () => {
		expect(isSuggestionOnChecklist(sunscreen!, [{ text: packingPt.packing_item_sunscreen }])).toBe(
			true
		);
	});

	it('does not match a different item', () => {
		expect(isSuggestionOnChecklist(sunscreen!, [{ text: 'Sunglasses' }])).toBe(false);
	});

	it('has both translations for every title key', () => {
		for (const key of Object.keys(packingEn) as Array<keyof typeof packingEn>) {
			expect(packingPt[key], key).toBeTruthy();
		}
	});
});
