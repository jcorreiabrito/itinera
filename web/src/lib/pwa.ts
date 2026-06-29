import { writable } from 'svelte/store';

/** A newer service worker is installed and waiting to take over. */
export const needRefresh = writable(false);
/** The app shell is cached and ready to work offline. */
export const offlineReady = writable(false);

let waitingWorker: ServiceWorker | null = null;
let updateApplied = false;
let reloading = false;

/**
 * Manually register the SvelteKit-built service worker (production only) and wire up
 * "update available / ready offline" state. Auto-registration is disabled in
 * svelte.config.js so we can drive this UX ourselves.
 */
export function registerServiceWorker(): void {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
  if (!import.meta.env.PROD) return;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (updateApplied || reloading) return;
    reloading = true;
    location.reload();
  });

  navigator.serviceWorker
    .register('/service-worker.js', { type: 'module' })
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

/** Apply a waiting update and reload once it takes control. */
export function applyUpdate(): void {
  updateApplied = true;
  if (waitingWorker) {
    waitingWorker.postMessage('SKIP_WAITING');
  } else {
    location.reload();
  }
}
