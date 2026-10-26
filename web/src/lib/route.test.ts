import { describe, expect, it } from 'vitest';
import {
	haversineKm,
	optimiseDayRoute,
	WALKING_KM_PER_HOUR,
	type LocatedRouteStop,
	type RouteStop
} from './route';

const at = (id: string, lng: number, lat = 0): LocatedRouteStop => ({ id, lat, lng });

describe('haversineKm', () => {
	it('measures a degree of longitude at the equator', () => {
		const distance = haversineKm(at('a', 0), at('b', 1));
		expect(distance).toBeCloseTo(111.2, 1);
	});
});

describe('optimiseDayRoute', () => {
	it('reorders a backtracking day and prices the saving', () => {
		// The traveller wrote a zigzag: A -> B (2°) -> C (0.2°) -> D (3°).
		const stops = [at('a', 0), at('b', 2), at('c', 0.2), at('d', 3)];

		const plan = optimiseDayRoute(stops);

		expect(plan.order).toEqual(['a', 'c', 'b', 'd']);
		expect(plan.currentKm).toBeGreaterThan(plan.optimisedKm);
		expect(plan.savedKm).toBeCloseTo(plan.currentKm - plan.optimisedKm, 9);
		expect(plan.savedMinutes).toBeCloseTo((plan.savedKm / WALKING_KM_PER_HOUR) * 60, 9);
	});

	it('leaves an already-optimal day alone', () => {
		const stops = [at('a', 0), at('b', 1), at('c', 2), at('d', 3)];

		const plan = optimiseDayRoute(stops);

		expect(plan.order).toEqual(['a', 'b', 'c', 'd']);
		expect(plan.optimisedKm).toBeCloseTo(plan.currentKm, 9);
		expect(plan.savedKm).toBe(0);
		expect(plan.savedMinutes).toBe(0);
	});

	it('keeps stops without coordinates in their existing slots', () => {
		const stops: RouteStop[] = [at('a', 0), { id: 'b' }, at('c', 2), at('d', 0.2), { id: 'e' }];

		const plan = optimiseDayRoute(stops);

		expect(plan.order).toEqual(['a', 'b', 'd', 'c', 'e']);
		expect(plan.order[1]).toBe('b');
		expect(plan.order[4]).toBe('e');
		expect(plan.savedKm).toBeGreaterThan(0);
	});

	it('returns everything unchanged with fewer than two located stops', () => {
		const stops: RouteStop[] = [at('a', 0), { id: 'b' }, { id: 'c' }];

		const plan = optimiseDayRoute(stops);

		expect(plan.order).toEqual(['a', 'b', 'c']);
		expect(plan.currentKm).toBe(0);
		expect(plan.optimisedKm).toBe(0);
		expect(plan.savedKm).toBe(0);
		expect(plan.savedMinutes).toBe(0);
	});

	it('does not churn identical coordinates', () => {
		const stops: RouteStop[] = [at('a', 0), at('b', 0), at('c', 0)];

		const plan = optimiseDayRoute(stops);

		expect(plan.order).toEqual(['a', 'b', 'c']);
		expect(plan.currentKm).toBe(0);
		expect(plan.optimisedKm).toBe(0);
		expect(plan.savedKm).toBe(0);
		expect(plan.savedMinutes).toBe(0);
	});
});
