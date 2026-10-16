/**
 * The itinerary view, as a URL.
 *
 * Which day you are looking at, whether the overview is open, and which filter
 * is applied are all part of "what the user is looking at" — the thing a link
 * carries. `?date=` was read once on entry and never written back, so paging
 * through a week left the address bar on the day the tab was opened: a day could
 * not be linked, bookmarked, or sent to a travel companion, and a reload put the
 * user back on today.
 *
 * Parsing and formatting live here, apart from the component, because both are
 * pure functions over a `URLSearchParams` and are worth pinning down in tests
 * without mounting a page.
 */

/** The `date` value that means "the Unscheduled / Ideas bucket". */
export const IDEAS = 'ideas';

/** The category value that means "no category filter". */
export const DEFAULT_CATEGORY = 'all';

/** Query-string keys, exported so the component and its tests agree on them. */
export const PARAM_DATE = 'date';
export const PARAM_VIEW = 'view';
export const PARAM_QUERY = 'q';
export const PARAM_CATEGORY = 'cat';

/** The part of the itinerary view state that survives a page load. */
export interface ItineraryViewState {
	/** The selected day, or `null` for the Unscheduled / Ideas bucket. */
	date: string | null;
	/** Whether the whole-trip overview is showing instead of a single day. */
	overview: boolean;
	/** Free-text filter. */
	query: string;
	/** Category filter, `DEFAULT_CATEGORY` when unfiltered. */
	category: string;
}

/**
 * Read the view state out of a URL.
 *
 * A `date` that is not one of the trip's days is ignored rather than honoured:
 * the URL outlives the data, so a bookmarked day that has since been deleted, or
 * a link to another trip's day, must fall back to the default day instead of
 * selecting a day that is not on screen.
 */
export function readItineraryParams(
	params: URLSearchParams,
	days: string[],
	today: string
): ItineraryViewState {
	const raw = params.get(PARAM_DATE);
	let date: string | null;
	if (raw === IDEAS) date = null;
	else if (raw && days.includes(raw)) date = raw;
	else if (days.includes(today)) date = today;
	else date = days[0] ?? null;

	return {
		date,
		overview: params.get(PARAM_VIEW) === 'overview',
		query: params.get(PARAM_QUERY) ?? '',
		category: params.get(PARAM_CATEGORY) ?? DEFAULT_CATEGORY
	};
}

/**
 * Write the view state onto `params`, in place, leaving every unrelated
 * parameter (and the rest of the URL) untouched.
 *
 * Defaults are deleted rather than written: a clean day link should stay a clean
 * day link instead of growing a `?view=day&cat=all` tail.
 */
export function applyItineraryParams(params: URLSearchParams, state: ItineraryViewState): void {
	params.set(PARAM_DATE, state.date ?? IDEAS);

	if (state.overview) params.set(PARAM_VIEW, 'overview');
	else params.delete(PARAM_VIEW);

	const query = state.query.trim();
	if (query) params.set(PARAM_QUERY, query);
	else params.delete(PARAM_QUERY);

	if (state.category && state.category !== DEFAULT_CATEGORY)
		params.set(PARAM_CATEGORY, state.category);
	else params.delete(PARAM_CATEGORY);
}

/** The itinerary URL for a view state, given the current one. */
export function itineraryUrl(href: string, state: ItineraryViewState): string {
	const url = new URL(href);
	applyItineraryParams(url.searchParams, state);
	return `${url.pathname}${url.search}${url.hash}`;
}
