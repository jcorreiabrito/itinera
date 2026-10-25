import { resolve } from '$app/paths';
import type { ResolvedPathname } from '$app/types';
import {
	BedDouble,
	CalendarDays,
	FileDown,
	LayoutDashboard,
	ListChecks,
	Plane,
	Sun,
	Ticket,
	Wallet
} from 'lucide-svelte';
import { flagEnabled } from '$lib/config';
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
	| 'overview'
	| 'today'
	| 'itinerary'
	| 'flights'
	| 'reservations'
	| 'wallet'
	| 'checklist'
	| 'costs'
	| 'export';

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
	/**
	 * Whether the page is a plan to work on rather than prose to read, and so
	 * takes the wider content column at `2xl` — see the `main` element in
	 * `trip/[id]/+layout.svelte`.
	 *
	 * A day list, a cost table and a checklist all put more on one line as the
	 * window grows; a trip's notes do not, and a 1280px measure is uncomfortable
	 * to read. The split is per section rather than global for that reason.
	 */
	wide?: boolean;
	/** How the mobile bottom bar shows this section; omit to hide it there. */
	mobile?: {
		labelKey: TranslationKey;
		path: (tripId: string) => ResolvedPathname;
		isActive: (pathname: string, tripId: string) => boolean;
	};
}

const under = (pathname: string, tripId: string, segment: string) =>
	pathname.startsWith(`/trip/${tripId}/${segment}`);

/*
 * A section a deployment switched off is dropped from the declarations, so
 * neither navigation can link to it and the mobile order below simply skips it.
 * The page itself remains reachable by URL: the flag hides a destination, it
 * does not delete data the self-hoster may have put there.
 */
const enabled = (id: TripSectionId) =>
	(id !== 'today' || flagEnabled('today')) && (id !== 'wallet' || flagEnabled('wallet'));

/** Sidebar order. Mobile order is declared separately below. */
const ALL_SECTIONS: TripSection[] = [
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
		id: 'today',
		labelKey: 'today',
		icon: Sun,
		/*
		 * Deliberately not `wide`: Today is one column of large type even on a
		 * desk monitor — it is the screen you read standing in a queue, and
		 * stretching it to 1280px would separate the time from the item.
		 */
		path: (id) => resolve('/trip/[id]/today', { id }),
		isActive: (pathname, id) => under(pathname, id, 'today'),
		mobile: {
			labelKey: 'today',
			path: (id) => resolve('/trip/[id]/today', { id }),
			isActive: (pathname, id) => under(pathname, id, 'today')
		}
	},
	{
		id: 'itinerary',
		labelKey: 'itinerary',
		icon: CalendarDays,
		wide: true,
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
		wide: true,
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
		wide: true,
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
		wide: true,
		path: (id) => resolve('/trip/[id]/bookings?tab=reservations', { id }),
		isActive: (pathname, id, tab) => under(pathname, id, 'bookings') && tab === 'reservations'
	},
	{
		id: 'wallet',
		labelKey: 'wallet',
		icon: Ticket,
		path: (id) => resolve('/trip/[id]/wallet', { id }),
		isActive: (pathname, id) => under(pathname, id, 'wallet')
	},
	{
		id: 'costs',
		labelKey: 'costs',
		icon: Wallet,
		wide: true,
		separated: true,
		path: (id) => resolve('/trip/[id]/costs', { id }),
		isActive: (pathname, id) => under(pathname, id, 'costs'),
		mobile: {
			labelKey: 'costs',
			path: (id) => resolve('/trip/[id]/costs', { id }),
			isActive: (pathname, id) => under(pathname, id, 'costs')
		}
	},
	{
		id: 'export',
		labelKey: 'export',
		icon: FileDown,
		separated: true,
		// One entry for every document: print, PDF, calendar and JSON.
		path: (id) => resolve('/trip/[id]/export', { id }),
		isActive: (pathname, id) => under(pathname, id, 'export')
	}
];

export const TRIP_SECTIONS: TripSection[] = ALL_SECTIONS.filter((section) => enabled(section.id));

const byId = new Map(TRIP_SECTIONS.map((section) => [section.id, section]));

/** A section as the mobile bottom bar needs it. */
export interface TripMobileTab {
	id: TripSectionId;
	labelKey: TranslationKey;
	icon: IconComponent;
	path: (tripId: string) => ResolvedPathname;
	isActive: (pathname: string, tripId: string) => boolean;
}

/**
 * Bottom-bar order. Flights stands in for the whole Bookings route.
 *
 * Today takes the first slot Overview used to hold: on a phone, "what am I
 * doing now" beats a dashboard of nine widgets. Five is the ceiling — a sixth
 * tab squeezes every label below a comfortable tap width — so Overview stays a
 * sidebar destination and is linked from the Today page instead.
 */
const MOBILE_ORDER: TripSectionId[] = ['today', 'itinerary', 'flights', 'checklist', 'costs'];

export const TRIP_MOBILE_TABS: TripMobileTab[] = MOBILE_ORDER.flatMap((id) => {
	const section = byId.get(id);
	if (!section?.mobile) return [];
	return [{ id, icon: section.icon, ...section.mobile }];
});
