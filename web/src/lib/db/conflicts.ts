/**
 * Deterministic conflict resolution – **last-write-wins by `updatedAt`**.
 *
 * Conflicts are rare (only when the same record is edited on two devices while
 * both offline), but resolved deterministically so every device converges on
 * the same winner. The **losing revisions are never silently dropped** – they
 * are retained in CouchDB's revision tree and surfaced via `listConflicts()`
 * for a future "Review changes" screen (see `docs/05-offline-and-sync.md`).
 *
 * This module is intentionally **pure** (no PouchDB import); it only decides a
 * winner. The PouchDB wiring that applies the decision and enumerates conflicts
 * lives in `sync.ts`.
 */

/** The minimum a revision must expose for the last-write-wins decision. */
export interface RevEntry {
  _rev: string;
  updatedAt?: string | null;
}

/** Extract the hash portion of a CouchDB revision (`"3-abc"` → `"abc"`). */
export function revHash(rev: string): string {
  const idx = rev.indexOf('-');
  return idx === -1 ? rev : rev.slice(idx + 1);
}

/** Numeric generation of a revision (`"3-abc"` → `3`). */
export function revGeneration(rev: string): number {
  const idx = rev.indexOf('-');
  return idx === -1 ? 0 : Number(rev.slice(0, idx)) || 0;
}

/**
 * Order two revisions: the **greater** is the better winner.
 * 1. Later `updatedAt` wins (ISO strings compare chronologically).
 * 2. Tie → the revision hash that sorts higher wins (stable, content-independent).
 *
 * Returns a positive number if `a` should win over `b`, negative if `b` wins.
 */
export function compareRevisions(a: RevEntry, b: RevEntry): number {
  const ua = a.updatedAt ?? '';
  const ub = b.updatedAt ?? '';
  if (ua !== ub) return ua > ub ? 1 : -1;
  const ha = revHash(a._rev);
  const hb = revHash(b._rev);
  if (ha === hb) return 0;
  return ha > hb ? 1 : -1;
}

/**
 * Pick the winning revision from a set of conflicting revisions.
 *
 * The winner is the revision with the latest `updatedAt`. When several share the
 * latest `updatedAt` (a real tie), `preferRev` wins if it is among them – this
 * keeps the current default authoritative and prevents rewrite loops – otherwise
 * the highest revision hash wins (deterministic and content-independent).
 *
 * @param entries the competing revisions (default + `_conflicts`)
 * @param opts.preferRev on an `updatedAt` tie, keep this revision
 */
export function pickWinner<T extends RevEntry>(
  entries: readonly T[],
  opts: { preferRev?: string } = {}
): T {
  if (entries.length === 0) {
    throw new Error('pickWinner: no revisions provided');
  }

  // Latest updatedAt across all revisions.
  let latest = entries[0].updatedAt ?? '';
  for (const e of entries) {
    const u = e.updatedAt ?? '';
    if (u > latest) latest = u;
  }

  // The set tied on the latest updatedAt.
  const tied = entries.filter((e) => (e.updatedAt ?? '') === latest);
  if (tied.length === 1) return tied[0];

  // Prefer the caller's revision on a genuine tie (loop prevention).
  if (opts.preferRev) {
    const preferred = tied.find((e) => e._rev === opts.preferRev);
    if (preferred) return preferred;
  }

  // Otherwise the highest revision hash wins, deterministically.
  return tied.reduce((best, e) => (revHash(e._rev) > revHash(best._rev) ? e : best));
}

/** A document's conflict state, for the future review UI. */
export interface ConflictReport<T extends RevEntry = RevEntry> {
  /** Document id with one or more conflicting revisions. */
  id: string;
  /** The revision chosen as authoritative by last-write-wins. */
  winner: T;
  /** The retained losing revisions (most-recent first). */
  losers: T[];
}

/**
 * A resolution plan: how to converge one conflicted document.
 *
 * The plan is the bridge between the pure decision here and the PouchDB I/O in
 * `sync.ts`. Crucially it lists both the **losers to retain** (so no content is
 * ever lost) and the **conflict-branch revisions to clear** – without clearing,
 * the document stays perpetually conflicted and is re-resolved forever.
 */
export interface ResolutionPlan<T extends RevEntry = RevEntry> {
  /** The revision chosen as authoritative by last-write-wins. */
  winner: T;
  /** Every non-winning revision; their content is **retained** for review. */
  losers: T[];
  /**
   * True when the winner is not the current default branch and its body must be
   * re-written on top of the default so every device shows the same content.
   */
  rewriteWinner: boolean;
  /**
   * The `_conflicts` branch revisions to remove from the live tree so the
   * document stops being reported as conflicted. Their content survives in
   * `@link losers` (snapshotted before removal).
   */
  clearRevs: string[];
}

/**
 * Decide how to resolve a conflicted document: pick the last-write-wins winner,
 * collect every other revision as a retained loser, and list the conflict-branch
 * revisions to clear. Pure – `sync.ts` applies the plan against PouchDB.
 *
 * Winner selection is unchanged (`@link pickWinner`): latest `updatedAt`, tie →
 * keep the default, then highest revision hash. `losers` includes the original
 * default content whenever a conflict branch wins, so nothing is dropped.
 *
 * @param defaultDoc the current default (winning-branch) revision
 * @param conflictBranches the sibling `_conflicts` revisions
 */
export function planConflictResolution<T extends RevEntry>(
  defaultDoc: T,
  conflictBranches: readonly T[]
): ResolutionPlan<T> {
  const all = [defaultDoc, ...conflictBranches];
  const winner = pickWinner(all, { preferRev: defaultDoc._rev });
  return {
    winner,
    losers: all.filter((d) => d._rev !== winner._rev),
    rewriteWinner: winner._rev !== defaultDoc._rev,
    clearRevs: conflictBranches.map((d) => d._rev)
  };
}
