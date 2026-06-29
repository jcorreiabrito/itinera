/**
 * Meaningful, prefix-sortable document ids – the scheme from `docs/04-data-model.md`.
 *
 * - `trip:{uid}`
 * - `day:{tripUid}:{date}`
 * - `itin:{tripUid}:{uid}` · `chk:` · `flt:` · `res:` · `exp:` · `att:`
 * - `tpl:{uid}` (trip-independent checklist templates)
 * - `settings:app`
 *
 * **tripid convention:** A child document's `*id` embeds the trip's **bare UID**
 * (the server strips the `trip:` prefix in `api/app/couch.py`), while the
 * `tripid` **field** stores the full `trip:{uid}` so it points straight at the
 * trip document. The builders below accept a trip id in either form and
 * normalise it, mirroring the server's `normalise_trip_id`.
 *
 * Because ULIDs are monotonic by creation time, ids sort chronologically and
 * range-scan cleanly with `startkey`/`endkey`.
 */

import { ulid } from 'ulid';

import { HIGH_KEY, PREFIX_BY_TYPE, SETTINGS_ID, TYPE_BY_PREFIX } from './constants';
import type { DocType } from './constants';

/** Generate a fresh ULID (sortable-by-creation unique id). */
export function newUid(): string {
  return ulid();
}

/** Strip a leading `trip:` so we have the bare UID used inside child ids. */
export function bareTripUid(tripid: string): string {
  return tripid.startsWith('trip:') ? tripid.slice('trip:'.length) : tripid;
}

/** Return the full `trip:{uid}` form, accepting either a bare ULID or full id. */
export function fullTripid(tripid: string): string {
  return tripid.startsWith('trip:') ? tripid : `trip:${tripid}`;
}

/** Build a trip id, optionally from an existing ULID. */
export function tripid(id: string = newUid()): string {
  return `trip:${id}`;
}

/** Build a `tripDay` id: `day:{tripUid}:{date}` (one per annotated date). */
export function dayId(trip: string, date: string): string {
  return `day:${bareTripUid(trip)}:${date}`;
}

function childId(type: DocType, trip: string, id: string = newUid()): string {
  return `${PREFIX_BY_TYPE[type]}:${bareTripUid(trip)}:${id}`;
}

/** Build an `itineraryItem` id: `itin:{tripUid}:{uid}`. */
export function itineraryItemId(trip: string, id?: string): string {
  return childId('itineraryItem', trip, id);
}

/** Build a `checklistItem` id: `chk:{tripUid}:{uid}`. */
export function checklistItemId(trip: string, id?: string): string {
  return childId('checklistItem', trip, id);
}

/** Build a `flight` id: `flt:{tripUid}:{uid}`. */
export function flightId(trip: string, id?: string): string {
  return childId('flight', trip, id);
}

/** Build a `reservation` id: `res:{tripUid}:{uid}`. */
export function reservationId(trip: string, id?: string): string {
  return childId('reservation', trip, id);
}

/** Build an `expense` id: `exp:{tripUid}:{uid}`. */
export function expenseId(trip: string, id?: string): string {
  return childId('expense', trip, id);
}

/** Build an `attachment` id: `att:{tripUid}:{uid}`. */
export function attachmentId(trip: string, id?: string): string {
  return childId('attachment', trip, id);
}

/** Build a `checklistTemplate` id: `tpl:{uid}` (trip-independent). */
export function templateId(id: string = newUid()): string {
  return `tpl:${id}`;
}

/** The singleton settings id. */
export const settingsId = SETTINGS_ID;

/** Parsed components of a document id. */
export interface ParsedId {
  /** The id prefix (e.g. `exp`). */
  prefix: string;
  /** The resolved document type, when the prefix is known. */
  type?: DocType;
  /** Bare trip ULID for trip-scoped ids (absent for `tpl:`/`settings:`). */
  tripUid?: string;
  /** Full `trip:{uid}` for trip-scoped ids. */
  tripid?: string;
  /** Trailing segment: the entity ULID, or the date for `day:` ids. */
  id: string;
}

/**
 * Parse a document id back into its parts. Tolerant of unknown prefixes
 * (returns `type: undefined`).
 */
export function parseId(id: string): ParsedId {
  const [prefix, ...rest] = id.split(':');
  const type = TYPE_BY_PREFIX[prefix];

  if (prefix === 'trip') {
    return { prefix, type, tripUid: rest[0], tripid: id, id: rest[0] };
  }
  if (prefix === 'tpl' || prefix === 'settings') {
    return { prefix, type, id: rest.join(':') };
  }
  // Trip-scoped child: `{prefix}:{tripUid}:{rest...}`.
  const [tripUid, ...tail] = rest;
  return {
    prefix,
    type,
    tripUid,
    tripid: tripUid ? `trip:${tripUid}` : undefined,
    id: tail.join(':')
  };
}

/** True when an id belongs to the given trip (either trip-id form accepted). */
export function belongsToTrip(id: string, trip: string): boolean {
  return parseId(id).tripUid === bareTripUid(trip);
}

/** Inclusive `startkey`/`endkey` pair for an `allDocs` prefix range scan. */
export interface KeyRange {
  startkey: string;
  endkey: string;
}

/** Range covering every id with the given literal prefix. */
export function prefixRange(prefix: string): KeyRange {
  return { startkey: prefix, endkey: prefix + HIGH_KEY };
}

/**
 * Range covering all documents of one type for one trip, e.g.
 * `expensePrefix + exp:{tripUid}:` … `exp:{tripUid}:\ufff0`.
 */
export function tripTypeRange(type: DocType, trip: string): KeyRange {
  return prefixRange(`${PREFIX_BY_TYPE[type]}:${bareTripUid(trip)}:`);
}

/** Range covering every `trip:` document. */
export function allTripsRange(): KeyRange {
  return prefixRange('trip:');
}
