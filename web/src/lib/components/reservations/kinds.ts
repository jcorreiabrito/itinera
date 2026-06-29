/**
 * Reservation kind metadata + the date-timeline builder for the Reservations
 * pane. Pure (no PouchDB import) so it is easy to reason about and reuse.
 *
 * The timeline is a single chronological model: Lodging spans surface as a
 * check-in row on the arrival day and a check-out row on the departure day;
 * every other kind is a single point on its start date. Type filtering narrows
 * the rows without changing the chronological grouping.
 */

import { dateOf, minutesOfDay } from '$lib/db/datetime';
import type { Reservation, ReservationKind } from '$lib/db';
import { BedDouble, Bus, Car, MapPin, Ticket, Utensils } from 'lucide-svelte';
import type { IconComponent } from '$lib/types';

export interface KindMeta {
    label: string;
    icon: IconComponent;
    /** Label for the `start` field in the sheet. */
    startLabel: string;
    /** Label for the `end` field, or `null` when the kind has no end. */
    endLabel: string | null;
}

export const KIND_META: Record<ReservationKind, KindMeta> = {
    lodging: { label: 'Lodging', icon: BedDouble, startLabel: 'Check-in', endLabel: 'Check-out' },
    car: { label: 'Car rental', icon: Car, startLabel: 'Pick-up', endLabel: 'Drop-off' },
    restaurant: { label: 'Restaurant', icon: Utensils, startLabel: 'Reservation time', endLabel: null },
    activity: { label: 'Activity', icon: Ticket, startLabel: 'Arrives', endLabel: 'End (optional)' },
    transport: { label: 'Transport', icon: Bus, startLabel: 'Departs', endLabel: 'Arrives' },
    other: { label: 'Other', icon: MapPin, startLabel: 'Start', endLabel: 'End (optional)' },
};

export const KIND_ORDER: ReservationKind[] = [
    'lodging',
    'car',
    'restaurant',
    'activity',
    'transport',
    'other'
];

export function kindMeta(kind: string): KindMeta {
    return KIND_META[kind as ReservationKind] ?? KIND_META.other;
}

/** A compact secondary-line summary of a reservation's kind-specific details. */
export function detailSummary(res: Reservation): string {
    const d = (res.details ?? {}) as Record<string, unknown>;
    const s = (k: string) => (typeof d[k] === 'string' ? (d[k] as string) : '');
    switch (res.kind) {
        case 'lodging':
            return s('roomType');
        case 'car':
            return [s('company'), s('carClass')].filter(Boolean).join(' · ');
        case 'restaurant':
            return s('partySize') ? `Party of ${s('partySize')}` : '';
        case 'activity':
            return [s('provider'), s('meetingPoint')].filter(Boolean).join(' · ');
        case 'transport':
            const fromTo = [s('from'), s('to')].filter(Boolean).join(' → ');
            return [s('mode'), fromTo, s('carrier')].filter(Boolean).join(' · ');
        default:
            return '';
    }
}

export type ReservationRowKind = 'checkin' | 'checkout' | 'point';

export interface ReservationEntry {
    reservation: Reservation;
    rowKind: ReservationRowKind;
    /** ISO date (`YYYY-MM-DD`) the row belongs to, or `null` when undated. */
    date: string | null;
    /** ISO datetime / time used for intra-day ordering, if any. */
    time: string | null;
}

export interface ReservationDateGroup {
    date: string | null;
    entries: ReservationEntry[];
}

/**
 * Build the chronological timeline. `filter` (a kind) narrows which reservations
 * contribute rows but never changes the date grouping. Undated reservations are
 * grouped last.
 */
export function buildTimeline(
    reservations: Reservation[],
    filter?: ReservationKind | null
): ReservationDateGroup[] {
    const entries: ReservationEntry[] = [];

    for (const res of reservations) {
        if (filter && res.kind !== filter) continue;
        const startDate = dateOf(res.start);
        const endDate = dateOf(res.end);
        const startTime = res.start ?? null;
        const endTime = res.end ?? null;

        if (res.kind === 'lodging' && startDate && endDate) {
            entries.push({ reservation: res, rowKind: 'checkin', date: startDate, time: res.start ?? null });
            entries.push({ reservation: res, rowKind: 'checkout', date: endDate, time: res.end ?? null });
        } else {
            entries.push({ reservation: res, rowKind: 'point', date: startDate, time: res.start ?? null });
        }
    }

    const UNDATED = '\uffff';
    const groups = new Map<string, ReservationEntry[]>();
    for (const entry of entries) {
        const key = entry.date ?? UNDATED;
        const bucket = groups.get(key);
        if (bucket) bucket.push(entry);
        else groups.set(key, [entry]);
    }

    return [...groups.keys()]
        .sort((a, b) => a.localeCompare(b))
        .map((key) => ({
            date: key === UNDATED ? null : key,
            entries: groups
                .get(key)!
                .sort(
                    (a, b) =>
                        (minutesOfDay(a.time) ?? 1e9) - (minutesOfDay(b.time) ?? 1e9) ||
                        (a.reservation.name ?? '').localeCompare(b.reservation.name ?? '')
                )
        }));
}
