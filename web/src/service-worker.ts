/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const sw = self as unknown as ServiceWorkerGlobalScope;

const CACHE = `itinera-cache-${version}`;

// "build" is hashed app shell (JS/CSS + bundled fonts), "files" is everything in static/
// (icons, favicon, manifest). Together they are the offline app shell.
const ASSETS = [...build, ...files];
const ASSET_SET = new Set(ASSETS);

// The SPA fallback document served for offline navigations.
const APP_SHELL = '/';

sw.addEventListener('install', (event) => {
  event.waitUntil(
    (async () => {
      const cache = await caches.open(CACHE);
      await cache.addAll(ASSETS);
      // Precache the app-shell HTML so offline navigations resolve.
      try {
        await cache.add(APP_SHELL);
      } catch {
        // Ignore: shell will be cached on first successful navigation.
      }
      // Note: we intentionally do NOT skipWaiting here, so the client can show an
      // "update available" prompt and apply it on demand (see src/lib/pwa.ts).
    })()
  );
});

sw.addEventListener('activate', (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) {
        if (key !== CACHE) await caches.delete(key);
      }
      await sw.clients.claim();
    })()
  );
});

sw.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method != 'GET') return;

  const url = new URL(request.url);
  if (!url.protocol.startsWith('http')) return;
  // Never cache or offline-serve the PouchDB replication channel (/db/) or the
  // API (/api/): serving stale `_changes`, `_local` checkpoints, docs, or
  // attachments would hand PouchDB outdated data and break sync convergence
  // (doc 0%). Bypass the SW entirely so these always hit the network.
  if (
    url.origin === location.origin &&
    (url.pathname.startsWith('/db/') || url.pathname.startsWith('/api/'))
  ) {
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);

      // Cache-first for our own precached, immutable build assets.
      if (url.origin === location.origin && ASSET_SET.has(url.pathname)) {
        const cached = await cache.match(url.pathname);
        if (cached) return cached;
      }

      // Network-first for everything else, with an offline fallback to cache / shell.
      try {
        const response = await fetch(request);
        if (response.ok && url.origin === location.origin) {
          cache.put(request, response.clone());
        }
        return response;
      } catch (error) {
        const cached = await cache.match(request);
        if (cached) return cached;
        if (request.mode === 'navigate') {
          const shell = await cache.match(APP_SHELL);
          if (shell) return shell;
        }
        throw error;
      }
    })()
  );
});

sw.addEventListener('message', (event) => {
  if (event.data === 'SKIP_WAITING') sw.skipWaiting();
});
