/**
 * A count of local writes that have not been confirmed on the server yet.
 *
 * PouchDB gives no direct answer to "how much is left to push", and the local
 * change feed cannot tell a user's edit from a document the *pull* replication
 * just wrote — so counting there would light the "unsynced changes" indicator
 * every time the server sent something down. Instead the count is maintained by
 * the write path itself: every repository write funnels through `putDoc`,
 * `purgeDoc` or `bulkPut` in `base.ts`, and each marks one unit here.
 *
 * A separate module rather than a field on `sync.ts` so the write path does not
 * have to import the replication engine (and, with it, the remote-url config).
 */

import { get, writable } from 'svelte/store';

const store = writable(0);

/** Number of local writes awaiting confirmation. Read-only. */
export const pendingWrites = { subscribe: store.subscribe };

/** Record `count` local writes (or one, by default) as awaiting confirmation. */
export function markPending(count = 1): void {
	store.update((n) => n + count);
}

/** Everything has reached the server. */
export function clearPending(): void {
	store.set(0);
}

/** Current count (non-reactive convenience). */
export function pendingWriteCount(): number {
	return get(store);
}
