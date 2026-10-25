/**
 * Compile smoke test for the Today screen.
 *
 * Rendering and the Now-card maths are covered by `$lib/today.test.ts`; this
 * file only makes sure every `.svelte` file — the components and the route that
 * assembles them — still compiles and exports a component.
 */

import { describe, expect, it } from 'vitest';
import TodayPage from '../../../routes/trip/[id]/today/+page.svelte';
import { BeforeTripCard, NowCard, TodayChecklist, TodayTickets, TodayTimeline } from './index';

describe('today screen', () => {
	it('export a component each', () => {
		for (const component of [
			BeforeTripCard,
			NowCard,
			TodayChecklist,
			TodayTickets,
			TodayTimeline,
			TodayPage
		]) {
			expect(component).toBeTruthy();
		}
	});
});
