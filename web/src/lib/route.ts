/**
 * Offline walking-order optimiser for a day's itinerary items.
 *
 * Distances are great-circle (haversine), not routed streets: the app must not
 * depend on a network service for a suggestion, and within one day's stops the
 * straight line ranks two orders the same way a street route nearly always
 * would. The result is therefore an estimate, not a navigation instruction.
 *
 * `currentKm` and `optimisedKm` measure the located stops only. A stop with no
 * coordinates has no position to measure from, so it keeps its existing slot in
 * the returned order and contributes no distance.
 */

/** One stop in the day's walking order. Coordinates may be absent. */
export interface RouteStop {
	id: string;
	lat?: number | null;
	lng?: number | null;
}

/** A stop `hasCoordinates` has vouched for. */
export interface LocatedRouteStop extends RouteStop {
	lat: number;
	lng: number;
}

/** What the day view renders in its preview, and what it writes on apply. */
export interface RoutePlan {
	/** Every input id, in the proposed walking order. */
	order: string[];
	/** Distance along the located stops in their existing order. */
	currentKm: number;
	/** Distance along the proposed order. */
	optimisedKm: number;
	savedKm: number;
	savedMinutes: number;
}

/** The pace the estimate uses: a relaxed city walk with stops along the way. */
export const WALKING_KM_PER_HOUR = 4.5;

const EARTH_RADIUS_KM = 6371.0088;
const EPSILON_KM = 1e-9;

const toRadians = (degrees: number) => (degrees * Math.PI) / 180;

/** Great-circle distance in kilometres between two located stops. */
export function haversineKm(a: LocatedRouteStop, b: LocatedRouteStop): number {
	const dLat = toRadians(b.lat - a.lat);
	const dLng = toRadians(b.lng - a.lng);
	const h =
		Math.sin(dLat / 2) ** 2 +
		Math.cos(toRadians(a.lat)) * Math.cos(toRadians(b.lat)) * Math.sin(dLng / 2) ** 2;
	return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Whether a stop carries a usable position. `NaN` and `Infinity` do not count. */
export function hasCoordinates(stop: RouteStop): stop is LocatedRouteStop {
	return (
		typeof stop.lat === 'number' &&
		typeof stop.lng === 'number' &&
		Number.isFinite(stop.lat) &&
		Number.isFinite(stop.lng)
	);
}

function routeLength(stops: readonly LocatedRouteStop[]): number {
	let total = 0;
	for (let i = 1; i < stops.length; i++) total += haversineKm(stops[i - 1], stops[i]);
	return total;
}

/**
 * Nearest-neighbour from the first located stop.
 *
 * The first stop anchors the walk: it is where the day starts (the hotel, the
 * first breakfast), so it is not the optimiser's place to move it. Ties keep
 * the existing order, which makes the output stable across renders.
 */
function nearestOrder(stops: readonly LocatedRouteStop[]): LocatedRouteStop[] {
	const visited = new Set<number>([0]);
	const route: LocatedRouteStop[] = [stops[0]];

	while (route.length < stops.length) {
		const last = route[route.length - 1];
		let bestIndex = -1;
		let bestDistance = Infinity;
		for (let i = 0; i < stops.length; i++) {
			if (visited.has(i)) continue;
			const distance = haversineKm(last, stops[i]);
			if (distance < bestDistance) {
				bestDistance = distance;
				bestIndex = i;
			}
		}
		if (bestIndex < 0) break;
		visited.add(bestIndex);
		route.push(stops[bestIndex]);
	}

	return route;
}

/**
 * 2-opt over the open path, with the first stop fixed.
 *
 * Reversing a segment removes the two crossing legs it replaces, which is the
 * common failure of nearest-neighbour. Keeping index 0 fixed is what stops the
 * walk from simply being flipped end-to-end for no gain.
 */
function twoOpt(route: readonly LocatedRouteStop[]): LocatedRouteStop[] {
	const best = [...route];
	if (best.length < 3) return best;

	let improved = true;
	while (improved) {
		improved = false;
		for (let i = 1; i < best.length - 1; i++) {
			for (let j = i + 1; j < best.length; j++) {
				const before =
					haversineKm(best[i - 1], best[i]) +
					(j < best.length - 1 ? haversineKm(best[j], best[j + 1]) : 0);
				const after =
					haversineKm(best[i - 1], best[j]) +
					(j < best.length - 1 ? haversineKm(best[i], best[j + 1]) : 0);
				if (after + EPSILON_KM >= before) continue;

				for (let left = i, right = j; left < right; left++, right--) {
					const swap = best[left];
					best[left] = best[right];
					best[right] = swap;
				}
				improved = true;
			}
		}
	}

	return best;
}

/**
 * The walking order for a day, with items lacking coordinates left where they
 * were.
 *
 * Fewer than two located stops means there is no distance to improve: the
 * original order is returned untouched so callers can use the result as a
 * no-op rather than special-casing it.
 */
export function optimiseDayRoute(stops: readonly RouteStop[]): RoutePlan {
	const located: LocatedRouteStop[] = [];
	const slots: number[] = [];
	const order = stops.map((stop) => stop.id);

	stops.forEach((stop, index) => {
		if (!hasCoordinates(stop)) return;
		located.push(stop);
		slots.push(index);
	});

	const currentKm = routeLength(located);
	if (located.length < 2 || currentKm <= 0) {
		return { order, currentKm, optimisedKm: currentKm, savedKm: 0, savedMinutes: 0 };
	}

	const improved = twoOpt(nearestOrder(located));
	const improvedKm = routeLength(improved);
	// A new order that is not shorter is churn: keep the one the traveller wrote.
	const chosen = improvedKm + EPSILON_KM < currentKm ? improved : located;
	const optimisedKm = chosen === improved ? improvedKm : currentKm;

	// Fill the located slots in place, which is what fixes an unlocated stop to
	// its existing relative position in the day.
	slots.forEach((slot, index) => {
		order[slot] = chosen[index].id;
	});

	const savedKm = Math.max(0, currentKm - optimisedKm);
	return {
		order,
		currentKm,
		optimisedKm,
		savedKm,
		savedMinutes: (savedKm / WALKING_KM_PER_HOUR) * 60
	};
}
