/**
 * Live bidirectional sync + the sync-status store + conflict resolution.
 *
 * Replication is `{ live: true, retry: true }` to the same-origin remote, so the
 * UI always reads/writes the local database while bytes move in the background
 * and reconnects are automatic (see `docs/05-offline-and-sync.md`).
 *
 * The status this module reports is a claim about where the user's data is, so
 * it is only allowed to say "Synced" when that is true. Three things follow, and
 * each of them was wrong before:
 *
 *  - the two directions are separate replications, because `db.sync()` gives one
 *    `paused` event and cannot distinguish "the server has everything we have"
 *    from "we have everything the server has";
 *  - `pendingChanges` is fed by the write path's own tally (`./pending`), so a
 *    write that has not been pushed is visible even while the device is online;
 *  - reachability is probed with a real request, not read from
 *    `navigator.onLine`, which reports the state of a network interface and, on
 *    a LAN or a tailnet, says nothing about the machine at the other end.
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
import { clearPending, markPending, pendingWrites } from './pending';
import { getDb, createRemoteDb, getRemoteUrl, type Database } from './pouch';
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
	/** How many local writes are still waiting to reach the server. */
	pendingCount: number;
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
	pendingCount: 0,
	error: null
});

/*
 * `pendingWrites` is the write path's own tally (see `./pending`), so folding it
 * into the status store here keeps the pill's contract unchanged: it still reads
 * `pendingChanges`, and now also gets a count it can show.
 *
 * This is also what finally makes the `'pending'` state reachable. It existed in
 * the union, the pill had an icon and a colour for it, and nothing ever set it —
 * so a device with offline edits showed "Offline" (true) but a device that was
 * online, reachable, and simply had one write in flight showed "Synced", which
 * was not.
 */
export function applyPendingCount(status: SyncStatus, count: number): SyncStatus {
	if (status.pendingCount === count) return status;
	return {
		...status,
		pendingCount: count,
		pendingChanges: count > 0,
		// Only a *finished* sync is downgraded to "pending". Taking over from
		// `syncing` would hide an in-flight transfer behind a static label, and
		// from `offline`/`error` it would hide the reason the writes are stuck.
		state: count > 0 && status.state === 'synced' ? 'pending' : status.state
	};
}

pendingWrites.subscribe((count) => {
	store.update((s) => applyPendingCount(s, count));
});

/** Reactive sync status for the UI (read-only). */
export const syncStatus: Readable<SyncStatus> = { subscribe: store.subscribe };

function patch(next: Partial<SyncStatus>): void {
	store.update((s) => ({ ...s, ...next }));
}

function markSynced(): void {
	const iso = new Date().toISOString();
	saveLastSynced(iso);
	clearPending();
	patch({ state: 'synced', lastSyncedAt: iso, pendingChanges: false, error: null });
}

/**
 * Reachability probe for the remote database.
 *
 * `navigator.onLine` reports whether the device has *a* network interface, not
 * whether the home server is on the other end of it — and this app is deployed
 * on a LAN or a tailnet, where the network is up and the server is a laptop that
 * is asleep. Trusting the flag alone left the pill reporting a sync error (or an
 * eternal "Syncing…") whenever the server was unreachable on a working network.
 *
 * A 401/403 counts as reachable: the server answered, and CouchDB's own
 * replication will surface the credential problem.
 */
export async function probeRemote(timeoutMs = 5000): Promise<boolean> {
	if (typeof fetch === 'undefined') return true;
	try {
		const res = await fetch(getRemoteUrl(), {
			method: 'HEAD',
			credentials: 'include',
			signal: AbortSignal.timeout(timeoutMs)
		});
		return res.ok || res.status === 401 || res.status === 403;
	} catch {
		return false;
	}
}

/** `offline` only when the device or the server is genuinely out of reach. */
async function offlineOrError(err: unknown): Promise<Partial<SyncStatus>> {
	const reachable = await probeRemote();
	return reachable
		? { state: 'error', error: describeError(err) }
		: { state: 'offline', error: null };
}

function describeError(err: unknown): string | null {
	if (!err) return null;
	if (typeof err === 'string') return err;
	const message = (err as { message?: string })?.message;
	const status = (err as { status?: number })?.status;
	if (message && status) return `${message} (${status})`;
	return message ?? String(err);
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
			// Written straight to PouchDB rather than through `putDoc` (the
			// merged body must keep the winner's exact shape), so it has to
			// declare itself: it is a local edit and it has to be pushed.
			markPending();
		}
	}

	// 3. Clear every conflict branch so the document stops being conflicted.
	for (const rev of plan.clearRevs) {
		try {
			await db.remove(id, rev);
			markPending();
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

interface ReplicationEvent {
	change?: { docs?: Array<{ _id: string }> };
}

/** One direction of replication, with the events we act on. */
interface Replication extends Cancelable {
	on(event: 'active', cb: () => void): Replication;
	on(event: 'paused', cb: (err?: unknown) => void): Replication;
	on(event: 'denied' | 'error', cb: (err: unknown) => void): Replication;
	on(event: 'change', cb: (info: ReplicationEvent) => void): Replication;
}

let push: Replication | null = null;
let pull: Replication | null = null;
let started = false;

/**
 * Both directions are idle and error-free.
 *
 * `db.sync()` was one call with one `paused` event, so the status could not tell
 * "the server has everything we have" from "we have everything the server has".
 * Two replications give each direction its own lifecycle, which is what makes
 * the `pending` state and the pending count mean anything.
 */
let pushIdle = false;
let pullIdle = false;

function settleIfIdle(): void {
	if (pushIdle && pullIdle) markSynced();
}

async function handleDocChange(docId: string, db: Database): Promise<void> {
	try {
		await resolveDocConflicts(docId, db);
	} catch {
		// Best-effort: a transient read race shouldn't break the sync loop.
	}
}

function watch(replication: Replication, direction: 'push' | 'pull', db: Database): Replication {
	const settle = (idle: boolean) => {
		if (direction === 'push') pushIdle = idle;
		else pullIdle = idle;
	};

	return replication
		.on('active', () => {
			settle(false);
			patch({ state: 'syncing', error: null });
		})
		.on('change', (info) => {
			for (const doc of info?.change?.docs ?? []) {
				if (doc?._id) void handleDocChange(doc._id, db);
			}
			patch({ lastSyncedAt: new Date().toISOString() });
		})
		.on('paused', async (err?: unknown) => {
			if (err) {
				settle(false);
				patch(await offlineOrError(err));
				return;
			}
			settle(true);
			if (direction === 'push') clearPending();
			settleIfIdle();
		})
		.on('denied', (err) => patch({ state: 'error', error: describeError(err) }))
		.on('error', async (err) => {
			settle(false);
			patch(await offlineOrError(err));
		});
}

/** Begin live, retrying, bidirectional replication. Idempotent. */
export function startSync(db: Database = getDb()): void {
	if (started) return;
	started = true;
	pushIdle = false;
	pullIdle = false;

	const remote = createRemoteDb();
	const options = { live: true, retry: true };
	push = watch(db.replicate.to(remote, options) as unknown as Replication, 'push', db);
	pull = watch(db.replicate.from(remote, options) as unknown as Replication, 'pull', db);

	if (typeof window !== 'undefined') {
		window.addEventListener('online', () => {
			patch({ state: 'syncing' });
			// The flag only says an interface came up; confirm before celebrating.
			void probeRemote().then((reachable) => {
				if (!reachable) patch({ state: 'offline', error: null });
			});
		});
		window.addEventListener('offline', () => patch({ state: 'offline', error: null }));
	}

	// Reconcile any conflicts that arrived while the app was closed.
	void resolveAllConflicts(db);
}

/** Stop replication. */
export function stopSync(): void {
	push?.cancel();
	pull?.cancel();
	push = null;
	pull = null;
	pushIdle = false;
	pullIdle = false;
	started = false;
}

/**
 * Force an immediate one-shot sync (the "Sync now" action). Resolves once both
 * directions complete; updates the status store.
 *
 * Unlike the background replicas this one does *not* retry forever, so a
 * "Sync now" tap on an unreachable server fails promptly and visibly instead of
 * spinning.
 */
export async function syncNow(db: Database = getDb()): Promise<void> {
	const remote = createRemoteDb();
	patch({ state: 'syncing', error: null });
	try {
		await db.replicate.to(remote);
		clearPending();
		await db.replicate.from(remote);
		await resolveAllConflicts(db);
		markSynced();
	} catch (err) {
		const next = await offlineOrError(err);
		patch(next);
		throw err;
	}
}

/** Current status snapshot (non-reactive convenience). */
export function currentSyncStatus(): SyncStatus {
	return get(store);
}
