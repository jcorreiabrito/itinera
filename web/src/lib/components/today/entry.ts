/**
 * One place that turns a merged timeline entry into the few display values the
 * Today card, timeline and first-day preview all need.
 *
 * The title is built here rather than in `$lib/overview.ts` because that helper
 * composes English ("Flight to …"); the Today screen must speak the active
 * language, so it composes titles from the dictionary instead.
 */

import { BedDouble, Bus, Car, MapPin, Plane, Ticket, Utensils } from 'lucide-svelte';
import type { ReservationKind } from '$lib/db';
import type { TimelineEntry } from '$lib/db/repositories/itinerary';
import type { IconComponent } from '$lib/types';
import { t } from '$lib/i18n.svelte';
import { formatTime } from '$lib/format';
import { entryTimeLabel } from '$lib/overview';
import { categoryMeta } from '$lib/components/itinerary/categories';

export interface PresentedEntry {
	title: string;
	location: string | null;
	icon: IconComponent;
}

const RESERVATION_ICONS: Record<ReservationKind, IconComponent> = {
	lodging: BedDouble,
	car: Car,
	restaurant: Utensils,
	activity: Ticket,
	transport: Bus,
	other: MapPin
};

/** A short, localized title plus the icon a row should lead with. */
export function presentEntry(entry: TimelineEntry): PresentedEntry {
	if (entry.kind === 'flight' && entry.flight) {
		const segment = entry.flight.segment;
		const from = segment.from?.code ?? segment.from?.city ?? '';
		const to = segment.to?.code ?? segment.to?.city ?? '';
		const route = [from, to].filter(Boolean).join(' → ');
		return {
			title: route || t('flight'),
			location: segment.airline ?? null,
			icon: Plane
		};
	}

	if (entry.kind === 'reservation' && entry.reservation) {
		const reservation = entry.reservation.reservation;
		return {
			title: reservation?.name ?? t('reservation'),
			location: reservation?.location?.name ?? null,
			icon: reservation ? RESERVATION_ICONS[reservation.kind ?? 'other'] : MapPin
		};
	}

	const item = entry.item;
	return {
		title: item?.title ?? t('untitled'),
		location: item?.location?.name ?? null,
		icon: categoryMeta(item?.category).icon
	};
}

/**
 * `10:00–11:30`, `10:00–09:05 +1` for an overnight flight, or just the start for
 * a moment. All-day entries return an empty string.
 */
export function entryTimeRange(entry: TimelineEntry): string {
	if (entry.minutes == null) return '';
	const start = entryTimeLabel(entry.minutes);

	if (entry.kind === 'flight' && entry.flight) {
		const arrive = formatTime(entry.flight.segment.arriveLocal);
		const offset = entry.flight.computed?.arrivalDayOffset ?? 0;
		if (!arrive) return start;
		return `${start}–${arrive}${offset > 0 ? ` +${offset}` : ''}`;
	}

	if (entry.kind === 'item' && entry.item?.endTime) {
		const end = formatTime(entry.item.endTime);
		return end ? `${start}–${end}` : start;
	}

	return start;
}

/** Time gutter label: the start time, or "All day" for the top lane. */
export function entryGutterLabel(entry: TimelineEntry): string {
	if (entry.minutes == null) return t('all_day');
	return entryTimeLabel(entry.minutes);
}
