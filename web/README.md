# Itinera — Web (SvelteKit PWA)

A cozy, **offline-first** travel planner. Static, installable SPA built with SvelteKit + Vite + Tailwind, packaged as a PWA. Local-first data (PouchDB ⇔ CouchDB) is added under `src/lib/db/**` by the data-sync workstream.

## Requirements

- Node ≥ 18.13
- pnpm

## Commands

```bash
pnpm install       # install dependencies
pnpm dev           # start the dev server
pnpm build         # produce the static SPA in ./build
pnpm preview       # serve ./build locally (http://localhost:4173)
pnpm check         # svelte-check (types)
pnpm lint          # prettier + eslint
pnpm test          # unit tests (Vitest)
pnpm test:e2e      # Playwright e2e (builds + previews first)
```

## Build output

`pnpm build` runs `@sveltejs/adapter-static` in SPA mode and emits a fully static site to `**web/build/**` with an `index.html` fallback. Serve that directory as static files (no server runtime required).

## PWA

- Web app manifest at `static/manifest.webmanifest` (`name` **Itinera**, `display`: `standalone`, `theme_color` `#2F684F`, `background_color` `#BFE1F1`, 192/512 + maskable icons).
- Service worker: SvelteKit-native `src/service-worker.ts` (built to `build/service-worker.js`). It precaches the app shell + fonts and serves the cached shell for offline navigations. Auto-registration is disabled; `src/lib/pwa.ts` registers it in production and drives the "update available / ready offline" prompt (`src/lib/components/ReloadPrompt.svelte`).

## Fonts

- **Inter** (body/UI) is self-hosted and precached via `@fontsource/inter`.
- **Fraunces** (headings) is the intended serif. If `@fontsource/fraunces` is unavailable in your registry, headings fall back to a warm serif stack – see the note in `src/app.css` to enable it.

## Project conventions

- **Design system:** `docs/13-ui-ux.md`, implemented in `tailwind.config.ts` + `src/app.css`. Light theme only, forest-green accent, Fraunces (headings) / Inter (body), AA contrast, visible 2px focus rings, 44px tap targets.
- **UI primitives:** `src/lib/components/ui/` (re-exported from its `index.ts`).
- **$lib** → `src/lib` (SvelteKit default; do not redeclare – it is reserved).

## Integration contract for the data layer (`$lib/db`)

The UI expects the data-sync workstream to own and provide `src/lib/db/**`, exposing its API via `$lib/db` (e.g. `import { ... } from '$lib/db'`). Phase 0 routes/components compile **without** importing it. `vite.config.ts` already sets `define.global = 'globalThis'` for PouchDB, and all PouchDB/sync dependencies are pre-declared in `package.json`.

> Do not edit `src/lib/db/**` from the frontend workstream.