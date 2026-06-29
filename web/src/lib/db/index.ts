/**
 * `$lib/db` – the public, typed data + offline-sync API for the whole app.
 *
 * The UI imports everything it needs from here: repositories (one namespace per
 * page area), the reactive `@link syncStatus` store, document types & Zod
 * schemas, id builders, and the pure date / money / airport helpers.
 *
 * Bootstrap once on app start with `@link initDb`, then read/write exclusively
 * through the repositories – every operation hits the local PouchDB first and
 * syncs in the background.
 *
 * ```ts
 * import { initDb, trips, syncStatus } from '$lib/db';
 * await initDb();              // local db + persist + indexes + migrate + sync
 * const sections = await trips.sections();
 * ```
 */

// --- Repositories (one namespace per page area) ----------------------------
export * as trips from './repositories/trips';
export * as itinerary from './repositories/itinerary';
export * as checklist from './repositories/checklist';
export * as flights from './repositories/flights';
export * as reservations from './repositories/reservations';
export * as expenses from './repositories/expenses';
export * as attachments from './repositories/attachments';
export * as settings from './repositories/settings';
export * as trash from './repositories/trash';

// --- Document types, schemas, enums ----------------------------------------
export * from './schemas';

// --- Id builders / parsers ------------------------------------------------
export * from './ids';

// --- Pure helpers (date/time, money, airports, conflict policy) -----------
export * from './datetime';
export * from './money';
export * from './airports';
export * from './conflicts';

// --- Constants ------------------------------------------------------------
export {
  DB_NAME,
  REMOTE_URL,
  SCHEMA_VERSION,
  SETTINGS_ID,
  DOC_TYPES,
  TRIP_CHILD_TYPES,
  PREFIX_BY_TYPE,
  TYPE_BY_PREFIX,
  CHECKLIST_PRESET_GROUPS,
  RESERVATION_EXPENSE_CATEGORY,
  FLIGHT_EXPENSE_CATEGORY
} from './constants';
export type { DocType, TripChildType } from './constants';

// --- Database lifecycle ---------------------------------------------------
export {
  getDb,
  configureDb,
  createLocalDb,
  createRemoteDb,
  requestPersistentStorage,
  storageEstimate,
  destroyDb
} from './pouch';
export type { Database, DbOptions, PouchStatic } from './pouch';

export { ensureIndexes, INDEX_SPECS } from './indexes';
export type { IndexSpec } from './indexes';

export { migrateDoc, MIGRATIONS } from './migrations';
export type { Migration, MigratableDoc, MigrationResult } from './migrations';

// --- Low-level document helpers (for advanced/escape-hatch use) -----------
export {
  nowIso,
  getDoc,
  putDoc,
  createDoc,
  patchDoc,
  findDocs,
  prefixScan,
  rangeScan,
  listTripDocs,
  bulkPut,
  softDeleteDoc,
  restoreDoc,
  purgeDoc,
  runMigrations,
  subscribeChanges
} from './base';
export type { ReadOptions } from './base';

// --- Sync + conflict review ------------------------------------------------
export {
  syncStatus,
  startSync,
  stopSync,
  syncNow,
  listConflicts,
  markConflictReviewed,
  resolveAllConflicts,
  resolveDocConflicts,
  currentSyncStatus
} from './sync';
export type { SyncState, SyncStatus } from './sync';

import {
  configureDb,
  createLocalDb,
  requestPersistentStorage,
  type Database,
  type DbOptions
} from './pouch';
import { ensureIndexes } from './indexes';
import { runMigrations } from './base';
import { startSync } from './sync';

/** Options for `@link initDb`. */
export interface InitOptions extends DbOptions {
  /** Start live replication after bootstrap (default `true`). */
  sync?: boolean;
}

/**
 * One-call bootstrap for the data layer:
 * 1. (optional) configure the PouchDB implementation/adapter/name,
 * 2. create the local database,
 * 3. request persistent storage,
 * 4. ensure the Mango indexes,
 * 5. run schema migrations,
 * 6. start live sync (unless `sync: false`).
 *
 * Safe to call once at app start. Returns the local database handle.
 */
export async function initDb(options: InitOptions = {}): Promise<Database> {
  const { sync, ...dbOptions } = options;
  if (Object.keys(dbOptions).length > 0) configureDb(dbOptions);

  const db = createLocalDb();
  await requestPersistentStorage();
  await ensureIndexes(db);
  await runMigrations(db);
  if (sync !== false) startSync(db);
  return db;
}
