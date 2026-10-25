import { describe, expect, it } from 'vitest';
import { TRIP_MOBILE_TABS, TRIP_SECTIONS, type TripSectionId } from './trip-sections';

/**
 * The trip shell's navigation is declared once and rendered twice. These tests
 * are the record of the two decisions the shell makes about that list: which
 * sections exist in which navigation, and which ones are planning surfaces that
 * take the wider column on a large screen.
 */

const byId = (id: TripSectionId) => TRIP_SECTIONS.find((section) => section.id === id);

describe('TRIP_SECTIONS', () => {
	it('declares each destination once', () => {
		const ids = TRIP_SECTIONS.map((section) => section.id);
		expect(new Set(ids).size).toBe(ids.length);
	});

	it('resolves the section a pathname belongs to', () => {
		const find = (pathname: string, tab: string | null = null) =>
			TRIP_SECTIONS.find((section) => section.isActive(pathname, 'abc', tab))?.id;

		expect(find('/trip/abc/overview')).toBe('overview');
		expect(find('/trip/abc/itinerary')).toBe('itinerary');
		expect(find('/trip/abc/checklist')).toBe('checklist');
		expect(find('/trip/abc/wallet')).toBe('wallet');
		expect(find('/trip/abc/costs')).toBe('costs');
	});

	it('tells the two Bookings tabs apart by the query string', () => {
		expect(TRIP_SECTIONS.find((s) => s.isActive('/trip/abc/bookings', 'abc', null))?.id).toBe(
			'flights'
		);
		expect(
			TRIP_SECTIONS.find((s) => s.isActive('/trip/abc/bookings', 'abc', 'reservations'))?.id
		).toBe('reservations');
	});

	it('claims nothing for a page inside a trip that is not a section', () => {
		// The print view lives under the same layout and must not be sized like a
		// section, nor marked current in a navigation it does not appear in.
		expect(TRIP_SECTIONS.find((s) => s.isActive('/trip/abc/print', 'abc', null))).toBeUndefined();
	});

	it('does not let one trip id match another trip id as a prefix', () => {
		// `under()` compares a whole segment, so `/trip/ab/...` is not `/trip/abc/...`.
		expect(
			TRIP_SECTIONS.find((s) => s.isActive('/trip/ab/itinerary', 'abc', null))
		).toBeUndefined();
	});

	it('marks exactly the planning surfaces as wide', () => {
		const wide = TRIP_SECTIONS.filter((section) => section.wide).map((section) => section.id);
		expect(wide.sort()).toEqual(['checklist', 'costs', 'flights', 'itinerary', 'reservations']);
	});

	it('keeps the overview at the reading measure', () => {
		expect(byId('overview')?.wide).toBeUndefined();
	});
});

describe('TRIP_MOBILE_TABS', () => {
	it('renders the sections that opt into the bottom bar, in the declared order', () => {
		// Today leads on a phone; Overview stays a sidebar destination because the
		// bar is capped at five tabs (see MOBILE_ORDER).
		expect(TRIP_MOBILE_TABS.map((tab) => tab.id)).toEqual([
			'today',
			'itinerary',
			'flights',
			'checklist',
			'costs'
		]);
	});

	it('gives every tab the data it needs to render', () => {
		for (const tab of TRIP_MOBILE_TABS) {
			expect(tab.labelKey).toBeTruthy();
			expect(typeof tab.path).toBe('function');
			expect(typeof tab.isActive).toBe('function');
		}
	});

	it('leaves the reservations tab out, since Bookings stands in for both', () => {
		expect(TRIP_MOBILE_TABS.map((tab) => tab.id)).not.toContain('reservations');
	});

	it('keeps the mobile Bookings entry current on either tab', () => {
		const bookings = TRIP_MOBILE_TABS.find((tab) => tab.id === 'flights');
		expect(bookings?.isActive('/trip/abc/bookings', 'abc')).toBe(true);
	});
});
