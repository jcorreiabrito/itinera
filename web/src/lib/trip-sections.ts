import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';
import { BedDouble, CalendarDays, LayoutDashboard, ListChecks, Plane, Wallet } from 'lucide-svelte';
import type { TranslationKey } from '$lib/i18n.svelte';
import type { IconComponent } from '$lib/types';

/**
 * The trip shell's destinations, declared once.
 *
 * Both navigations (the desktop sidebar and the mobile bottom bar) render from
 * this list, so they cannot drift apart — previously the two lists, plus the
 * dead `Sidebar`/`BottomTabBar` components, disagreed about whether the third
 * destination was called "Bookings" or "Flights".
 *
 * `path` returns a `ResolvedPathname`: `resolve()` is applied here, once, and
 * typing the result is what lets an `<a href>` accept it without the base path
 * being re-derived at every call site.
 */

export type TripSectionId =
	'overview' | 'itinerary' | 'flights' | 'reservations' | 'checklist' | 'costs';

export interface TripSection {
	id: TripSectionId;
	labelKey: TranslationKey;
	icon: IconComponent;
	/** Link target for the desktop sidebar. */
	path: (tripId: string) => ResolvedPathname;
	/** Whether this section's link is the current one. */
	isActive: (pathname: string, tripId: string, tab: string | null) => boolean;
	/** Sidebar spacing: this entry starts a new visual block. */
	separated?: boolean;
	/** Heading that introduces a titled block in the desktop sidebar. */
	group?: TranslationKey;
	/** How the mobile bottom bar shows this section; omit to hide it there. */
	mobile?: {
		labelKey: TranslationKey;
		path: (tripId: string) => ResolvedPathname;
		isActive: (pathname: string, tripId: string) => boolean;
	};
}

const under = (pathname: string, tripId: string, segment: string) =>
	pathname.startsWith(`/trip/${tripId}/${segment}`);

/** Sidebar order. Mobile order is declared separately below. */
export const TRIP_SECTIONS: TripSection[] = [
	{
		id: 'overview',
		labelKey: 'overview',
		icon: LayoutDashboard,
		path: (id) => resolve('/trip/[id]/overview', { id }),
		isActive: (pathname, id) => under(pathname, id, 'overview'),
		mobile: {
			labelKey: 'overview',
			path: (id) => resolve('/trip/[id]/overview', { id }),
			isActive: (pathname, id) => under(pathname, id, 'overview')
		}
	},
	{
		id: 'itinerary',
		labelKey: 'itinerary',
		icon: CalendarDays,
		path: (id) => resolve('/trip/[id]/itinerary', { id }),
		isActive: (pathname, id) => under(pathname, id, 'itinerary'),
		mobile: {
			labelKey: 'itinerary',
			path: (id) => resolve('/trip/[id]/itinerary', { id }),
			isActive: (pathname, id) => under(pathname, id, 'itinerary')
		}
	},
	{
		id: 'checklist',
		labelKey: 'checklist',
		icon: ListChecks,
		path: (id) => resolve('/trip/[id]/checklist', { id }),
		isActive: (pathname, id) => under(pathname, id, 'checklist'),
		mobile: {
			labelKey: 'checklist',
			path: (id) => resolve('/trip/[id]/checklist', { id }),
			isActive: (pathname, id) => under(pathname, id, 'checklist')
		}
	},
	{
		id: 'flights',
		labelKey: 'flights',
		icon: Plane,
		separated: true,
		group: 'bookings',
		path: (id) => resolve('/trip/[id]/bookings?tab=flights', { id }),
		// Bookings is one route with two tabs; `?tab=` decides which entry is current.
		isActive: (pathname, id, tab) => under(pathname, id, 'bookings') && tab !== 'reservations',
		mobile: {
			labelKey: 'bookings',
			path: (id) => resolve('/trip/[id]/bookings', { id }),
			isActive: (pathname, id) => under(pathname, id, 'bookings')
		}
	},
	{
		id: 'reservations',
		labelKey: 'reservations',
		icon: BedDouble,
		path: (id) => resolve('/trip/[id]/bookings?tab=reservations', { id }),
		isActive: (pathname, id, tab) => under(pathname, id, 'bookings') && tab === 'reservations'
	},
	{
		id: 'costs',
		labelKey: 'costs',
		icon: Wallet,
		separated: true,
		path: (id) => resolve('/trip/[id]/costs', { id }),
		isActive: (pathname, id) => under(pathname, id, 'costs'),
		mobile: {
			labelKey: 'costs',
			path: (id) => resolve('/trip/[id]/costs', { id }),
			isActive: (pathname, id) => under(pathname, id, 'costs')
		}
	}
];

const byId = new Map(TRIP_SECTIONS.map((section) => [section.id, section]));

/** A section as the mobile bottom bar needs it. */
export interface TripMobileTab {
	id: TripSectionId;
	labelKey: TranslationKey;
	icon: IconComponent;
	path: (tripId: string) => ResolvedPathname;
	isActive: (pathname: string, tripId: string) => boolean;
}

/** Bottom-bar order. Flights stands in for the whole Bookings route. */
const MOBILE_ORDER: TripSectionId[] = ['overview', 'itinerary', 'flights', 'checklist', 'costs'];

export const TRIP_MOBILE_TABS: TripMobileTab[] = MOBILE_ORDER.flatMap((id) => {
	const section = byId.get(id);
	if (!section?.mobile) return [];
	return [{ id, icon: section.icon, ...section.mobile }];
});
