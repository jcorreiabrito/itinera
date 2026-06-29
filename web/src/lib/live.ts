/**
 * Lightweight data-liveness helper for Phase 1.
 *
 * The page docs call for views "kept live via change subscriptions". Until a
 * dedicated live-query helper is exposed by `$lib/db`, we approximate it: pages
 * re-query after their own mutations (explicitly) and via this helper on window
 * focus / tab visibility, plus a best-effort subscription to the local PouchDB
 * change feed (so changes arriving from background sync refresh the view too).
 *
 * `startLive(reload)` wires those triggers and returns an unsubscribe function;
 * call it from a component `$effect` / `onMount` cleanup. Triggers are debounced
 * so a burst of changes coalesces into a single reload.
 */

import { subscribeChanges } from '$lib/db';

export function startLive(reload: () => void, debounceMs = 200): () => void {
  if (typeof window === 'undefined') return () => {};

  let timer: ReturnType<typeof setTimeout> | null = null;
  const fire = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      reload();
    }, debounceMs);
  };

  const onVisible = () => {
    if (document.visibilityState === 'visible') fire();
  };

  window.addEventListener('focus', fire);
  document.addEventListener('visibilitychange', onVisible);

  // Best-effort: observe the local change feed for live updates from sync.
  let feed: ReturnType<typeof subscribeChanges> | null = null;
  try {
    feed = subscribeChanges(() => fire());
  } catch {
    feed = null;
  }

  return () => {
    if (timer) clearTimeout(timer);
    window.removeEventListener('focus', fire);
    document.removeEventListener('visibilitychange', onVisible);
    try {
      feed?.cancel();
    } catch {
      /* feed already cancelled / db unavailable */
    }
  };
}
