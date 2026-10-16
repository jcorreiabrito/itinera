/// <reference types="vitest" />
import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

/*
 * Component tests need the browser build of Svelte.
 *
 * Vitest transforms modules through Vite's SSR pipeline, and `ssr.resolve
 * .conditions` defaults to the root `resolve.conditions` — so without this,
 * `import { mount } from 'svelte'` resolves to `svelte/src/index-server.js` and
 * `@testing-library/svelte` dies with "`mount(...)` is not available on the
 * server". Naming the `browser` condition puts the client build back.
 *
 * This lives in its own config, merged over `vite.config.ts`, rather than in the
 * app config: `resolve.conditions` also steers the real build, and the app is
 * built for the client by SvelteKit's own plugin order.
 */
export default mergeConfig(
	viteConfig,
	defineConfig({
		resolve: {
			conditions: ['module', 'browser', 'development|production']
		},
		test: {
			setupFiles: ['src/test/setup.ts']
		}
	})
);
