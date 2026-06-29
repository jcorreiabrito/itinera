/**
 * Local Mongo (`pouchdb-find`) indexes.
 *
 * These mirror – by `*name`, `ddoc` and field order** – the server-side indexes
 * created by FastAPI in `api/app/couch.py` (`INDEX_SPECS`). Keeping them
 * identical means a query planned locally behaves the same once replicated, and
 * the design documents converge instead of conflicting.
 *
 * Most per-trip reads use prefix range scans (no index needed); these indexes
 * back the few cross-cutting Mango queries (all trips by start date, trash by
 * `deletedAt`, category/day roll-ups).
 */

import { getDb, type Database } from './pouch';

/** A single index definition (fields + stable name/ddoc). */
export interface IndexSpec {
  fields: string[];
  name: string;
  ddoc: string;
}

/**
 * The six indexes, aligned 1:1 with the server. Do not rename without updating
 * `api/app/couch.py` in lock-step (flag the orchestrator).
 */
export const INDEX_SPECS: readonly IndexSpec[] = [
  { fields: ['type'], name: 'idx-type', ddoc: 'idx-type' },
  { fields: ['type', 'tripid'], name: 'idx-type-tripid', ddoc: 'idx-type-tripid' },
  { fields: ['type', 'startDate'], name: 'idx-type-startDate', ddoc: 'idx-type-startDate' },
  { fields: ['type', 'date'], name: 'idx-type-date', ddoc: 'idx-type-date' },
  { fields: ['type', 'category'], name: 'idx-type-category', ddoc: 'idx-type-category' },
  { fields: ['type', 'deletedAt'], name: 'idx-type-deletedAt', ddoc: 'idx-type-deletedAt' },
];

/**
 * Ensure every index in `@link INDEX_SPECS` exists locally. Idempotent –
 * `createIndex` is a no-op when the design document already matches.
 */
export async function ensureIndexes(db: Database = getDb()): Promise<void> {
  for (const spec of INDEX_SPECS) {
    await db.createIndex({
      index: {
        fields: spec.fields,
        name: spec.name,
        ddoc: spec.ddoc
      }
    });
  }
}
