import { describe, expect, it } from 'vitest';
import {
	applyItineraryParams,
	DEFAULT_CATEGORY,
	IDEAS,
	itineraryUrl,
	readItineraryParams,
	type ItineraryViewState
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
