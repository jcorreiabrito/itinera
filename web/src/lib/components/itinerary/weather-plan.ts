/**
 * Which items a wet day may move, and which nearby day is driest.
 *
 * The rules live outside the component so "what counts as outdoor" has one
 * tested answer. They are deliberately conservative: a suggestion that moves a
 * booked dinner to a different day costs the traveller more than the rain it
 * avoids.
 */
import type { ItineraryCategory, ItineraryItem } from '$lib/db';
import type { DayWeather } from '$lib/utils/weather';

/**
 * Categories that are plausibly outdoors.
 *
 * Sightseeing and activities are the two the user chooses when the plan is the
 * weather. Food stays put because a restaurant may be the indoor plan for a wet
 * day; transport, lodging and "other" are fixed by bookings far more often than
 * by appetite. Free time is left alone for the same reason: it is the slot the
 * traveller fills on the day itself.
 */
const OUTDOOR_CATEGORIES: ReadonlySet<ItineraryCategory> = new Set(['sightseeing', 'activity']);

/**
 * Whether an item can be moved purely for weather.
 *
 * Timed items are excluded even when their category is outdoor — a time is the
 * strongest signal that something was booked, and a linked flight or reservation
 * says so outright.
 */
export function isOutdoorEligible(item: ItineraryItem): boolean {
	if (!item.category || !OUTDOOR_CATEGORIES.has(item.category)) return false;
	if (item.startTime) return false;
	if (item.linkedFlightId || item.linkedReservationId) return false;
	return true;
}

/** The outdoor items on a day, in the order the day shows them. */
export function moveableOutdoorItems(items: readonly ItineraryItem[]): ItineraryItem[] {
	return items.filter(isOutdoorEligible);
}

/** A nearby day that is forecast to be drier, with the chance it was ranked by. */
export interface DriestTarget {
	date: string;
	weather: DayWeather;
	/** Precipitation probability, percent. */
	chance: number;
}

export interface DriestPlan {
	/** The selected day's forecast, if one exists. */
	current: DayWeather | null;
	/** The driest nearby day, only when it is strictly drier than `current`. */
	target: DriestTarget | null;
}

function chanceOf(weather: DayWeather | null | undefined): number | null {
	const chance = weather?.precipitationProbability;
	return typeof chance === 'number' && Number.isFinite(chance) ? chance : null;
}

/**
 * Rank the candidate days by precipitation probability.
 *
 * A day needs a probability to take part: an older cached forecast has none,
 * and inventing a zero from a missing field would send a sunny trip's plans into
 * the rain. A target must be strictly drier — an equal day is not worth moving.
 */
export function planDriestDay(
	currentDate: string,
	candidates: readonly string[],
	weatherByDate: Readonly<Record<string, DayWeather>>
): DriestPlan {
	const current = weatherByDate[currentDate] ?? null;
	const currentChance = chanceOf(current);
	if (currentChance == null) return { current, target: null };

	let target: DriestTarget | null = null;
	let lowest = currentChance;

	for (const date of candidates) {
		if (date === currentDate) continue;
		const weather = weatherByDate[date];
		const chance = chanceOf(weather);
		if (chance == null || chance >= lowest) continue;
		target = { date, weather, chance };
		lowest = chance;
	}

	return { current, target };
}
