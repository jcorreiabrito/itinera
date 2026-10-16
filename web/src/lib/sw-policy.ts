/**
 * The service worker's two decisions, kept out of the worker so they can be
 * tested.
 *
 * `service-worker.ts` is a script with no exports: it attaches listeners to a
 * global at import time, which makes it awkward to exercise. These two rules are
 * where its bugs live, so they live here instead, as functions over plain values.
 */

/** Paths the worker must never touch. */
const PASSTHROUGH_PREFIXES = ['/db/', '/api/'];

/**
 * Whether a request should skip the worker entirely.
 *
 * PouchDB's replication channel (`/db/`) and the API (`/api/`) must always reach
 * the network. Serving a cached `_changes` feed, a `_local` checkpoint or a stale
 * attachment would hand PouchDB outdated data and break sync convergence — the
 * failure mode that looks like "my edits disappeared on the other device".
 */
export function shouldBypass(url: URL, origin: string): boolean {
	if (url.origin !== origin) return false;
	return PASSTHROUGH_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));
}

/** Hosts whose responses are worth keeping for offline use. */
const CACHEABLE_HOSTS = [
	'tile.openstreetmap.org',
	'basemaps.cartocdn.com',
	'open.er-api.com',
	'open-meteo.com'
];

/**
 * Whether a fetched response may be written to the cache.
 *
 * Only third-party map tiles and exchange rates are cached here — everything of
 * our own is precached at install. Caching *any* successful same-origin response
 * was the bug: a static host that rewrites unknown paths to `index.html` answers
 * a missing `_app/…/chunk.js` with a 200 and a page of HTML, and the worker
 * stored that under the chunk's own URL. Every later import of that chunk then
 * received HTML, and the app broke in a way that survived reloads until the
 * cache was cleared by hand.
 */
export function isCacheableResponse(url: URL, response: Response): boolean {
	if (!response.ok) return false;
	return CACHEABLE_HOSTS.some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`));
}

/** Extensions whose content the browser will execute or apply, never read. */
const CODE_EXTENSIONS = ['.js', '.mjs', '.css'];

/**
 * Whether a response is a rewritten document standing in for a file that is
 * gone.
 *
 * The same static-host rewrite that poisoned the cache also reaches the network
 * path: mid-deploy, a tab running the previous build asks for a chunk the
 * server no longer has, gets `index.html` back with a 200, and the dynamic
 * import parses a page of markup as JavaScript. "Unexpected token '<'" names
 * the wrong problem and points at the wrong file. Handing back a failed fetch
 * instead produces "Failed to fetch dynamically imported module", which is what
 * a chunk-load handler — or a person reading the console — can act on.
 *
 * Only same-origin responses are considered: a third-party host is entitled to
 * answer however it likes, and our own assets are the ones a rewrite can reach.
 */
export function isShellRewrite(url: URL, response: Response, origin: string): boolean {
	if (url.origin !== origin) return false;
	const path = url.pathname.toLowerCase();
	if (!CODE_EXTENSIONS.some((extension) => path.endsWith(extension))) return false;
	return (response.headers.get('content-type') ?? '').toLowerCase().includes('text/html');
}
