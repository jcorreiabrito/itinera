/**
 * Client-side schema migrations.
 *
 * Every document carries a `schemaVersion`. On startup, any document below the
 * current `@link SCHEMA_VERSION` is transformed locally by the pure functions
 * here, then re-synced (see `docs/05-offline-and-sync.md`). Migrations are pure
 * and versioned so they are easy to test and reason about.
 *
 * This module holds **only the pure transform logic**; the startup runner that
 * reads/writes PouchDB lives in `base.ts`.
 */

import { SCHEMA_VERSION } from './constants';

/** A loosely-typed document during migration (we only touch known fields). */
export type MigratableDoc = Record<string, unknown> & {
  _id?: string;
  type?: string;
  schemaVersion?: number;
};

/** A migration transforms a document from version `n-1` to version `n`. */
export type Migration = (doc: MigratableDoc) => MigratableDoc;

/**
 * v0 → v1 baseline.
 *
 * Establishes the shared invariants for documents created before
 * `schemaVersion` existed (or created as raw v0): a present `deletedAt` (null),
 * and the boolean defaults each type relies on in queries.
 */
function migrateToV1(doc: MigratableDoc): MigratableDoc {
  const next: MigratableDoc = { ...doc, schemaVersion: 1 };
  if (next.deletedAt === undefined) next.deletedAt = null;

  switch (next.type) {
    case 'trip':
      if (next.archived === undefined) next.archived = false;
      break;
    case 'itineraryItem':
      if (next.allDay === undefined) next.allDay = false;
      break;
    case 'checklistItem':
      if (next.done === undefined) next.done = false;
      break;
    case 'expense':
      if (next.paid === undefined) next.paid = false;
      break;
    default:
      break;
  }
  return next;
}

/**
 * Registry of migrations keyed by the version they *produce*. To migrate a
 * document we apply, in order, every migration whose key is greater than the
 * document's current version.
 */
export const MIGRATIONS: Record<number, Migration> = {
  1: migrateToV1
};

/** Result of attempting to migrate a single document. */
export interface MigrationResult {
  doc: MigratableDoc;
  /** True when the document was changed and must be written back. */
  changed: boolean;
}

/**
 * Migrate one document up to `target` (default: `@link SCHEMA_VERSION`).
 * Returns the (possibly new) document and whether anything changed.
 */
export function migrateDoc(doc: MigratableDoc, target: number = SCHEMA_VERSION): MigrationResult {
  const from = typeof doc.schemaVersion === 'number' ? doc.schemaVersion : 0;
  if (from >= target) return { doc, changed: false };

  let current = doc;
  for (let v = from + 1; v <= target; v++) {
    const migration = MIGRATIONS[v];
    if (migration) current = migration(current);
  }
  // Guarantee the version lands exactly on target even if a step was missing.
  if (current.schemaVersion !== target) current = { ...current, schemaVersion: target };
  return { doc: current, changed: true };
}
