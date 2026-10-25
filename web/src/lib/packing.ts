/**
 * Packing list generator – a trip-specific list instead of a static template.
 *
 * The rules only read what the app already stores: the trip's dates, traveller
 * count, tags and the destination `country`; plus a forecast the caller already
 * holds. Nothing here touches the network – a missing forecast is simply a
 * missing hint, which is why the function stays pure and unit-testable.
 *
 * Suggestions carry translation keys rather than text, because the checklist
 * itself stores plain strings in whichever language the user added them in.
 * Dedupe therefore compares an existing item against both the English and the
 * Portuguese wording of a suggestion (`isSuggestionOnChecklist`).
 *
 * Group keys are the existing `CHECKLIST_PRESET_GROUPS` values, so a generated
 * item lands in the same group the rest of the checklist UI already knows.
 */

import { CHECKLIST_PRESET_GROUPS } from './db/constants';
import { eachDateInRange, nightsBetween } from './db/datetime';
import type { ChecklistItem, Destination } from './db/schemas';
import { packingEn, packingPt } from './locales/features/packing';
import type { DayWeather, WeatherForecast } from './utils/weather';

/** One of the preset checklist groups every suggestion belongs to. */
export type ChecklistPresetGroup = (typeof CHECKLIST_PRESET_GROUPS)[number];

/** Item names this module can suggest (the `packing_item_*` slice entries). */
export type PackingTitleKey = Extract<keyof typeof packingEn, `packing_item_${string}`>;

/** Explanations this module attaches to a suggestion (`packing_reason_*`). */
export type PackingReasonKey = Extract<keyof typeof packingEn, `packing_reason_${string}`>;

/** How long the trip is, in the three bands quantities are built from. */
export type PackingLengthBand = 'short' | 'medium' | 'long';

/** The season at the destination, after the hemisphere is taken into account. */
export type PackingSeason = 'spring' | 'summer' | 'autumn' | 'winter';

/** The half of the globe the destination country sits in, when we can tell. */
export type PackingHemisphere = 'north' | 'south';

/**
 * The trip fields the rules read. A full `Trip` satisfies this; the fields are
 * optional so a page that has not finished loading can still call the
 * generator without inventing dates.
 */
export interface PackingTrip {
	startDate?: string | null;
	endDate?: string | null;
	destinations?: readonly Destination[] | null;
	travelerCount?: number | null;
	tags?: readonly string[] | null;
}

/** Everything the generator is allowed to look at. */
export interface PackingInput {
	trip: PackingTrip;
	/** The trip's current checklist, used so an existing item is never re-added. */
	existing: readonly Pick<ChecklistItem, 'text'>[];
	/**
	 * A forecast the app already holds (the local cache, normally). Never fetched
	 * here: `null` or an empty map simply means "no weather hint".
	 */
	forecast?: WeatherForecast | null;
}

/** One thing worth packing, with the reason it was suggested. */
export interface PackingSuggestion {
	groupKey: ChecklistPresetGroup;
	titleKey: PackingTitleKey;
	reasonKey: PackingReasonKey;
	/** How many to pack; omitted when a single one is enough. */
	quantity?: number;
	/** Whether the preview starts with this row ticked. */
	checkedByDefault: boolean;
}

/** Suggestions bundled under the preset group they belong to. */
export interface PackingGroup {
	groupKey: ChecklistPresetGroup;
	suggestions: PackingSuggestion[];
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Quantities for the clothing rows, by trip length band. */
const QUANTITY_BY_LENGTH: Record<
	PackingLengthBand,
	{ tshirts: number; underwear: number; socks: number; trousers: number }
> = {
	short: { tshirts: 2, underwear: 3, socks: 3, trousers: 1 },
	medium: { tshirts: 4, underwear: 5, socks: 5, trousers: 2 },
	long: { tshirts: 6, underwear: 8, socks: 8, trousers: 3 }
};

const LENGTH_REASON: Record<PackingLengthBand, PackingReasonKey> = {
	short: 'packing_reason_length_short',
	medium: 'packing_reason_length_medium',
	long: 'packing_reason_length_long'
};

const SEASON_REASON: Record<PackingSeason, PackingReasonKey> = {
	spring: 'packing_reason_spring',
	summer: 'packing_reason_summer',
	autumn: 'packing_reason_autumn',
	winter: 'packing_reason_winter'
};

/**
 * Countries in the southern hemisphere, as ISO-2 codes and normalised names.
 *
 * Only used to flip the season: a July trip to Sydney needs a jacket for the
 * same reason a January trip to Paris does. Names are stored without accents
 * because `normaliseCountry` strips them before lookup.
 */
const SOUTHERN_COUNTRIES = new Set([
	'au',
	'australia',
	'nz',
	'new zealand',
	'nova zelandia',
	'br',
	'brazil',
	'brasil',
	'ar',
	'argentina',
	'cl',
	'chile',
	'pe',
	'peru',
	'uy',
	'uruguay',
	'py',
	'paraguay',
	'bo',
	'bolivia',
	'za',
	'south africa',
	'africa do sul',
	'na',
	'namibia',
	'bw',
	'botswana',
	'zw',
	'zimbabwe',
	'mz',
	'mozambique',
	'mg',
	'madagascar',
	'ao',
	'angola',
	'zm',
	'zambia',
	'tz',
	'tanzania',
	'id',
	'indonesia',
	'tl',
	'timor-leste',
	'east timor',
	'fj',
	'fiji',
	'pg',
	'papua new guinea'
]);

/** Countries where the climate hint is "tropical", not just "summer". */
const TROPICAL_COUNTRIES = new Set([
	'th',
	'thailand',
	'tailandia',
	'vn',
	'vietnam',
	'vietname',
	'id',
	'indonesia',
	'my',
	'malaysia',
	'malasia',
	'sg',
	'singapore',
	'singapura',
	'ph',
	'philippines',
	'filipinas',
	'in',
	'india',
	'lk',
	'sri lanka',
	'kh',
	'cambodia',
	'camboja',
	'la',
	'laos',
	'mm',
	'myanmar',
	'burma',
	'mv',
	'maldives',
	'maldivas',
	'br',
	'brazil',
	'brasil',
	'co',
	'colombia',
	'cr',
	'costa rica',
	'pa',
	'panama',
	'cu',
	'cuba',
	'do',
	'dominican republic',
	'republica dominicana',
	'jm',
	'jamaica',
	'ke',
	'kenya',
	'quenia',
	'tz',
	'tanzania',
	'mx',
	'mexico',
	'pr',
	'puerto rico',
	'gt',
	'guatemala',
	'bz',
	'belize',
	'hn',
	'honduras',
	'ni',
	'nicaragua',
	'sv',
	'el salvador',
	'ec',
	'ecuador',
	'equador',
	've',
	'venezuela',
	'gy',
	'guyana',
	'sr',
	'suriname',
	'nc',
	'new caledonia',
	'fj',
	'fiji',
	'mu',
	'mauritius',
	'sc',
	'seychelles',
	'cv',
	'cape verde',
	'cabo verde',
	'sn',
	'senegal'
]);

/** Countries cold enough that a warm layer is worth suggesting year-round. */
const COLD_COUNTRIES = new Set([
	'is',
	'iceland',
	'islandia',
	'gl',
	'greenland',
	'groenlandia',
	'no',
	'norway',
	'noruega',
	'fi',
	'finland',
	'finlandia',
	'se',
	'sweden',
	'suecia',
	'ca',
	'canada',
	'ru',
	'russia',
	'ee',
	'estonia',
	'lv',
	'latvia',
	'letonia',
	'lt',
	'lithuania',
	'lituania',
	'mn',
	'mongolia',
	'kz',
	'kazakhstan',
	'kg',
	'kyrgyzstan',
	'np',
	'nepal',
	'bt',
	'bhutan'
]);

/** Trip tags that select a trip type, matched as whole tokens. */
const BEACH_TAGS = new Set(['beach', 'coastal', 'coast', 'sea', 'island', 'tropical', 'sun']);
const HIKING_TAGS = new Set([
	'hiking',
	'hike',
	'trek',
	'trekking',
	'backpack',
	'backpacking',
	'trail',
	'mountain',
	'mountains'
]);
const BUSINESS_TAGS = new Set(['business', 'work', 'conference', 'corporate']);
const WINTER_TAGS = new Set(['ski', 'skiing', 'snow', 'snowboard', 'winter', 'alpine']);

/** Descriptions the weather helper produces for wet or frozen precipitation. */
const WET_WEATHER = /rain|drizzle|shower|thunder|storm|snow|sleet|hail/i;

/** Trim, lower-case and collapse whitespace so two spellings of one item match. */
function normaliseText(value: string | null | undefined): string {
	return (value ?? '').trim().toLowerCase().replace(/\s+/g, ' ');
}

/** Country names may arrive accented or in Portuguese; fold both away. */
function normaliseCountry(value: string | null | undefined): string {
	return Array.from((value ?? '').normalize('NFD'))
		.filter((char) => {
			// Combining diacritical marks, which NFD splits off the base letter.
			const code = char.codePointAt(0) ?? 0;
			return code < 0x300 || code > 0x36f;
		})
		.join('')
		.trim()
		.toLowerCase();
}

/** Every spelling of a suggestion's name, for cross-language dedupe. */
function suggestionTexts(suggestion: PackingSuggestion): string[] {
	return [packingEn[suggestion.titleKey], packingPt[suggestion.titleKey]].map(normaliseText);
}

/**
 * Whether an equivalent item is already on the checklist.
 *
 * Exported because the dialog re-checks against a fresh read just before it
 * writes: the list may have changed on another device while the preview was
 * open, and a duplicate is worse than a missing suggestion.
 */
export function isSuggestionOnChecklist(
	suggestion: PackingSuggestion,
	existing: readonly Pick<ChecklistItem, 'text'>[]
): boolean {
	const texts = new Set(suggestionTexts(suggestion));
	return existing.some((item) => texts.has(normaliseText(item.text)));
}

function normaliseTravellers(value: number | null | undefined): number {
	if (typeof value !== 'number' || !Number.isFinite(value)) return 1;
	return Math.max(1, Math.round(value));
}

function normaliseTags(tags: readonly string[] | null | undefined): Set<string> {
	const out = new Set<string>();
	for (const raw of tags ?? []) {
		for (const token of raw.toLowerCase().split(/[\s,]+/)) {
			const tag = token.replace(/^#/, '').trim();
			if (tag) out.add(tag);
		}
	}
	return out;
}

function hasTag(tags: ReadonlySet<string>, candidates: ReadonlySet<string>): boolean {
	for (const tag of tags) {
		if (candidates.has(tag)) return true;
	}
	return false;
}

/** Destination hemisphere and climate, from the country the trip already stores. */
function countryHint(destinations: readonly Destination[] | null | undefined): {
	hemisphere: PackingHemisphere | null;
	climate: 'tropical' | 'cold' | null;
} {
	let hemisphere: PackingHemisphere | null = null;
	let climate: 'tropical' | 'cold' | null = null;

	for (const destination of destinations ?? []) {
		const country = normaliseCountry(destination.country);
		if (!country) continue;
		if (hemisphere === null) {
			hemisphere = SOUTHERN_COUNTRIES.has(country) ? 'south' : 'north';
		}
		if (climate === null) {
			if (TROPICAL_COUNTRIES.has(country)) climate = 'tropical';
			else if (COLD_COUNTRIES.has(country)) climate = 'cold';
		}
	}
	return { hemisphere, climate };
}

/** Season at the destination; southern-hemisphere seasons are the north's flipped. */
function seasonFor(month: number, hemisphere: PackingHemisphere | null): PackingSeason {
	const northern: PackingSeason =
		month >= 3 && month <= 5
			? 'spring'
			: month >= 6 && month <= 8
				? 'summer'
				: month >= 9 && month <= 11
					? 'autumn'
					: 'winter';
	if (hemisphere !== 'south') return northern;

	const flipped: Record<PackingSeason, PackingSeason> = {
		spring: 'autumn',
		summer: 'winter',
		autumn: 'spring',
		winter: 'summer'
	};
	return flipped[northern];
}

/** What the forecast says about the days the trip actually covers. */
interface ForecastHints {
	hot: boolean;
	cold: boolean;
	wet: boolean;
}

function forecastHints(
	forecast: WeatherForecast | null | undefined,
	dates: readonly string[]
): ForecastHints | null {
	const days = dates
		.map((date) => forecast?.days?.[date])
		.filter((day): day is DayWeather => day != null);
	if (days.length === 0) return null;

	const averageMax = days.reduce((sum, day) => sum + day.maxTemp, 0) / days.length;
	const lowestMin = Math.min(...days.map((day) => day.minTemp));

	return {
		hot: averageMax >= 24,
		cold: averageMax <= 10 || lowestMin <= 2,
		wet: days.some((day) => WET_WEATHER.test(day.description))
	};
}

/** Everything the rules read, derived once from the input. */
interface PackingFacts {
	band: PackingLengthBand | null;
	season: PackingSeason | null;
	climate: 'tropical' | 'cold' | null;
	travellers: number;
	tags: Set<string>;
	forecast: ForecastHints | null;
}

function describe(input: PackingInput): PackingFacts {
	const start = input.trip.startDate ?? null;
	const end = input.trip.endDate ?? null;

	let dates: string[] = [];
	let nights: number | null = null;
	if (start && end && ISO_DATE.test(start) && ISO_DATE.test(end) && end >= start) {
		dates = eachDateInRange(start, end);
		nights = nightsBetween(start, end);
	}

	const band: PackingLengthBand | null =
		nights === null ? null : nights <= 3 ? 'short' : nights <= 7 ? 'medium' : 'long';

	const month = start && ISO_DATE.test(start) ? Number(start.slice(5, 7)) : null;
	const validMonth = month !== null && month >= 1 && month <= 12 ? month : null;
	const { hemisphere, climate } = countryHint(input.trip.destinations);

	return {
		band,
		season: validMonth === null ? null : seasonFor(validMonth, hemisphere),
		climate,
		travellers: normaliseTravellers(input.trip.travelerCount),
		tags: normaliseTags(input.trip.tags),
		forecast: forecastHints(input.forecast, dates)
	};
}

/** Build the unticked/checked suggestions before dedupe and ordering. */
function buildSuggestions(facts: PackingFacts): PackingSuggestion[] {
	const suggestions = new Map<PackingTitleKey, PackingSuggestion>();
	const add = (
		groupKey: ChecklistPresetGroup,
		titleKey: PackingTitleKey,
		reasonKey: PackingReasonKey,
		options: { quantity?: number; checkedByDefault?: boolean } = {}
	) => {
		// One row per item: the first rule to want it also decides its reason.
		if (suggestions.has(titleKey)) return;
		suggestions.set(titleKey, {
			groupKey,
			titleKey,
			reasonKey,
			quantity: options.quantity,
			checkedByDefault: options.checkedByDefault ?? true
		});
	};

	const { band, season, climate, travellers, tags, forecast } = facts;

	// Every trip.
	add('Documents', 'packing_item_passport', 'packing_reason_always');
	add('Documents', 'packing_item_insurance', 'packing_reason_always');
	add('Documents', 'packing_item_confirmations', 'packing_reason_always');
	add('Packing', 'packing_item_bag', 'packing_reason_bag');
	add('Clothes & Gear', 'packing_item_walking_shoes', 'packing_reason_always');
	add('Clothes & Gear', 'packing_item_sleepwear', 'packing_reason_always');
	add('Clothes & Gear', 'packing_item_light_jacket', 'packing_reason_always');
	add('Health & Toiletries', 'packing_item_toothbrush', 'packing_reason_travellers', {
		quantity: travellers
	});
	add('Health & Toiletries', 'packing_item_shampoo', 'packing_reason_travellers', {
		quantity: travellers
	});
	add('Health & Toiletries', 'packing_item_medication', 'packing_reason_always');
	add('Health & Toiletries', 'packing_item_first_aid', 'packing_reason_always');
	add('Health & Toiletries', 'packing_item_hand_sanitiser', 'packing_reason_travellers', {
		quantity: travellers
	});
	add('Electronics & Cables', 'packing_item_phone_charger', 'packing_reason_always');
	add('Electronics & Cables', 'packing_item_adapter', 'packing_reason_always');
	add('Money', 'packing_item_payment_cards', 'packing_reason_always');
	add('Money', 'packing_item_local_cash', 'packing_reason_always', { checkedByDefault: false });

	// Trip length: how many spares, and the extras only a long trip needs.
	if (band) {
		const quantity = QUANTITY_BY_LENGTH[band];
		const reason = LENGTH_REASON[band];
		add('Clothes & Gear', 'packing_item_tshirts', reason, { quantity: quantity.tshirts });
		add('Clothes & Gear', 'packing_item_underwear', reason, { quantity: quantity.underwear });
		add('Clothes & Gear', 'packing_item_socks', reason, { quantity: quantity.socks });
		add('Clothes & Gear', 'packing_item_trousers', reason, { quantity: quantity.trousers });
	}
	if (band === 'long') {
		add('Packing', 'packing_item_packing_cubes', 'packing_reason_length_long', {
			checkedByDefault: false
		});
		add('Electronics & Cables', 'packing_item_power_bank', 'packing_reason_length_long');
		add('Electronics & Cables', 'packing_item_headphones', 'packing_reason_length_long', {
			checkedByDefault: false
		});
		add('Entertainment', 'packing_item_book', 'packing_reason_length_long');
	}
	if (band === 'short') {
		add('To buy', 'packing_item_travel_toiletries', 'packing_reason_length_short', {
			checkedByDefault: false
		});
	}

	// Season at the destination. A tropical country ignores the calendar: its
	// "winter" is a dry season, not a cold one.
	if (climate === 'tropical') {
		add('Clothes & Gear', 'packing_item_sun_hat', 'packing_reason_tropical');
		add('Clothes & Gear', 'packing_item_sunglasses', 'packing_reason_tropical');
		add('Clothes & Gear', 'packing_item_swimwear', 'packing_reason_tropical');
		add('Health & Toiletries', 'packing_item_sunscreen', 'packing_reason_tropical', {
			quantity: travellers
		});
		add('Health & Toiletries', 'packing_item_insect_repellent', 'packing_reason_tropical', {
			quantity: travellers
		});
	} else if (season === 'summer') {
		const reason = SEASON_REASON.summer;
		add('Clothes & Gear', 'packing_item_sun_hat', reason);
		add('Clothes & Gear', 'packing_item_sunglasses', reason);
		add('Clothes & Gear', 'packing_item_swimwear', reason);
		add('Health & Toiletries', 'packing_item_sunscreen', reason, { quantity: travellers });
	} else if (season === 'winter') {
		const reason = SEASON_REASON.winter;
		add('Clothes & Gear', 'packing_item_warm_coat', reason);
		add('Clothes & Gear', 'packing_item_thermal_layers', reason, { quantity: 2 });
		add('Clothes & Gear', 'packing_item_gloves_beanie', reason);
		add('Health & Toiletries', 'packing_item_lip_balm', reason, { quantity: travellers });
	} else if (season) {
		add('Clothes & Gear', 'packing_item_rain_jacket', SEASON_REASON[season]);
	}

	if (climate === 'cold') {
		add('Clothes & Gear', 'packing_item_warm_coat', 'packing_reason_cold_climate');
		add('Clothes & Gear', 'packing_item_thermal_layers', 'packing_reason_cold_climate', {
			quantity: 2
		});
		add('Clothes & Gear', 'packing_item_gloves_beanie', 'packing_reason_cold_climate');
		add('Health & Toiletries', 'packing_item_lip_balm', 'packing_reason_cold_climate', {
			quantity: travellers
		});
	}

	// A forecast the app already holds beats the calendar-based guess.
	if (forecast?.hot) {
		add('Clothes & Gear', 'packing_item_sun_hat', 'packing_reason_forecast_hot');
		add('Clothes & Gear', 'packing_item_sunglasses', 'packing_reason_forecast_hot');
		add('Clothes & Gear', 'packing_item_swimwear', 'packing_reason_forecast_hot');
		add('Health & Toiletries', 'packing_item_sunscreen', 'packing_reason_forecast_hot', {
			quantity: travellers
		});
	}
	if (forecast?.cold) {
		add('Clothes & Gear', 'packing_item_warm_coat', 'packing_reason_forecast_cold');
		add('Clothes & Gear', 'packing_item_thermal_layers', 'packing_reason_forecast_cold', {
			quantity: 2
		});
		add('Clothes & Gear', 'packing_item_gloves_beanie', 'packing_reason_forecast_cold');
	}
	if (forecast?.wet) {
		add('Clothes & Gear', 'packing_item_rain_jacket', 'packing_reason_forecast_wet');
	}

	// Trip type, from the tags the trip already carries.
	if (hasTag(tags, BEACH_TAGS)) {
		add('Clothes & Gear', 'packing_item_swimwear', 'packing_reason_beach');
		add('Clothes & Gear', 'packing_item_flip_flops', 'packing_reason_beach');
		add('Clothes & Gear', 'packing_item_beach_towel', 'packing_reason_beach');
		add('Electronics & Cables', 'packing_item_waterproof_pouch', 'packing_reason_beach', {
			checkedByDefault: false
		});
		add('Health & Toiletries', 'packing_item_sunscreen', 'packing_reason_beach', {
			quantity: travellers
		});
	}
	if (hasTag(tags, HIKING_TAGS)) {
		add('Clothes & Gear', 'packing_item_hiking_boots', 'packing_reason_hiking');
		add('Clothes & Gear', 'packing_item_backpack_cover', 'packing_reason_hiking', {
			checkedByDefault: false
		});
		add('Clothes & Gear', 'packing_item_water_bottle', 'packing_reason_hiking');
		add('Electronics & Cables', 'packing_item_headlamp', 'packing_reason_hiking', {
			checkedByDefault: false
		});
	}
	if (hasTag(tags, BUSINESS_TAGS)) {
		add('Clothes & Gear', 'packing_item_formal_outfit', 'packing_reason_business');
		add('Electronics & Cables', 'packing_item_laptop_charger', 'packing_reason_business');
		add('Documents', 'packing_item_business_cards', 'packing_reason_business', {
			checkedByDefault: false
		});
	}
	if (hasTag(tags, WINTER_TAGS)) {
		add('Clothes & Gear', 'packing_item_warm_coat', 'packing_reason_winter');
		add('Clothes & Gear', 'packing_item_thermal_layers', 'packing_reason_winter', { quantity: 2 });
		add('Clothes & Gear', 'packing_item_gloves_beanie', 'packing_reason_winter');
	}

	return [...suggestions.values()];
}

const GROUP_ORDER = new Map<string, number>(
	CHECKLIST_PRESET_GROUPS.map((group, index) => [group, index])
);

function sortByPresetGroup(suggestions: PackingSuggestion[]): PackingSuggestion[] {
	// `sort` is stable, so rules keep their intended order inside one group.
	return [...suggestions].sort(
		(a, b) => (GROUP_ORDER.get(a.groupKey) ?? 0) - (GROUP_ORDER.get(b.groupKey) ?? 0)
	);
}

/**
 * Suggest what to pack for a trip.
 *
 * Pure: the caller supplies the trip, the current checklist and (optionally) a
 * forecast it already holds. Suggestions already on the checklist – in either
 * language – are left out.
 */
export function generatePackingList(input: PackingInput): PackingSuggestion[] {
	const suggestions = buildSuggestions(describe(input)).filter(
		(suggestion) => !isSuggestionOnChecklist(suggestion, input.existing)
	);
	return sortByPresetGroup(suggestions);
}

/** Bundle suggestions by preset group, skipping groups with nothing in them. */
export function groupPackingSuggestions(suggestions: readonly PackingSuggestion[]): PackingGroup[] {
	return CHECKLIST_PRESET_GROUPS.flatMap((groupKey) => {
		const inGroup = suggestions.filter((suggestion) => suggestion.groupKey === groupKey);
		return inGroup.length > 0 ? [{ groupKey, suggestions: inGroup }] : [];
	});
}
