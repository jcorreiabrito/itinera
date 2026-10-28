/**
 * View state, as a URL.
 *
 * Which day, tab, filter or open record you are looking at is part of "what the
 * user is looking at" — the thing a link carries. The itinerary was the first
 * page to say so out loud: `?date=` was read once on entry and never written
 * back, so paging through a week left the address bar on the day the tab was
 * opened — a day could not be linked, bookmarked, or sent to a travel
 * companion, and a reload put the user back on today. The checklist, the costs
 * pane and the trip list keep their view state here too, for the same reasons.
 *
 * Parsing and formatting live here, apart from the components, because both are
 * pure functions over a `URLSearchParams` and are worth pinning down in tests
 * without mounting a page.
 *
 * A parameter key means the same thing on every route: `view` is the view mode
 * on screen, `q` is the free-text filter, `item` is the record whose sheet is
 * open. Booleans are written as `1` and read back only from `1`, so a
 * hand-typed `?hide=yes` is not silently honoured; every default is deleted
 * rather than written, so a clean link stays clean.
 */

/** The `date` value that means "the Unscheduled / Ideas bucket". */
export const IDEAS = 'ideas';

/** The category value that means "no category filter". */
export const DEFAULT_CATEGORY = 'all';

/** Query-string keys, exported so the components and their tests agree on them. */
export const PARAM_DATE = 'date';
export const PARAM_VIEW = 'view';
export const PARAM_QUERY = 'q';
export const PARAM_CATEGORY = 'cat';
export const PARAM_ITEM = 'item';
/** Checklist: hide the completed items. */
export const PARAM_HIDE = 'hide';
/** Costs: the unpaid-only master toggle. */
export const PARAM_UNPAID = 'unpaid';
/** Costs: the expense list's paid / unpaid / all chip filter. */
export const PARAM_PAID = 'paid';
/** Costs: the expense list's sort order. */
export const PARAM_SORT = 'sort';
/** Costs: the expense whose sheet is open. */
export const PARAM_EXPENSE = 'expense';
/** Trip list: the planning / confirmed stage filter. */
export const PARAM_FILTER = 'filter';

// --- The small print every reader shares --------------------------------

/** The only value a boolean parameter may carry; anything else reads as off. */
const FLAG_ON = '1';

/** One of `allowed`, or `fallback` when the URL says anything else. */
function readEnum<T extends string>(raw: string | null, allowed: readonly T[], fallback: T): T {
	return raw !== null && (allowed as readonly string[]).includes(raw) ? (raw as T) : fallback;
}

/** Read a boolean parameter written by `writeFlag`. */
function readFlag(params: URLSearchParams, key: string): boolean {
	return params.get(key) === FLAG_ON;
}

/** Write a boolean parameter, deleting it when off so defaults stay out of the URL. */
function writeFlag(params: URLSearchParams, key: string, on: boolean): void {
	if (on) params.set(key, FLAG_ON);
	else params.delete(key);
}

/** A query string in a stable order, so two of them can be compared. */
function canonical(params: URLSearchParams): string {
	return [...params.entries()]
		.sort(([ak, av], [bk, bv]) => (ak === bk ? (av < bv ? -1 : 1) : ak < bk ? -1 : 1))
		.map(([key, value]) => `${key}=${value}`)
		.join('&');
}

/** The query string of an href, without needing a base URL to parse it. */
function paramsOf(href: string): URLSearchParams {
	const start = href.indexOf('?');
	if (start === -1) return new URLSearchParams();
	const end = href.indexOf('#', start);
	return new URLSearchParams(end === -1 ? href.slice(start) : href.slice(start, end));
}

/** The path of an href, without its query string or hash. */
function pathOf(href: string): string {
	const end = href.search(/[?#]/);
	return end === -1 ? href : href.slice(0, end);
}

/**
 * Whether the only difference between two URLs is the free-text filter.
 *
 * This is what decides between replacing the current history entry and pushing
 * a new one: typing in a search box must not fill the Back button with one
 * entry per keystroke, while every other change — a tab, a filter chip, a sort
 * order — is a deliberate act that Back should undo.
 */
export function onlyTextFilterChanged(current: string, next: string): boolean {
	if (pathOf(current) !== pathOf(next)) return false;
	const a = paramsOf(current);
	const b = paramsOf(next);
	a.delete(PARAM_QUERY);
	b.delete(PARAM_QUERY);
	return canonical(a) === canonical(b);
}

// --- Itinerary -----------------------------------------------------------

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
	/** The itinerary item whose sheet is open, or `null` when none is. */
	item: string | null;
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
		category: params.get(PARAM_CATEGORY) ?? DEFAULT_CATEGORY,
		// Not validated here: whether the id names a live item is a question for
		// the data, and the caller that can answer it drops the parameter.
		item: params.get(PARAM_ITEM)
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

	if (state.item) params.set(PARAM_ITEM, state.item);
	else params.delete(PARAM_ITEM);
}

/** The itinerary URL for a view state, given the current one. */
export function itineraryUrl(href: string, state: ItineraryViewState): string {
	const url = new URL(href);
	applyItineraryParams(url.searchParams, state);
	return `${url.pathname}${url.search}${url.hash}`;
}

// --- Checklist -----------------------------------------------------------

/** The checklist's view modes. */
export type ChecklistView = 'group' | 'day' | 'buy';

const CHECKLIST_VIEWS: readonly ChecklistView[] = ['group', 'day', 'buy'];

/** The view mode a missing or unreadable `view` degrades to. */
export const DEFAULT_CHECKLIST_VIEW: ChecklistView = 'group';

/** The part of the checklist view state that survives a page load. */
export interface ChecklistViewState {
	/** Which of the three views is on screen. */
	view: ChecklistView;
	/** Whether completed items are filtered out. */
	hideCompleted: boolean;
	/** The item whose sheet is open, or `null` when none is. */
	item: string | null;
}

/**
 * Read the checklist view state out of a URL.
 *
 * A `view` naming something this page does not have — a stale link, or another
 * route's `view=overview` pasted on — is the default view rather than an empty
 * screen; the sync effect drops the value from the address bar on its first
 * pass.
 */
export function readChecklistParams(params: URLSearchParams): ChecklistViewState {
	return {
		view: readEnum(params.get(PARAM_VIEW), CHECKLIST_VIEWS, DEFAULT_CHECKLIST_VIEW),
		hideCompleted: readFlag(params, PARAM_HIDE),
		// Not validated here, for the same reason as the itinerary's `item`: only
		// the caller that has the items can say whether the id still names one.
		item: params.get(PARAM_ITEM)
	};
}

/** Write the checklist view state onto `params`, in place. */
export function applyChecklistParams(params: URLSearchParams, state: ChecklistViewState): void {
	if (state.view && state.view !== DEFAULT_CHECKLIST_VIEW) params.set(PARAM_VIEW, state.view);
	else params.delete(PARAM_VIEW);

	writeFlag(params, PARAM_HIDE, state.hideCompleted);

	if (state.item) params.set(PARAM_ITEM, state.item);
	else params.delete(PARAM_ITEM);
}

/** The checklist URL for a view state, given the current one. */
export function checklistUrl(href: string, state: ChecklistViewState): string {
	const url = new URL(href);
	applyChecklistParams(url.searchParams, state);
	return `${url.pathname}${url.search}${url.hash}`;
}

// --- Costs ---------------------------------------------------------------

/** The costs views: by day, by category, or the flat expense list. */
export type CostsView = 'day' | 'category' | 'list';

const COSTS_VIEWS: readonly CostsView[] = ['day', 'category', 'list'];

/** The view mode a missing or unreadable `view` degrades to. */
export const DEFAULT_COSTS_VIEW: CostsView = 'day';

/** The expense list's paid / unpaid / all chip filter. */
export type CostsPaidFilter = 'all' | 'paid' | 'unpaid';

/** The expense list's sort order. */
export type CostsSort = 'date' | 'amount';

/** The paid filter a missing or unreadable `paid` degrades to. */
export const DEFAULT_COSTS_PAID: CostsPaidFilter = 'all';

/** The sort order a missing or unreadable `sort` degrades to. */
export const DEFAULT_COSTS_SORT: CostsSort = 'date';

/**
 * The part of the costs view state that survives a page load.
 *
 * The list's own filters (`query`, `paid`, `sort`) belong to the pane rather
 * than to the list component even when another view is showing: they are only
 * *rendered* on the list view, but leaving and returning to it keeps them, and
 * so does a reload.
 */
export interface CostsViewState {
	view: CostsView;
	/** The unpaid-only master toggle, which overrides `paid` while it is on. */
	unpaidOnly: boolean;
	/** The expense list's free-text filter. */
	query: string;
	/** The expense list's paid / unpaid / all chip filter. */
	paid: CostsPaidFilter;
	/** The expense list's sort order. */
	sort: CostsSort;
	/** The expense whose sheet is open, or `null` when none is. */
	expense: string | null;
}

/** Read the costs view state out of a URL. */
export function readCostsParams(params: URLSearchParams): CostsViewState {
	return {
		view: readEnum(params.get(PARAM_VIEW), COSTS_VIEWS, DEFAULT_COSTS_VIEW),
		unpaidOnly: readFlag(params, PARAM_UNPAID),
		query: params.get(PARAM_QUERY) ?? '',
		paid: readEnum(params.get(PARAM_PAID), ['all', 'paid', 'unpaid'], DEFAULT_COSTS_PAID),
		sort: readEnum(params.get(PARAM_SORT), ['date', 'amount'], DEFAULT_COSTS_SORT),
		expense: params.get(PARAM_EXPENSE)
	};
}

/** Write the costs view state onto `params`, in place. */
export function applyCostsParams(params: URLSearchParams, state: CostsViewState): void {
	if (state.view && state.view !== DEFAULT_COSTS_VIEW) params.set(PARAM_VIEW, state.view);
	else params.delete(PARAM_VIEW);

	writeFlag(params, PARAM_UNPAID, state.unpaidOnly);

	const query = state.query.trim();
	if (query) params.set(PARAM_QUERY, query);
	else params.delete(PARAM_QUERY);

	// The list filters are kept whether or not the list is the view on screen:
	// switching to the day view and back must not lose them.
	if (state.paid && state.paid !== DEFAULT_COSTS_PAID) params.set(PARAM_PAID, state.paid);
	else params.delete(PARAM_PAID);

	if (state.sort && state.sort !== DEFAULT_COSTS_SORT) params.set(PARAM_SORT, state.sort);
	else params.delete(PARAM_SORT);

	if (state.expense) params.set(PARAM_EXPENSE, state.expense);
	else params.delete(PARAM_EXPENSE);
}

/** The costs URL for a view state, given the current one. */
export function costsUrl(href: string, state: CostsViewState): string {
	const url = new URL(href);
	applyCostsParams(url.searchParams, state);
	return `${url.pathname}${url.search}${url.hash}`;
}

// --- Trip list -----------------------------------------------------------

/** The trip list's stage filter. */
export type TripsFilter = 'all' | 'confirmed' | 'planning' | 'dreams';

const TRIPS_FILTERS: readonly TripsFilter[] = ['all', 'confirmed', 'planning', 'dreams'];

/** The filter a missing or unreadable `filter` degrades to. */
export const DEFAULT_TRIPS_FILTER: TripsFilter = 'all';

/** The part of the trip list's view state that survives a page load. */
export interface TripsViewState {
	/** Free-text filter over titles, tags and destinations. */
	query: string;
	/** Which stage's sections are showing. */
	filter: TripsFilter;
}

/** Read the trip list view state out of a URL. */
export function readTripsParams(params: URLSearchParams): TripsViewState {
	return {
		query: params.get(PARAM_QUERY) ?? '',
		filter: readEnum(params.get(PARAM_FILTER), TRIPS_FILTERS, DEFAULT_TRIPS_FILTER)
	};
}

/** Write the trip list view state onto `params`, in place. */
export function applyTripsParams(params: URLSearchParams, state: TripsViewState): void {
	const query = state.query.trim();
	if (query) params.set(PARAM_QUERY, query);
	else params.delete(PARAM_QUERY);

	if (state.filter && state.filter !== DEFAULT_TRIPS_FILTER) params.set(PARAM_FILTER, state.filter);
	else params.delete(PARAM_FILTER);
}

/** The trip list URL for a view state, given the current one. */
export function tripsUrl(href: string, state: TripsViewState): string {
	const url = new URL(href);
	applyTripsParams(url.searchParams, state);
	return `${url.pathname}${url.search}${url.hash}`;
}
