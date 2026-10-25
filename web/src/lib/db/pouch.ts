/**
 * PouchDB setup – the local-first engine.
 *
 * Creates the local IndexedDB-backed database (`itinera`) and the **same-origin**
 * remote (`/db/itinera`), proxied by Caddy with no browser credentials. The
 * PouchDB implementation and adapter are swappable via `@link configureDb` so
 * tests can run against the in-memory adapter.
 *
 * This is the only module (besides `sync.ts`) that pulls in the PouchDB runtime.
 * Pure logic modules avoid importing it so they stay unit-testable even where
 * `pouchdb-browser` cannot be installed.
 *
 * **Why it is still a static import (audit C4, accepted).** Measured on the
 * 2026-10-16 build: this module's chunk is 504 KB raw / 153 KB gzip, the largest
 * single file the app ships. Deferring it behind a dynamic `import()` was
 * considered and rejected: the home screen's first content *is* the trip list, so
 * the database is needed before anything can be rendered, and the shell would
 * paint a skeleton and then wait the same wall-clock time for the same bytes.
 * The one route that *could* have won from lazy loading was the map, and it
 * already had — SvelteKit gives every route its own chunk, so Leaflet's ~300 KB
 * was never on the trip list. Measured: the itinerary route chunk contains
 * Leaflet whether `TripMap` is imported statically or through `import()`, and
 * making it dynamic moved gzipped JS 500.4 KB → 501.2 KB. Reverted.
 */

import PouchDBBrowser from 'pouchdb-browser';
import find from 'pouchdb-find';

import { getRuntimeConfig } from '../config';
import { DB_NAME, REMOTE_URL } from './constants';

// Register the Mongo query plugin on the default browser implementation.
PouchDBBrowser.plugin(find);

/** A PouchDB database handle (typed via the global `@types/pouchdb` namespace). */
export type Database<Content extends object = Record<string, unknown>> = PouchDB.Database<Content>;

/** The PouchDB constructor/static type. */
export type PouchStatic = PouchDB.Static;

/** Options accepted by `@link configureDb` (primarily for tests). */
export interface DbOptions {
	/** Local database name (default `itinera`). */
	name?: string;
	/** Storage adapter, e.g. `"memory"` in tests. Default lets PouchDB choose (IndexedDB). */
	adapter?: string;
	/** Swap the PouchDB implementation (e.g. one with the memory adapter registered). */
	PouchImpl?: PouchStatic;
	/** Override the remote URL (default `/db/itinera`). */
	remoteUrl?: string;
}

let impl: PouchStatic = PouchDBBrowser as unknown as PouchStatic;
/*
 * Deployment values come from `config.js` when it is present. They are read once,
 * here, so the rest of the data layer keeps using the same plain module state it
 * always has; `configureDb` still overrides them for tests.
 */
const runtime = getRuntimeConfig();
let localName = runtime.dbName || DB_NAME;
let adapter: string | undefined;
let remoteUrl = runtime.remoteUrl || REMOTE_URL;
let local: Database | null = null;

/**
 * Override the PouchDB implementation / adapter / names **before** the database
 * is first created. Resets any existing handle so the next `@link getDb` rebuilds.
 */
export function configureDb(options: DbOptions): void {
	if (options.PouchImpl) {
		impl = options.PouchImpl;
		impl.plugin(find);
	}
	if (options.name) localName = options.name;
	if (options.adapter !== undefined) adapter = options.adapter;
	if (options.remoteUrl) remoteUrl = options.remoteUrl;
	local = null;
}

/** Create (and remember) the local database handle. */
export function createLocalDb(): Database {
	local = new impl(localName, adapter ? { adapter } : undefined);
	return local;
}

/** The local database singleton (created on first access). */
export function getDb(): Database {
	return local ?? createLocalDb();
}

function resolveRemoteUrl(url: string): string {
	if (url.startsWith('http://') || url.startsWith('https://') || typeof window === 'undefined') {
		return url;
	}
	return `${window.location.origin}${url}`;
}

/**
 * Build a handle to the remote CouchDB (same-origin, via Caddy). `skip_setup`
 * avoids the client attempting to create the database – the server owns that.
 */
export function createRemoteDb(): Database {
	return new impl(resolveRemoteUrl(remoteUrl), { skip_setup: true });
}

/** The configured remote URL. */
export function getRemoteUrl(): string {
	return resolveRemoteUrl(remoteUrl);
}

/**
 * Ask the browser to keep our local database from being evicted under storage
 * pressure (`navigator.storage.persist()`). Returns whether persistence is
 * granted; resolves `false` where the API is unavailable.
 */
export async function requestPersistentStorage(): Promise<boolean> {
	if (typeof navigator === 'undefined' || !navigator.storage?.persist) return false;
	try {
		if (navigator.storage.persisted && (await navigator.storage.persisted())) return true;
		return await navigator.storage.persist();
	} catch {
		return false;
	}
}

/** Report current storage usage/quota (for a Settings display). */
export async function storageEstimate(): Promise<StorageEstimate | null> {
	if (typeof navigator === 'undefined' || !navigator.storage?.estimate) return null;
	try {
		return await navigator.storage.estimate();
	} catch {
		return null;
	}
}

/** Destroy and forget the local database – used to reset state between tests. */
export async function destroyDb(): Promise<void> {
	if (local) {
		await local.destroy();
		local = null;
	}
}
