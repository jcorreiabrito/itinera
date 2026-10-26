/**
 * The print cover's check-in facts and the QR payloads drawn from them.
 *
 * Pure on purpose: the route owns loading, `qrcode` owns drawing, and this
 * module only decides which stored fields reach paper. A QR payload is built
 * from what the booking already holds — a stored check-in URL, or a short text
 * line naming the carrier and reference — never from an API base URL and never
 * by fetching anything. A booking with no reference has nothing a desk can scan,
 * so it gets no code at all.
 */

import type { Flight, Reservation } from '$lib/db';
import { isStay } from '$lib/wallet';

/** One segment of a flight, reduced to the two fields a label needs. */
export interface CoverFlightSegment {
	/** Stored airline name, empty when the booking has none. */
	carrier: string;
	/** Stored flight number, empty when the booking has none. */
	number: string;
}

/** A flight booking as the cover lists it. */
export interface CoverFlightRow {
	id: string;
	reference: string;
	segments: CoverFlightSegment[];
}

/** A lodging reservation as the cover lists it. */
export interface CoverStayRow {
	id: string;
	/** Property name, empty when not stored. */
	name: string;
	/** Street address, empty when not stored. */
	address: string;
	/** Contact phone, empty when not stored. */
	phone: string;
	/** Confirmation reference, empty when not stored. */
	reference: string;
}

/** Everything the cover says at a check-in desk. */
export interface CoverFacts {
	flights: CoverFlightRow[];
	stays: CoverStayRow[];
}

/** The kinds of booking a cover QR can stand for. */
export type QrKind = 'flight' | 'stay';

/** The minimum a QR payload needs: a reference, and optionally a stored URL. */
export interface QrSubject {
	kind: QrKind;
	reference?: string | null;
	/** Human identification: airline + flight number, or property name. */
	label?: string | null;
	/** A check-in or property URL already stored on the booking. */
	url?: string | null;
}

/** One QR, before it has been drawn. */
export interface PrintQrCode {
	/** Source document id; also the stable key between repaints. */
	id: string;
	kind: QrKind;
	reference: string;
	/** Text under the image, naming the booking the code belongs to. */
	caption: string;
	/** What the code encodes. */
	payload: string;
}

/** A QR with the PNG data URI the cover renders as an `<img>`. */
export interface PrintQrImage extends PrintQrCode {
	dataUrl: string;
}

function storedSegments(flight: Flight): CoverFlightSegment[] {
	const segments: CoverFlightSegment[] = [];
	for (const segment of flight.segments ?? []) {
		const carrier = segment.airline?.trim() ?? '';
		const number = segment.flightNumber?.trim() ?? '';
		if (carrier || number) segments.push({ carrier, number });
	}
	return segments;
}

function segmentLabels(segments: readonly CoverFlightSegment[]): string[] {
	return segments
		.map((segment) => [segment.carrier, segment.number].filter(Boolean).join(' '))
		.filter(Boolean);
}

/** "LATAM LA8084 · Iberia IB3110" — the flight line a traveller recognises. */
export function flightRowLabel(row: CoverFlightRow): string {
	return segmentLabels(row.segments).join(' · ');
}

/**
 * Split bookings into the two lists the cover prints. Flights need a
 * confirmation reference; stays need something a desk can use — a name, an
 * address or a phone. A booking that has none of those is left off rather than
 * printed as an empty line.
 */
export function coverFacts(
	flights: readonly Flight[],
	reservations: readonly Reservation[]
): CoverFacts {
	const flightRows: CoverFlightRow[] = [];
	for (const flight of flights) {
		const reference = flight.bookingRef?.trim();
		if (!reference) continue;
		flightRows.push({ id: flight._id, reference, segments: storedSegments(flight) });
	}

	const stayRows: CoverStayRow[] = [];
	for (const reservation of reservations) {
		if (!isStay(reservation)) continue;
		const name = reservation.name?.trim() ?? '';
		const address = reservation.location?.address?.trim() ?? '';
		const phone = reservation.contact?.phone?.trim() ?? '';
		if (!name && !address && !phone) continue;
		stayRows.push({
			id: reservation._id,
			name,
			address,
			phone,
			reference: reservation.confirmation?.trim() ?? ''
		});
	}

	return { flights: flightRows, stays: stayRows };
}

/**
 * What one QR carries.
 *
 * A stored `https://` URL is used as it is — that is the airline's or property's
 * own check-in page, already on the device. Without one the payload is a short
 * uppercase text line identifying the booking, because the alternative would be
 * inventing a domain that resolves nowhere. No reference means no code.
 */
export function qrPayload(subject: QrSubject): string | null {
	const reference = subject.reference?.trim();
	if (!reference) return null;

	const url = subject.url?.trim();
	if (url && /^https?:\/\//i.test(url)) return url;

	const prefix = subject.kind === 'flight' ? 'CHECK-IN' : 'BOOKING';
	return [prefix, subject.label?.trim(), reference].filter(Boolean).join(' ');
}

/** One QR per flight reference and one per stay confirmation. */
export function qrCodes(
	flights: readonly Flight[],
	reservations: readonly Reservation[]
): PrintQrCode[] {
	const codes: PrintQrCode[] = [];

	for (const flight of flights) {
		const reference = flight.bookingRef?.trim();
		if (!reference) continue;
		const label = segmentLabels(storedSegments(flight)).join(' · ');
		const payload = qrPayload({
			kind: 'flight',
			reference,
			label,
			url: flight.checkInUrl
		});
		if (!payload) continue;
		codes.push({
			id: flight._id,
			kind: 'flight',
			reference,
			caption: [label, reference].filter(Boolean).join(' · '),
			payload
		});
	}

	for (const reservation of reservations) {
		if (!isStay(reservation)) continue;
		const reference = reservation.confirmation?.trim();
		if (!reference) continue;
		const name = reservation.name?.trim() ?? '';
		const payload = qrPayload({
			kind: 'stay',
			reference,
			label: name,
			url: reservation.contact?.url
		});
		if (!payload) continue;
		codes.push({
			id: reservation._id,
			kind: 'stay',
			reference,
			caption: [name, reference].filter(Boolean).join(' · '),
			payload
		});
	}

	return codes;
}
