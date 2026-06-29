/**
 * Shared context for the trip shell (`/trip/[id]`) and its section pages.
 *
 * The shell owns the trip header + the editor sheet; section pages (Overview,
 * etc.) read the trip id and subscribe to a reload signal that the shell bumps
 * whenever trip-level data changes (e.g. after an edit), so they re-query without
 * each having to own the editor.
 */

import { getContext, setContext } from 'svelte';
import type { Readable } from 'svelte/store';

const KEY = Symbol('itinera-trip-shell');

export interface TripShellContext {
  /** Increments whenever trip-level data changes; sections re-query on change. */
  reloadSignal: Readable<number>;
  /** Ask the shell to reload the header and notify sections. */
  requestReload: () => void;
  /** Open the trip editor sheet (owned by the shell header). */
  openEditor: () => void;
}

export function setTripShellContext(ctx: TripShellContext): void {
  setContext(KEY, ctx);
}

export function getTripShellContext(): TripShellContext {
  return getContext(KEY);
}
