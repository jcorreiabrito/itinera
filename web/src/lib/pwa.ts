import { writable } from 'svelte/store';

/** A newer service worker is installed and waiting to take over. */
export const needRefresh = writable(false);
/** The app shell is cached and ready to work offline. */
export const offlineReady = writable(false);

let waitingWorker: ServiceWorker | null = null;
let reloading = false;

/**
 * Manually register the SvelteKit-built service worker (production only) and wire up
 * "update available / ready offline" state. Auto-registration is disabled in
 * svelte.config.js so we can drive this UX ourselves.
 */
export function registerServiceWorker(): void {
	if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) {
		if (typeof window !== 'undefined' && !window.isSecureContext) {
			console.warn(
				'Service Worker cannot register on insecure HTTP LAN connections. Access via HTTPS or localhost for offline caching support.'
			);
		}
		return;
	}
	if (!import.meta.env.PROD) {
		console.log('Service Worker auto-registration skipped in development mode.');
		return;
	}

	/*
	 * Captured before registering. The worker calls `clients.claim()` when it
	 * activates, which fires `controllerchange` on the very first visit too —
	 * when there was no controller to replace. Reloading then throws away the
	 * page the user has just loaded, which is what made a brand-new install
	 * appear to reload itself a second after opening.
	 */
	const hadController = !!navigator.serviceWorker.controller;

	navigator.serviceWorker.addEventListener('controllerchange', () => {
		if (!hadController || reloading) return;
		reloading = true;
		location.reload();
	});

	navigator.serviceWorker
		.register('/service-worker.js')
		.then((registration) => {
			// A worker is already waiting (update found on a previous load).
			if (registration.waiting && navigator.serviceWorker.controller) {
				waitingWorker = registration.waiting;
				needRefresh.set(true);
			}

			registration.addEventListener('updatefound', () => {
				const installing = registration.installing;
				if (!installing) return;

				installing.addEventListener('statechange', () => {
					if (installing.state !== 'installed') return;
					if (navigator.serviceWorker.controller) {
						// Update available for an already-installed app.
						waitingWorker = registration.waiting ?? installing;
						needRefresh.set(true);
					} else {
						// First install – the app is now ready to work offline.
						offlineReady.set(true);
					}
				});
			});
		})
		.catch((error) => {
			console.error('Service worker registration failed:', error);
		});
}

/**
 * Apply a waiting update and reload once it takes control.
 *
 * The reload is the `controllerchange` handler's job, not this function's: the
 * new worker only owns the page after it activates, and reloading before that
 * races the swap and can hand back the old shell — which is what "the Reload
 * button does nothing" looked like. There used to be a flag here that
 * suppressed that handler, so nothing ever reloaded at all.
 */
export function applyUpdate(): void {
	if (!waitingWorker) {
		location.reload();
		return;
	}
	waitingWorker.postMessage('SKIP_WAITING');
}
