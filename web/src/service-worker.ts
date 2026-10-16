/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';
import { isCacheableResponse, isShellRewrite, shouldBypass } from '$lib/sw-policy';

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
			try {
				await cache.add('/index.html');
			} catch {
				// Ignore: fallback index.html caching
			}
			await sw.skipWaiting();
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
	// The PouchDB replication channel and the API always hit the network — see
	// `shouldBypass` for why serving them from cache breaks sync convergence.
	if (shouldBypass(url, location.origin)) return;

	event.respondWith(
		(async () => {
			const cache = await caches.open(CACHE);

			// 1. Navigation requests -> serve cached SPA shell immediately.
			if (request.mode === 'navigate') {
				const shell =
					(await cache.match(APP_SHELL, { ignoreSearch: true })) ||
					(await cache.match('/index.html', { ignoreSearch: true })) ||
					(await cache.match(request, { ignoreSearch: true }));
				if (shell) return shell;

				try {
					const response = await fetch(request);
					if (response.ok && url.origin === location.origin) {
						cache.put(APP_SHELL, response.clone());
						cache.put('/index.html', response.clone());
						cache.put(request, response.clone());
					}
					return response;
				} catch (error) {
					// Offline fallback: try to find any cached index.html or root page in cache
					for (const key of await cache.keys()) {
						if (
							key.url.endsWith('/') ||
							key.url.endsWith('/index.html') ||
							key.url.includes('index')
						) {
							const anyShell = await cache.match(key);
							if (anyShell) return anyShell;
						}
					}
					throw error;
				}
			}

			// 2. Cache-first for our own precached, immutable build assets.
			let pathname = url.pathname;
			if (pathname.includes('/_app/')) {
				pathname = pathname.substring(pathname.indexOf('/_app/'));
			}

			if (url.origin === location.origin && ASSET_SET.has(pathname)) {
				const cached = await cache.match(pathname);
				if (cached) return cached;
			}

			// 3. Network-first for everything else, with an offline fallback to cache.
			// Only the third-party tiles and rates are stored — see
			// `isCacheableResponse` for why a same-origin response must not be.
			try {
				const response = await fetch(request);
				// A rewritten document must not be handed to a script or a
				// stylesheet — see `isShellRewrite`.
				if (isShellRewrite(url, response, location.origin)) {
					const cached = await cache.match(request);
					if (cached) return cached;
					return Response.error();
				}
				if (isCacheableResponse(url, response)) {
					cache.put(request, response.clone());
				}
				return response;
			} catch (error) {
				const cached = await cache.match(request);
				if (cached) return cached;
				throw error;
			}
		})()
	);
});

sw.addEventListener('message', (event) => {
	if (event.data === 'SKIP_WAITING') sw.skipWaiting();
});
