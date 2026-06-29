/**
 * Shared constants for the Itinera local-first data layer.
 *
 * Centralises the database identifiers, the document-type → id-prefix mapping,
 * and the schema version so every other module agrees on these values. Kept
 * dependency-free (no PouchDB import) so it is safe to import from pure,
 * unit-tested logic.
 *
 * See `docs/04-data-model.md` and `docs/05-offline-and-sync.md`.
 */

/** Local PouchDB database name (IndexedDB-backed in the browser). */
export const DB_NAME = 'itinera';

/**
 * Remote CouchDB endpoint – **same-origin**, proxied by Caddy which injects the
 * single server-side credential. The browser never holds CouchDB credentials.
 */
export const REMOTE_URL = '/db/itinera';

/**
 * Current document schema version. Every document we write carries this in
 * `schemaVersion`; older docs are migrated on load (see `migrations.ts`).
 */
export const SCHEMA_VERSION = 1;

/** Singleton settings document id. */
export const SETTINGS_ID = 'settings:app';

/**
 * High Unicode sentinel used to bound prefix range scans
 * (`startkey="exp:{trip}"`, `endkey="exp:{trip}:\ufff0"`). Matches the server's
 * `HIGH` in `api/app/couch.py`.
 */
export const HIGH_KEY = '\ufff0';

/** Every document `type` we know about, in a stable order. */
export const DOC_TYPES = [
  'trip',
  'tripDay',
  'itineraryItem',
  'checklistItem',
  'flight',
  'reservation',
  'expense',
  'attachment',
  'checklistTemplate',
  'settings'
] as const;

export type DocType = (typeof DOC_TYPES)[number];

/**
 * Document type → id prefix. Prefixes match the server's
 * `TRIP_CHILD_PREFIXES` (`day/itin/chk/flt/res/exp/att`) plus the top-level
 * `trip`, `tpl` and `settings` documents, so prefix range scans behave
 * identically on both sides.
 */
export const PREFIX_BY_TYPE: Record<DocType, string> = {
  trip: 'trip',
  tripDay: 'day',
  itineraryItem: 'itin',
  checklistItem: 'chk',
  flight: 'flt',
  reservation: 'res',
  expense: 'exp',
  attachment: 'att',
  checklistTemplate: 'tpl',
  settings: 'settings'
};

/** Inverse of `@link PREFIX_BY_TYPE`: id prefix → document type. */
export const TYPE_BY_PREFIX: Record<string, DocType> = Object.fromEntries(
  Object.entries(PREFIX_BY_TYPE).map(([type, prefix]) => [prefix, type as DocType])
) as Record<string, DocType>;

/** Document types that belong to a trip (carry a `tripid` and a `{prefix}:{tripUid}:` id). */
export const TRIP_CHILD_TYPES = [
  'tripDay',
  'itineraryItem',
  'checklistItem',
  'flight',
  'reservation',
  'expense',
  'attachment'
] as const;

export type TripChildType = (typeof TRIP_CHILD_TYPES)[number];

/** Preset checklist groups (custom groups are also allowed). */
export const CHECKLIST_PRESET_GROUPS = ['Packing', 'Documents', 'Pre-trip', 'To buy'] as const;

/**
 * Maps a reservation `kind` to the expense `category` used for its linked
 * expense, so booking costs roll into the budget under the right bucket
 * (see `docs/11-page-reservations.md`).
 */
export const RESERVATION_EXPENSE_CATEGORY: Record<string, string> = {
  lodging: 'lodging',
  car: 'transport',
  restaurant: 'food',
  activity: 'activities',
  transport: 'transport',
  other: 'other'
};

/** Expense category used for the expense linked to a flight's cost. */
export const FLIGHT_EXPENSE_CATEGORY = 'transport';
