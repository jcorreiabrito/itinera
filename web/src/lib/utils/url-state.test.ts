import { describe, expect, it } from 'vitest';
import {
	applyChecklistParams,
	applyCostsParams,
	applyItineraryParams,
	applyTripsParams,
	checklistUrl,
	costsUrl,
	DEFAULT_CATEGORY,
	IDEAS,
	itineraryUrl,
	onlyTextFilterChanged,
	readChecklistParams,
	readCostsParams,
	readItineraryParams,
	readTripsParams,
	tripsUrl,
	type ChecklistViewState,
	type CostsViewState,
	type ItineraryViewState,
	type TripsViewState
} from './url-state';

const DAYS = ['2026-11-02', '2026-11-03', '2026-11-04'];
const TODAY = '2026-11-03';

const state = (over: Partial<ItineraryViewState> = {}): ItineraryViewState => ({
	date: '2026-11-03',
	overview: false,
	query: '',
	category: DEFAULT_CATEGORY,
	item: null,
	...over
});

describe('readItineraryParams', () => {
	it('opens on today when the URL says nothing', () => {
		expect(readItineraryParams(new URLSearchParams(), DAYS, TODAY).date).toBe(TODAY);
	});

	it('opens on the first day when today is outside the trip', () => {
		expect(readItineraryParams(new URLSearchParams(), DAYS, '2027-01-01').date).toBe('2026-11-02');
	});

	it('honours a day that is on the trip', () => {
		const params = new URLSearchParams('?date=2026-11-04');
		expect(readItineraryParams(params, DAYS, TODAY).date).toBe('2026-11-04');
	});

	it('reads `date=ideas` as the unscheduled bucket', () => {
		expect(readItineraryParams(new URLSearchParams(`?${'date'}=${IDEAS}`), DAYS, TODAY).date).toBe(
			null
		);
	});

	it('ignores a day the trip does not have', () => {
		// A bookmarked day that was since deleted, or another trip's day.
		const params = new URLSearchParams('?date=2026-12-25');
		expect(readItineraryParams(params, DAYS, TODAY).date).toBe(TODAY);
	});

	it('survives a trip with no days at all', () => {
		expect(readItineraryParams(new URLSearchParams('?date=2026-11-02'), [], TODAY).date).toBeNull();
	});

	it('reads the overview flag, the query and the category', () => {
		const params = new URLSearchParams('?view=overview&q=ramen&cat=food');
		const view = readItineraryParams(params, DAYS, TODAY);
		expect(view.overview).toBe(true);
		expect(view.query).toBe('ramen');
		expect(view.category).toBe('food');
	});

	it('defaults the filter state', () => {
		const view = readItineraryParams(new URLSearchParams(), DAYS, TODAY);
		expect(view.overview).toBe(false);
		expect(view.query).toBe('');
		expect(view.category).toBe(DEFAULT_CATEGORY);
		expect(view.item).toBeNull();
	});

	it('reads the open item, without judging whether it still exists', () => {
		// The id is checked against the trip's items by the caller, which is the
		// only place that knows; a stale one is then dropped from the URL.
		const view = readItineraryParams(new URLSearchParams('?item=itin:T1:A'), DAYS, TODAY);
		expect(view.item).toBe('itin:T1:A');
	});

	it('treats an unknown view value as the day view', () => {
		expect(readItineraryParams(new URLSearchParams('?view=timeline'), DAYS, TODAY).overview).toBe(
			false
		);
	});
});

describe('applyItineraryParams', () => {
	it('writes the selected day', () => {
		const params = new URLSearchParams();
		applyItineraryParams(params, state({ date: '2026-11-04' }));
		expect(params.get('date')).toBe('2026-11-04');
	});

	it('writes `ideas` for the unscheduled bucket', () => {
		const params = new URLSearchParams();
		applyItineraryParams(params, state({ date: null }));
		expect(params.get('date')).toBe(IDEAS);
	});

	it('omits the defaults instead of spelling them out', () => {
		const params = new URLSearchParams();
		applyItineraryParams(params, state());
		expect(params.has('view')).toBe(false);
		expect(params.has('q')).toBe(false);
		expect(params.has('cat')).toBe(false);
		expect([...params.keys()]).toEqual(['date']);
	});

	it('clears parameters that no longer apply', () => {
		const params = new URLSearchParams('?view=overview&q=ramen&cat=food');
		applyItineraryParams(params, state());
		expect(params.has('view')).toBe(false);
		expect(params.has('q')).toBe(false);
		expect(params.has('cat')).toBe(false);
	});

	it('trims the query, and drops it when it is only whitespace', () => {
		const params = new URLSearchParams();
		applyItineraryParams(params, state({ query: '  ramen ' }));
		expect(params.get('q')).toBe('ramen');

		applyItineraryParams(params, state({ query: '   ' }));
		expect(params.has('q')).toBe(false);
	});

	it('writes the open item and clears it again', () => {
		const params = new URLSearchParams();
		applyItineraryParams(params, state({ item: 'itin:T1:A' }));
		expect(params.get('item')).toBe('itin:T1:A');

		applyItineraryParams(params, state());
		expect(params.has('item')).toBe(false);
	});

	it('leaves unrelated parameters alone', () => {
		const params = new URLSearchParams('?from=share&date=2026-11-02');
		applyItineraryParams(params, state({ date: '2026-11-04' }));
		expect(params.get('from')).toBe('share');
	});
});

describe('round trip', () => {
	it('reads back exactly what was written', () => {
		const written = state({
			date: null,
			overview: true,
			query: 'museum',
			category: 'culture',
			item: 'itin:T1:A'
		});
		const params = new URLSearchParams();
		applyItineraryParams(params, written);
		expect(readItineraryParams(params, DAYS, TODAY)).toEqual(written);
	});

	it('reads back the default state', () => {
		const params = new URLSearchParams();
		applyItineraryParams(params, state());
		expect(readItineraryParams(params, DAYS, TODAY)).toEqual(state());
	});
});

describe('itineraryUrl', () => {
	it('keeps the path and adds only what changed', () => {
		expect(itineraryUrl('http://localhost/trip/trip:T1/itinerary', state())).toBe(
			'/trip/trip:T1/itinerary?date=2026-11-03'
		);
	});

	it('preserves unrelated parameters and the hash', () => {
		expect(
			itineraryUrl('http://localhost/trip/trip:T1/itinerary?from=share#top', state({ date: null }))
		).toBe('/trip/trip:T1/itinerary?from=share&date=ideas#top');
	});
});

describe('onlyTextFilterChanged', () => {
	it('is true when the free-text filter is the only difference', () => {
		expect(onlyTextFilterChanged('/?q=por', '/?q=porto')).toBe(true);
		expect(
			onlyTextFilterChanged(
				'/trip/trip:T1/costs?view=list',
				'/trip/trip:T1/costs?view=list&q=lunch'
			)
		).toBe(true);
	});

	it('is false when a deliberate change rides along', () => {
		expect(onlyTextFilterChanged('/?q=por&filter=all', '/?q=porto&filter=planning')).toBe(false);
		expect(
			onlyTextFilterChanged('/trip/trip:T1/costs?view=list', '/trip/trip:T1/costs?view=day')
		).toBe(false);
	});

	it('is false across paths, even when the queries match', () => {
		expect(onlyTextFilterChanged('/', '/settings')).toBe(false);
	});

	it('reads parameters in any order', () => {
		expect(onlyTextFilterChanged('/?q=a&filter=planning', '/?filter=planning&q=b')).toBe(true);
	});

	it('ignores the hash', () => {
		expect(onlyTextFilterChanged('/#top', '/?q=x#bottom')).toBe(true);
	});
});

const checklistState = (over: Partial<ChecklistViewState> = {}): ChecklistViewState => ({
	view: 'group',
	hideCompleted: false,
	item: null,
	...over
});

describe('readChecklistParams', () => {
	it('defaults a URL that says nothing', () => {
		expect(readChecklistParams(new URLSearchParams())).toEqual(checklistState());
	});

	it('reads each view', () => {
		for (const view of ['group', 'day', 'buy'] as const) {
			expect(readChecklistParams(new URLSearchParams(`?view=${view}`)).view).toBe(view);
		}
	});

	it('degrades an unknown view to the default', () => {
		// A stale link, or another route's `?view=overview` pasted on.
		expect(readChecklistParams(new URLSearchParams('?view=overview')).view).toBe('group');
		expect(readChecklistParams(new URLSearchParams('?view=')).view).toBe('group');
	});

	it('reads the hide-completed flag, and only from `1`', () => {
		expect(readChecklistParams(new URLSearchParams('?hide=1')).hideCompleted).toBe(true);
		expect(readChecklistParams(new URLSearchParams('?hide=yes')).hideCompleted).toBe(false);
		expect(readChecklistParams(new URLSearchParams('?hide=0')).hideCompleted).toBe(false);
	});

	it('reads the open item, without judging whether it still exists', () => {
		expect(readChecklistParams(new URLSearchParams('?item=checklist:T1:A')).item).toBe(
			'checklist:T1:A'
		);
	});
});

describe('applyChecklistParams', () => {
	it('omits the defaults instead of spelling them out', () => {
		const params = new URLSearchParams();
		applyChecklistParams(params, checklistState());
		expect([...params.keys()]).toEqual([]);
	});

	it('writes the view, the flag and the item', () => {
		const params = new URLSearchParams();
		applyChecklistParams(
			params,
			checklistState({ view: 'buy', hideCompleted: true, item: 'c:T1:A' })
		);
		expect(params.get('view')).toBe('buy');
		expect(params.get('hide')).toBe('1');
		expect(params.get('item')).toBe('c:T1:A');
	});

	it('clears parameters that no longer apply', () => {
		const params = new URLSearchParams('?view=buy&hide=1&item=c:T1:A');
		applyChecklistParams(params, checklistState());
		expect([...params.keys()]).toEqual([]);
	});

	it('leaves unrelated parameters alone', () => {
		const params = new URLSearchParams('?from=share&view=day');
		applyChecklistParams(params, checklistState({ view: 'buy' }));
		expect(params.get('from')).toBe('share');
	});

	it('reads back exactly what was written', () => {
		const written = checklistState({ view: 'day', hideCompleted: true, item: 'c:T1:A' });
		const params = new URLSearchParams();
		applyChecklistParams(params, written);
		expect(readChecklistParams(params)).toEqual(written);
	});

	it('reads back the default state', () => {
		const params = new URLSearchParams();
		applyChecklistParams(params, checklistState());
		expect(readChecklistParams(params)).toEqual(checklistState());
	});
});

describe('checklistUrl', () => {
	it('keeps the path and adds only what changed', () => {
		expect(
			checklistUrl('http://localhost/trip/trip:T1/checklist?from=share', checklistState())
		).toBe('/trip/trip:T1/checklist?from=share');
	});

	it('preserves unrelated parameters and the hash', () => {
		expect(
			checklistUrl('http://localhost/trip/trip:T1/checklist#top', checklistState({ view: 'day' }))
		).toBe('/trip/trip:T1/checklist?view=day#top');
	});
});

const costsState = (over: Partial<CostsViewState> = {}): CostsViewState => ({
	view: 'day',
	unpaidOnly: false,
	query: '',
	paid: 'all',
	sort: 'date',
	expense: null,
	...over
});

describe('readCostsParams', () => {
	it('defaults a URL that says nothing', () => {
		expect(readCostsParams(new URLSearchParams())).toEqual(costsState());
	});

	it('reads each view', () => {
		for (const view of ['day', 'category', 'list'] as const) {
			expect(readCostsParams(new URLSearchParams(`?view=${view}`)).view).toBe(view);
		}
	});

	it('degrades every unreadable value to its default', () => {
		const view = readCostsParams(new URLSearchParams('?view=bogus&paid=maybe&sort=cheapest'));
		expect(view.view).toBe('day');
		expect(view.paid).toBe('all');
		expect(view.sort).toBe('date');
	});

	it('reads the master toggle, the filters and the open expense', () => {
		const view = readCostsParams(
			new URLSearchParams('?view=list&unpaid=1&q=lunch&paid=unpaid&sort=amount&expense=exp:T1:A')
		);
		expect(view).toEqual(
			costsState({
				view: 'list',
				unpaidOnly: true,
				query: 'lunch',
				paid: 'unpaid',
				sort: 'amount',
				expense: 'exp:T1:A'
			})
		);
	});
});

describe('applyCostsParams', () => {
	it('omits the defaults instead of spelling them out', () => {
		const params = new URLSearchParams();
		applyCostsParams(params, costsState());
		expect([...params.keys()]).toEqual([]);
	});

	it('keeps the list filters even when another view is showing', () => {
		// Leaving the list for the day view and coming back must not lose them.
		const params = new URLSearchParams();
		applyCostsParams(
			params,
			costsState({ view: 'day', query: 'lunch', paid: 'unpaid', sort: 'amount' })
		);
		expect(params.get('q')).toBe('lunch');
		expect(params.get('paid')).toBe('unpaid');
		expect(params.get('sort')).toBe('amount');
	});

	it('trims the query, and drops it when it is only whitespace', () => {
		const params = new URLSearchParams();
		applyCostsParams(params, costsState({ query: '  lunch ' }));
		expect(params.get('q')).toBe('lunch');

		applyCostsParams(params, costsState({ query: '   ' }));
		expect(params.has('q')).toBe(false);
	});

	it('clears parameters that no longer apply', () => {
		const params = new URLSearchParams('?view=list&unpaid=1&q=x&paid=paid&sort=amount&expense=e');
		applyCostsParams(params, costsState());
		expect([...params.keys()]).toEqual([]);
	});

	it('leaves unrelated parameters alone', () => {
		const params = new URLSearchParams('?from=share&view=list');
		applyCostsParams(params, costsState({ view: 'day' }));
		expect(params.get('from')).toBe('share');
	});

	it('reads back exactly what was written', () => {
		const written = costsState({
			view: 'list',
			unpaidOnly: true,
			query: 'lunch',
			paid: 'paid',
			sort: 'amount',
			expense: 'exp:T1:A'
		});
		const params = new URLSearchParams();
		applyCostsParams(params, written);
		expect(readCostsParams(params)).toEqual(written);
	});

	it('reads back the default state', () => {
		const params = new URLSearchParams();
		applyCostsParams(params, costsState());
		expect(readCostsParams(params)).toEqual(costsState());
	});
});

describe('costsUrl', () => {
	it('keeps the path and adds only what changed', () => {
		expect(costsUrl('http://localhost/trip/trip:T1/costs', costsState({ view: 'list' }))).toBe(
			'/trip/trip:T1/costs?view=list'
		);
	});

	it('preserves unrelated parameters and the hash', () => {
		expect(costsUrl('http://localhost/trip/trip:T1/costs#totals', costsState())).toBe(
			'/trip/trip:T1/costs#totals'
		);
	});
});

const tripsState = (over: Partial<TripsViewState> = {}): TripsViewState => ({
	query: '',
	filter: 'all',
	...over
});

describe('readTripsParams', () => {
	it('defaults a URL that says nothing', () => {
		expect(readTripsParams(new URLSearchParams())).toEqual(tripsState());
	});

	it('reads the query and each filter', () => {
		expect(readTripsParams(new URLSearchParams('?q=porto&filter=planning'))).toEqual(
			tripsState({ query: 'porto', filter: 'planning' })
		);
		for (const filter of ['all', 'confirmed', 'planning'] as const) {
			expect(readTripsParams(new URLSearchParams(`?filter=${filter}`)).filter).toBe(filter);
		}
	});

	it('degrades an unknown filter to all', () => {
		expect(readTripsParams(new URLSearchParams('?filter=archived')).filter).toBe('all');
	});
});

describe('applyTripsParams', () => {
	it('omits the defaults instead of spelling them out', () => {
		const params = new URLSearchParams();
		applyTripsParams(params, tripsState());
		expect([...params.keys()]).toEqual([]);
	});

	it('writes and then clears the filter', () => {
		const params = new URLSearchParams();
		applyTripsParams(params, tripsState({ query: 'porto', filter: 'confirmed' }));
		expect(params.get('q')).toBe('porto');
		expect(params.get('filter')).toBe('confirmed');

		applyTripsParams(params, tripsState());
		expect([...params.keys()]).toEqual([]);
	});

	it('reads back exactly what was written', () => {
		const written = tripsState({ query: 'porto', filter: 'planning' });
		const params = new URLSearchParams();
		applyTripsParams(params, written);
		expect(readTripsParams(params)).toEqual(written);
	});
});

describe('tripsUrl', () => {
	it('keeps the path and adds only what changed', () => {
		expect(tripsUrl('http://localhost/', tripsState({ filter: 'planning' }))).toBe(
			'/?filter=planning'
		);
	});

	it('preserves the hash', () => {
		expect(tripsUrl('http://localhost/#top', tripsState())).toBe('/#top');
	});
});
