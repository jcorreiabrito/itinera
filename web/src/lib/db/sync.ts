/**
 * Live bidirectional sync + the sync-status store + conflict resolution.
 *
 * Replication is `{ live: true, retry: true }` to the same-origin remote, so the
 * UI always reads/writes the local database while bytes move in the background
 * and reconnects are automatic (see `docs/05-offline-and-sync.md`).
 *
 * Conflicts are resolved deterministically by last-write-wins (`updatedAt`). The
 * winner is made authoritative and each losing revision's **content is retained**
 * (snapshotted into a device-local log) before its conflict branch is **cleared**
 * from the live revision tree. Clearing is essential: without it a document stays
 * perpetually conflicted and is re-resolved forever. The retained losers are
 * surfaced by `@link listConflicts` for a future "Review changes" screen and
 * dismissed via `@link markConflictReviewed`.
 *
 * The `@link syncStatus` store shape is the contract consumed by the
 * `SyncStatusPill` UI component (see the db README).
 */

import { get, writable, type Readable } from 'svelte/store';

import { planConflictResolution, type ConflictReport } from './conflicts';
import { getDb, createRemoteDb, type Database } from './pouch';
import type { AnyDoc } from './schemas';

/** The discrete states surfaced in the header pill. */
export type SyncState = 'synced' | 'syncing' | 'offline' | 'pending' | 'error';

/** Full sync status snapshot. */
export interface SyncStatus {
  /** Current high-level state. */
  state: SyncState;
  /** ISO timestamp of the last successful sync, or `null` if never. */
  lastSyncedAt: string | null;
  /** Whether local changes are waiting to be pushed. */
  pendingChanges: boolean;
  /** Last replication error message, when `state === 'error'`. */
  error: string | null;
}

const LAST_SYNCED_KEY = 'itinera:lastSyncedAt';

function loadLastSynced(): string | null {
  if (typeof localStorage === 'undefined') return null;
  return localStorage.getItem(LAST_SYNCED_KEY);
}

function saveLastSynced(iso: string): void {
  if (typeof localStorage !== 'undefined') localStorage.setItem(LAST_SYNCED_KEY, iso);
}

function isOnline(): boolean {
  return typeof navigator === 'undefined' ? true : navigator.onLine;
}

const store = writable<SyncStatus>({
  state: isOnline() ? 'syncing' : 'offline',
  lastSyncedAt: loadLastSynced(),
  pendingChanges: false,
  error: null
});

/** Reactive sync status for the UI (read-only). */
export const syncStatus: Readable<SyncStatus> = { subscribe: store.subscribe };

function patch(next: Partial<SyncStatus>): void {
  store.update((s) => ({ ...s, ...next }));
}

function markSynced(): void {
  const iso = new Date().toISOString();
  saveLastSynced(iso);
  patch({ state: 'synced', lastSyncedAt: iso, pendingChanges: false, error: null });
}

// --- Conflict resolution ---------------------------------------------------

interface ConflictAware {
  _id: string;
  _rev: string;
  _conflicts?: string[];
  updatedAt?: string | null;
}

type Stored = AnyDoc & { _id: string; _rev: string; updatedAt?: string | null };

/**
 * Device-local store of retained losing revisions.
 *
 * A single `_local/` document keyed by docId. Local docs do not replicate and
 * never appear in `allDocs` scans, so they are an ideal side-band log that the
 * deterministic per-device resolution can append to without polluting the data
 * set or itself conflicting. Read by id; surfaced via `@link listConflicts`.
 */
const CONFLICT_LOG_ID = '_local/itinera-conflicts';

/** One retained losing revision: a full content snapshot for the review screen. */
interface RetainedLoser {
  rev: string;
  updatedAt: string | null;
  retainedAt: string;
  doc: Record<string, unknown>;
}

/** Per-document retained-conflict entry. */
interface ConflictLogEntry {
  docId: string;
  /** The winning revision at the most recent resolution. */
  winnerRev: string;
  resolvedAt: string;
  losers: RetainedLoser[];
}

/** The single local document accumulating retained conflicts, keyed by docId. */
interface ConflictLog {
  _id: string;
  _rev?: string;
  entries: Record<string, ConflictLogEntry>;
}

function statusOf(err: unknown): number | undefined {
  return (err as { status?: number })?.status;
}

/** Drop CouchDB conflict metadata from a snapshot (keep `_id`/`_rev` for reference). */
function snapshot(doc: ConflictAware): Record<string, unknown> {
  const copy = { ...(doc as unknown as Record<string, unknown>) };
  delete copy._conflicts;
  return copy;
}

async function readConflictLog(db: Database): Promise<ConflictLog> {
  try {
    return (await db.get(CONFLICT_LOG_ID)) as unknown as ConflictLog;
  } catch (err) {
    if (statusOf(err) === 404) return { _id: CONFLICT_LOG_ID, entries: {} };
    throw err;
  }
}

/** Append losing revisions to the local log (dedup by rev), with a small 409 retry. */
async function retainLosers(
  db: Database,
  id: string,
  winnerRev: string,
  losers: ConflictAware[]
): Promise<void> {
  if (losers.length === 0) return;
  const now = new Date().toISOString();
  for (let attempt = 0; attempt < 3; attempt++) {
    const log = await readConflictLog(db);
    const prior = log.entries[id]?.losers ?? [];
    const seen = new Set(prior.map((l) => l.rev));
    const merged = [...prior];
    for (const loser of losers) {
      if (seen.has(loser._rev)) continue;
      seen.add(loser._rev);
      merged.push({
        rev: loser._rev,
        updatedAt: loser.updatedAt ?? null,
        retainedAt: now,
        doc: snapshot(loser)
      });
    }
    log.entries[id] = { docId: id, winnerRev, resolvedAt: now, losers: merged };
    try {
      await db.put(log as unknown as Parameters<typeof db.put>[0]);
      return;
    } catch (err) {
      if (statusOf(err) === 409 && attempt < 2) continue; // concurrent write → re-read
      throw err;
    }
  }
}

/**
 * Resolve all conflicts on one document by last-write-wins, then **clear** them.
 *
 * 1. Snapshot every losing revision's content into the local conflict log (so it
 *    is never lost – see `@link listConflicts`).
 * 2. If the winner is a conflict branch, re-write its body on top of the default
 *    branch so it becomes authoritative on every device.
 * 3. Remove each conflict branch (`db.remove(id, rev)`), so the document is no
 *    longer reported as conflicted – preventing perpetual re-resolution.
 *
 * Idempotent: once the branches are cleared, a re-entry sees no `_conflicts` and
 * returns immediately.
 */
export async function resolveDocConflicts(id: string, db: Database = getDb()): Promise<void> {
  const doc = (await db.get(id, { conflicts: true })) as unknown as ConflictAware;
  const conflicts = doc._conflicts ?? [];
  if (conflicts.length === 0) return;

  const branches = await Promise.all(
    conflicts.map(async (rev) => (await db.get(id, { rev })) as unknown as ConflictAware)
  );
  const plan = planConflictResolution(doc, branches);

  // 1. Retain losing content *before* clearing (durable, device-local).
  await retainLosers(db, id, plan.winner._rev, plan.losers);

  // 2. Make the winner authoritative on the default branch when it isn't already.
  if (plan.rewriteWinner) {
    const winnerDoc = branches.find((d) => d._rev === plan.winner._rev);
    if (winnerDoc) {
      const body = snapshot(winnerDoc);
      body._id = id;
      body._rev = doc._rev; // sits on top of the current default branch
      await db.put(body as unknown as Parameters<typeof db.put>[0]);
    }
  }

  // 3. Clear every conflict branch so the document stops being conflicted.
  for (const rev of plan.clearRevs) {
    try {
      await db.remove(id, rev);
    } catch (err) {
      // A branch already cleared by a concurrent pass is fine.
      if (statusOf(err) !== 404) throw err;
    }
  }
}

/** Run conflict resolution across every currently-conflicted document. */
export async function resolveAllConflicts(db: Database = getDb()): Promise<number> {
  const res = await db.allDocs({ include_docs: true, conflicts: true });
  let resolved = 0;
  for (const row of res.rows) {
    const doc = row.doc as unknown as ConflictAware | undefined;
    if (doc?._conflicts?.length) {
      await resolveDocConflicts(doc._id, db);
      resolved += 1;
    }
  }
  return resolved;
}

/**
 * List documents whose conflicts have been resolved but **not yet reviewed**,
 * with the current authoritative `winner` and the retained `losers`, for a
 * future "Review changes" UI. Reads the device-local conflict log (conflicts are
 * cleared from the live tree, so this no longer scans `_conflicts`). Dismiss an
 * entry with `@link markConflictReviewed`.
 */
export async function listConflicts(db: Database = getDb()): Promise<ConflictReport<Stored>[]> {
  const log = await readConflictLog(db);
  const reports: ConflictReport<Stored>[] = [];
  for (const entry of Object.values(log.entries)) {
    if (!entry.losers.length) continue;
    const losers = entry.losers.map((l) => l.doc as unknown as Stored);
    let winner: Stored | undefined;
    try {
      winner = (await db.get(entry.docId)) as unknown as Stored;
    } catch (err) {
      if (statusOf(err) !== 404) throw err; // doc purged → fall back to newest loser
    }
    reports.push({
      id: entry.docId,
      winner: winner ?? losers[losers.length - 1],
      losers
    });
  }
  return reports;
}

/** Dismiss a reviewed conflict: drop its retained losers from the local log. */
export async function markConflictReviewed(id: string, db: Database = getDb()): Promise<void> {
  const log = await readConflictLog(db);
  if (!log.entries[id]) return;
  delete log.entries[id];
  try {
    await db.put(log as unknown as Parameters<typeof db.put>[0]);
  } catch (err) {
    if (statusOf(err) !== 409) throw err; // a concurrent resolve re-added entries → leave them
  }
}

// --- Replication -----------------------------------------------------------

/** Minimal cancelable handle (replication / change feed). */
interface Cancelable {
  cancel(): void;
}

let handler: Cancelable | null = null;
let changeFeed: Cancelable | null = null;
let started = false;

async function handleDocChange(docId: string, db: Database): Promise<void> {
  try {
    await resolveDocConflicts(docId, db);
  } catch {
    // Best-effort: a transient read race shouldn't break the sync loop.
  }
}

/** Begin live, retrying, bidirectional replication. Idempotent. */
export function startSync(db: Database = getDb()): void {
  if (started) return;
  started = true;

  const remote = createRemoteDb();

  const sync = db.sync(remote, { live: true, retry: true });
  sync
    .on('active', () => patch({ state: 'syncing', error: null }))
    .on('change', (info: unknown) => {
      const docs = (info as { change?: { docs?: Array<{ _id: string }> } })?.change?.docs ?? [];
      for (const d of docs) if (d?._id) void handleDocChange(d._id, db);
      patch({ lastSyncedAt: new Date().toISOString() });
    })
    .on('paused', (err: unknown) => {
      if (err) {
        patch({ state: isOnline() ? 'error' : 'offline', error: String(err) });
      } else if (isOnline()) {
        markSynced();
      } else {
        patch({ state: 'offline' });
      }
    })
    .on('denied', (err: unknown) => patch({ state: 'error', error: String(err) }))
    .on('error', (err: unknown) =>
      patch({ state: isOnline() ? 'error' : 'offline', error: String(err) })
    );
  handler = sync as unknown as Cancelable;

  // Track local writes so we can show "pending" while offline.
  const feed = db.changes({ since: 'now', live: true }).on('change', () => {
    if (!isOnline()) patch({ state: 'offline', pendingChanges: true });
  });
  changeFeed = feed as unknown as Cancelable;

  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => patch({ state: 'syncing' }));
    window.addEventListener('offline', () => patch({ state: 'offline' }));
  }

  // Reconcile any conflicts that arrived while the app was closed.
  void resolveAllConflicts(db);
}

/** Stop replication and the change feed. */
export function stopSync(): void {
  handler?.cancel();
  changeFeed?.cancel();
  handler = null;
  changeFeed = null;
  started = false;
}

/**
 * Force an immediate one-shot sync (the "Sync now" action). Resolves once both
 * directions complete; updates the status store.
 */
export async function syncNow(db: Database = getDb()): Promise<void> {
  const remote = createRemoteDb();
  patch({ state: 'syncing', error: null });
  try {
    await db.replicate.to(remote);
    await db.replicate.from(remote);
    await resolveAllConflicts(db);
    markSynced();
  } catch (err) {
    patch({ state: isOnline() ? 'error' : 'offline', error: String(err) });
    throw err;
  }
}

/** Current status snapshot (non-reactive convenience). */
export function currentSyncStatus(): SyncStatus {
  return get(store);
}
