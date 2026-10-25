/*
 * Itinera deployment configuration.
 *
 * Served as-is and loaded before the app bundle, so changing a value here is
 * enough to move a deployment — no rebuild. Every key is optional; anything
 * omitted keeps the default shown below. An invalid value is reported in the
 * console and the defaults are used, so a typo can never leave a blank screen.
 *
 * See `web/src/lib/config.ts` for the schema and `deploy/README.md` for the
 * deployment guide. This file is part of the static build, so the Docker stack
 * needs `docker compose up --build -d` to pick up a change — but no TypeScript
 * edit, and no knowledge of the code, is required.
 */
window.__ITINERA_CONFIG__ = {
	// Local IndexedDB database name.
	dbName: 'itinera',

	// Same-origin CouchDB endpoint (proxied by the reverse proxy).
	remoteUrl: '/db/itinera',

	// Currency a new trip starts with (ISO 4217, three letters).
	defaultCurrency: 'EUR',

	// Set to false on a deployment with no route to the forecast service.
	weatherEnabled: true,

	// Feature switches. A key that is absent is ON; set one to false to hide it.
	flags: {
		// today: true,
		// capture: true,
		// commandPalette: true,
		// wallet: true,
		// exportCenter: true,
		// packing: true,
		// readiness: true,
		// feasibility: true
	}
};
