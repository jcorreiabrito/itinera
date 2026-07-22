/**
 * Base document helpers shared by every repository.
 *
 * Centralises timestamp stamping, schema-version stamping, write-time Zod
 * validation, soft deletes/restore/purge, and the two read primitives: the data
 * model favours **prefix range scans** (fast, index-free) for trip-scoped data
 * and **Mango finds** for the few cross-cutting queries. Also hosts the startup
 * migration runner.
 *
 * All reads exclude soft-deleted documents (`deletedAt != null`) unless asked
 * otherwise – the Trash view opts in.
 */

import { DateTime } from 'luxon';

import { SCHEMA_VERSION } from './constants';
import { migrateDoc } from './migrations';
import { getDb, type Database } from './pouch';
import { prefixRange, tripTypeRange, type KeyRange } from './ids';
import { validateDoc, type AnyDoc } from './schemas';
import type { DocType } from './constants';

/** Current timestamp as a UTC ISO string (chronologically sortable). */
export function nowIso(): string {
  return DateTime.utc().toISO() ?? new Date().toISOString();
}

/** A document plus the CouchDB read metadata PouchDB returns. */
type Stored<T> = T & { _id: string; _rev: string; _conflicts?: string[] };

/** Minimal cancelable handle (a PouchDB change feed / replication object). */
export interface Cancelable {
  cancel(): void;
}

/** The slice of a PouchDB change event this layer consumes. */
export interface ChangeEvent {
  id: string;
  doc?: unknown;
  deleted?: boolean;
}

function isDesignDoc(id: string): boolean {
  return id.startsWith('_design/');
}

function notDeleted(doc: { deletedAt?: string | null }): boolean {
  return doc.deletedAt == null;
}

/** Fetch a document by id, or `null` when it does not exist. */
export async function getDoc<T extends AnyDoc>(
  id: string,
  db: Database = getDb()
): Promise<Stored<T> | null> {
  try {
    return (await db.get(id)) as unknown as Stored<T>;
  } catch (err) {
    if ((err as { status?: number })?.status === 404) return null;
    throw err;
  }
}

/**
 * Write a fully-formed document. Refreshes `updatedAt`, validates against the
 * type's schema, and returns the document with its new `_rev`.
 */
export async function putDoc<T extends AnyDoc>(
  doc: T,
  db: Database = getDb(),
  { validate = true }: { validate?: boolean } = {}
): Promise<Stored<T>> {
  const stamped = { ...doc, updatedAt: nowIso() } as T;
  const toWrite = validate ? validateDoc(stamped) : stamped;
  const res = await db.put(toWrite as unknown as Parameters<typeof db.put>[0]);
  return { ...toWrite, _id: res.id, _rev: res.rev } as Stored<T>;
}

/**
 * Stamp the shared audit fields onto a new document and persist it.
 * `input` carries the type-specific fields plus `_id` and `type`.
 */
export async function createDoc<T extends AnyDoc>(
  input: Omit<T, 'createdAt' | 'updatedAt' | 'deletedAt' | '_schemaVersion' | '_rev'>,
  db: Database = getDb()
): Promise<Stored<T>> {
  const now = nowIso();
  const doc = {
    ...input,
    createdAt: now,
    updatedAt: now,
    deletedAt: null,
    schemaVersion: SCHEMA_VERSION
  } as unknown as T;
  return putDoc(doc, db);
}

/** Read-modify-write a document by id with a shallow patch (or updater fn). Retries on 409 conflicts. */
export async function patchDoc<T extends AnyDoc>(
  id: string,
  patch: Partial<T> | ((doc: Stored<T>) => Partial<T>),
  db: Database = getDb(),
  retries = 3
): Promise<Stored<T>> {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const current = await getDoc<T>(id, db);
      if (!current) throw new Error(`patchDoc: document not found: ${id}`);
      const delta = typeof patch === 'function' ? patch(current) : patch;
      return await putDoc({ ...current, ...delta } as T, db);
    } catch (err) {
      const status = (err as { status?: number })?.status;
      if (status === 409 && attempt < retries) {
        await new Promise((r) => setTimeout(r, 50 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
  throw new Error(`patchDoc failed after ${retries} retries for ${id}`);
}

/** Soft-delete a document (sets `deletedAt` -> goes to Trash, hidden from reads. */
export async function softDeleteDoc<T extends AnyDoc>(
  id: string,
  db: Database = getDb()
): Promise<Stored<T>> {
  return patchDoc<T>(id, { deletedAt: nowIso() } as Partial<T>, db);
}

/** Restore a soft-deleted document (clears `deletedAt`). */
export async function restoreDoc<T extends AnyDoc>(
  id: string,
  db: Database = getDb()
): Promise<Stored<T>> {
  return patchDoc<T>(id, { deletedAt: null } as Partial<T>, db);
}

/** Permanently remove a document (CouchDB tombstone replicates to all devices). */
export async function purgeDoc(id: string, db: Database = getDb()): Promise<void> {
  const doc = await db.get(id);
  await db.remove(doc);
}

/** Options shared by the scan/find helpers. */
export interface ReadOptions {
  /** Include soft-deleted documents (default `false`). */
  includeDeleted?: boolean;
}

/** Range-scan documents by id, excluding design docs (and deleted, by default). */
export async function rangeScan<T extends AnyDoc>(
  range: KeyRange,
  { includeDeleted = false }: ReadOptions = {},
  db: Database = getDb()
): Promise<Stored<T>[]> {
  const res = await db.allDocs({ include_docs: true, ...range });
  const out: Stored<T>[] = [];
  for (const row of res.rows) {
    const doc = row.doc as unknown as Stored<T> | undefined;
    if (!doc || isDesignDoc(doc._id)) continue;
    if (!includeDeleted && !notDeleted(doc)) continue;
    out.push(doc);
  }
  return out;
}

/** Scan every document sharing a literal id prefix. */
export function prefixScan<T extends AnyDoc>(
  prefix: string,
  opts: ReadOptions = {},
  db: Database = getDb()
): Promise<Stored<T>[]> {
  return rangeScan<T>(prefixRange(prefix), opts, db);
}

/**
 * All documents of one `type` for one trip, via the
 * `{prefix}:{tripid}` range scan (no index required).
 */
export function listTripDocs<T extends AnyDoc>(
  type: DocType,
  tripid: string,
  opts: ReadOptions = {},
  db: Database = getDb()
): Promise<Stored<T>[]> {
  return rangeScan<T>(tripTypeRange(type, tripid), opts, db);
}

/**
 * Mango find by selector. Excludes soft-deleted documents by default by adding
 * `deletedAt: null` to the selector.
 *
 * **Sorting requires `use_index`.** The auto-injected `deletedAt: null` filter
 * can stop Mango from auto-selecting an index for a `sort`, which surfaces as a
 * cryptic runtime "no matching index" error. To avoid that, a `sort` must be
 * paired with the `use_index` that covers it (the extra `deletedAt` equality is
 * then just an in-memory post-filter). Passing `sort` without `use_index`
 * throws a clear error instead.
 */
export async function findDocs<T extends AnyDoc>(
  selector: Record<string, unknown>,
  opts: {
    sort?: Array<string | { [field: string]: 'asc' | 'desc' }>;
    limit?: number;
    includeDeleted?: boolean;
    use_index?: string;
  } = {},
  db: Database = getDb()
): Promise<Stored<T>[]> {
  const { includeDeleted = false, sort, limit, use_index } = opts;
  if (sort && !use_index) {
    throw new Error(
      `findDocs: a \`sort\` requires a matching \`use_index\` (the auto-injected ` +
        '`deletedAt: null` filter otherwise yields a "no matching index" error).'
    );
  }
  const fullSelector = includeDeleted ? selector : { ...selector, deletedAt: null };
  const res = await db.find({ selector: fullSelector, sort, limit, use_index });
  return res.docs as unknown as Stored<T>[];
}

/** Bulk-write documents (used by duplicate, template apply, migrations). */
export async function bulkPut(docs: AnyDoc[], db: Database = getDb()) {
  return db.bulkDocs(docs as unknown as Parameters<typeof db.bulkDocs>[0]);
}

/** Every soft-deleted document across all types (for the Trash view). */
export async function listDeleted(db: Database = getDb()): Promise<Stored<AnyDoc>[]> {
  const res = await db.allDocs({ include_docs: true });
  const out: Stored<AnyDoc>[] = [];
  for (const row of res.rows) {
    const doc = row.doc as unknown as Stored<AnyDoc> | undefined;
    if (!doc || isDesignDoc(doc._id)) continue;
    if (doc.deletedAt != null) out.push(doc);
  }
  return out;
}

/**
 * Migrate every local document below {@link SCHEMA_VERSION} on startup, then
 * write the changed ones back (they re-sync). Returns how many were migrated.
 */
export async function runMigrations(db: Database = getDb()): Promise<number> {
  const res = await db.allDocs({ include_docs: true });
  const changed: AnyDoc[] = [];
  for (const row of res.rows) {
    const doc = row.doc as unknown as (AnyDoc & { _id: string }) | undefined;
    if (!doc || isDesignDoc(doc._id)) continue;
    const result = migrateDoc(doc);
    if (result.changed) changed.push(result.doc as unknown as AnyDoc);
  }
  if (changed.length) await bulkPut(changed, db);
  return changed.length;
}

/**
 * Subscribe to local changes. Returns the PouchDB change feed so callers can
 * `.cancel()`. Repositories use this to keep derived views live.
 */
export function subscribeChanges(
  onChange: (change: ChangeEvent) => void,
  db: Database = getDb()
): Cancelable {
  return db
    .changes({ since: 'now', live: true, include_docs: true })
    .on('change', onChange) as unknown as Cancelable;
}
