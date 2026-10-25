/**
 * Deployment configuration, read before the app starts.
 *
 * The self-hoster is the app's second user, and until now pointing the app at a
 * different CouchDB — or turning a feature off for a household — meant editing
 * TypeScript and rebuilding the image. This module reads a small, optional
 * `config.js` that ships next to the app instead. In the Docker stack it is
 * baked into the static build like any other asset, so a change still needs a
 * rebuild; the difference is that it is one documented file rather than code.
 * On a dev server or any deployment that serves `web/build/` directly, the file
 * can be edited in place.
 *
 * Why a script and not `/config.json`: the app must start with no network, and
 * a fetch gives the shell a second asynchronous gate before the first render.
 * A same-origin `<script>` in `app.html` has already executed by the time this
 * module is imported, it is precached with the rest of `static/` by the service
 * worker, and it cannot fail independently of the page itself.
 *
 * A malformed file must not brick the app: parse failures fall back to the
 * documented defaults and warn once, because the alternative — an unhandled
 * throw during boot — leaves a blank screen with no way to reach Settings.
 */
import { z } from 'zod';

import { DB_NAME, REMOTE_URL } from './db/constants';

export const configSchema = z.object({
	/** Local IndexedDB database name. Change it to run two datasets side by side. */
	dbName: z.string().trim().min(1).default(DB_NAME),
	/** Same-origin CouchDB endpoint, proxied by the reverse proxy. */
	remoteUrl: z.string().trim().min(1).default(REMOTE_URL),
	/** Currency new trips start with, when the traveller does not choose one. */
	defaultCurrency: z
		.string()
		.trim()
		.length(3)
		.transform((code) => code.toUpperCase())
		.default('EUR'),
	/** Set false on a deployment that cannot reach the forecast service. */
	weatherEnabled: z.boolean().default(true),
	/** Feature switches; a missing key means "on". */
	flags: z.record(z.boolean()).default({})
});

export type RuntimeConfig = z.infer<typeof configSchema>;
export type RuntimeConfigInput = z.input<typeof configSchema>;

/** What the app uses when `config.js` is absent or says nothing. */
export const DEFAULT_CONFIG: RuntimeConfig = configSchema.parse({});

declare global {
	interface Window {
		/** Set by the optional `static/config.js` before the app module runs. */
		__ITINERA_CONFIG__?: unknown;
	}
}

let cached: RuntimeConfig | null = null;

/** The resolved configuration. Parsed once; later calls return the same object. */
export function getRuntimeConfig(): RuntimeConfig {
	if (cached) return cached;
	const raw = typeof window === 'undefined' ? {} : (window.__ITINERA_CONFIG__ ?? {});
	const parsed = configSchema.safeParse(raw);
	if (parsed.success) {
		cached = parsed.data;
	} else {
		cached = { ...DEFAULT_CONFIG };
		console.warn(
			'Itinera: config.js is invalid; the documented defaults are in use.',
			parsed.error.issues
		);
	}
	return cached;
}

/**
 * Whether a feature switch is on. Unknown switches are **on**: the flag exists
 * to turn a shipped feature off, so a typo in `config.js` leaves the app
 * working instead of silently hiding something the user expected.
 */
export function flagEnabled(name: string): boolean {
	return getRuntimeConfig().flags[name] ?? true;
}

/** Test seam: forget the parsed configuration so a new `window` value is read. */
export function resetRuntimeConfigForTests(): void {
	cached = null;
}
