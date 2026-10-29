import { defineConfig } from '@playwright/test';

// E2E runs against the static build served by `vite preview`.
export default defineConfig({
	testDir: 'e2e',
	timeout: 30_000,
	fullyParallel: true,
	use: {
		baseURL: 'http://localhost:4173'
	},
	webServer: {
		command: 'pnpm run build && pnpm run preview',
		// Wait for a served page, not just a listening port: `vite preview` binds
		// before its static middleware answers, so port-only readiness let the
		// first tests race the server and receive a 500.
		url: 'http://localhost:4173/',
		reuseExistingServer: !process.env.CI,
		timeout: 120_000
	}
});
