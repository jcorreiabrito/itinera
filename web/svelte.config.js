import adapter from '@sveltejs/adapter-static';
import { vitePreprocess } from '@sveltejs/vite-plugin-svelte';

/** @type {import('@sveltejs/kit').Config} */
const config = {
	preprocess: vitePreprocess(),

	kit: {
		// Static SPA: every route falls back to index.html and boots the client router,
		// so the app runs with no server (served as static files from `build/`).
		adapter: adapter({
			pages: 'build',
			assets: 'build',
			fallback: 'index.html',
			precompress: false,
			strict: false
		}),
		paths: {
			relative: false
		},
		// We register `src/service-worker.ts` manually (see src/lib/pwa.ts) so we can
		// surface an "update available / ready offline" prompt.
		serviceWorker: {
			register: false
		},
		// CSP for the installable PWA, emitted as a `<meta http-equiv>` in the
		// built shell (`build/index.html`). Caddy sends no CSP header, so that
		// <meta> is the single source of truth. `mode: 'hash'` is what a static
		// adapter can do — there is no server to mint a per-request nonce.
		//
		// `unsafe-inline` is in both `script-src` and `style-src` on purpose:
		// the pre-paint theme/language script in `src/app.html` runs before
		// `%sveltekit.head%`, reads localStorage and must not flash, so it
		// cannot be an external module; and Tailwind's inline `style` attributes
		// (map sizes, progress bars) plus Leaflet's runtime styles need the
		// style half. Read the emitted `<meta>` — not this comment and not the
		// `mode` — as the statement of what the policy actually allows.
		csp: {
			mode: 'hash',
			directives: {
				'default-src': ['self'],
				'script-src': ['self', 'unsafe-inline'],
				'style-src': ['self', 'unsafe-inline'],
				'img-src': [
					'self',
					'blob:',
					'data:',
					'https://*.tile.openstreetmap.org',
					'https://tile.openstreetmap.org',
					'http:',
					'https:'
				],
				'font-src': ['self', 'data:'],
				'connect-src': [
					'self',
					'https://nominatim.openstreetmap.org',
					'https://api.open-meteo.com',
					'http:',
					'https:',
					'ws:',
					'wss:'
				],
				'worker-src': ['self', 'blob:'],
				'frame-src': ['self', 'blob:'],
				'child-src': ['self', 'blob:'],
				'manifest-src': ['self'],
				'object-src': ['none'],
				'base-uri': ['self']
			}
		}
		// `$lib` -> `src/lib` is provided by SvelteKit out of the box (config.kit.files.lib).
		// It is reserved, so we intentionally do NOT redeclare it under `kit.alias`.
	}
};

export default config;
