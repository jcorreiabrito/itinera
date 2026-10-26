/**
 * Compile smoke test for the wide planning workspace.
 *
 * The pure day helpers are covered by `day-status.test.ts`; this file only makes
 * sure the new panes and the route that assembles them still compile and export
 * a component each.
 */

import { describe, expect, it } from 'vitest';
import ItineraryPage from '../../../routes/trip/[id]/itinerary/+page.svelte';
import { DayRail, ItineraryItemForm, ItineraryItemSheet, ItemInspector, TripMap } from './index';

describe('itinerary workspace', () => {
	it('export a component each', () => {
		for (const component of [
			DayRail,
			ItemInspector,
			ItineraryItemForm,
			ItineraryItemSheet,
			TripMap,
			ItineraryPage
		]) {
			expect(component).toBeTruthy();
		}
	});
});
