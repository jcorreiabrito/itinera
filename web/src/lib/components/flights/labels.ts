import type { AirportSnapshot, Flight, FlightSegment } from '$lib/db';
import { formatTime } from '$lib/format';
import { t } from '$lib/i18n.svelte';

/** Best short label for an airport endpoint: code, else city, else dash. */
export function endpointCode(airport?: AirportSnapshot): string {
    return airport ? (airport.code ?? airport.city ?? '–') : '–';
}

/** Best human name for an airport endpoint: city, else name, else code. */
export function endpointName(airport?: AirportSnapshot): string {
    return airport ? (airport.city ?? airport.name ?? airport.code ?? '–') : '–';
}

export function firstFrom(flight: Flight): AirportSnapshot | undefined {
    return flight.segments?.[0]?.from;
}

export function lastTo(flight: Flight): AirportSnapshot | undefined {
    const segs = flight.segments ?? [];
    return segs[segs.length - 1]?.to;
}

/** First departure local ISO datetime (for sorting / date headers). */
export function firstDepart(flight: Flight): string | undefined {
    return flight.segments?.[0]?.departLocal;
}

/**
 * Infer "Outbound / Return / Flight N" labels across a trip's bookings.
 */
export function smartLabels(flights: Flight[]): string[] {
    if (flights.length === 0) return [];
    const out = flights.map(() => '');
    out[0] = t('outbound');
    const origin = firstFrom(flights[0]);
    for (let i = 1; i < flights.length; i++) {
        const dest = lastTo(flights[i]);
        const sameCode = origin?.code && dest?.code && origin.code === dest.code;
        const sameCity = origin?.city && dest?.city && origin.city === dest.city;
        out[i] = sameCode || sameCity ? t('return_flight') : t('flight_n', { n: String(i + 1) });
    }
    return out;
}

/** "Lufthansa LH388" from a segment (either part optional). */
export function airlineLabel(seg: FlightSegment): string {
    return [seg?.airline, seg?.flightNumber].filter(Boolean).join(' ');
}

/** Accessible label for a single leg. */
export function legAriaLabel(seg: FlightSegment): string {
    const airline = airlineLabel(seg);
    const from = endpointName(seg.from) || 'origin';
    const to = endpointName(seg.to) || 'destination';
    const dep = formatTime(seg.departLocal);
    const arr = formatTime(seg.arriveLocal);
    const head = airline ? `${airline},` : '';
    const fromPart = dep ? `${head} ${from} at ${dep}` : head;
    const toPart = arr ? ` to ${arr} at ${to}` : '';
    const seat = seg.seat ? `, seat ${seg.seat}` : '';
    return `${fromPart}${toPart}${seat}`;
}

/** One-line accessible summary for the whole booking card. */
export function flightAriaSummary(computed: {
    route: string;
    stops: number;
    segments: { durationText: string }[];
}): string {
    const route = computed.route || t('flights');
    const stops =
        computed.stops > 0
            ? `, ${t(computed.stops > 1 ? 'stops_count_plural' : 'stops_count', { n: String(computed.stops) })}`
            : `, ${t('direct_flight')}`;
    const durations = computed.segments
        .map((s) => s.durationText)
        .filter(Boolean)
        .join(' + ');
    const dur = durations ? `, ${durations}` : '';
    return `${t('flights')} ${route}${stops}${dur}`;
}
