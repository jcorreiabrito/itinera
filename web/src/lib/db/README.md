# `$lib/db` – Itinera data & offline-sync layer

The **local-first** data engine for the whole app. PouchDB (IndexedDB) in the browser replicates live to CouchDB via Caddy; the UI reads/writes the local database only and never waits on the network. This folder owns the document schemas, the typed repository/query API every page consumes, live replication + sync status, conflict resolution, soft delete/trash, schema migrations, and the bundled offline airport dataset.

> Anchor docs: [04-data-model.md](../../../docs/04-data-model.md) · [05-offline-and-sync.md](../../../docs/05-offline-and-sync.md) · [02-architecture.md](../../../docs/02-architecture.md)

## Bootstrap

```ts
import { initDb } from '$lib/db';

// Once, at app start (e.g. root +layout). Creates the local db, requests persistent
// storage, ensures Mango indexes, runs migrations, and starts live sync.
await initDb();
// Tests: initDb({ PouchImpl, adapter: 'memory', name: 'test', sync: false })

```

All reads/writes then go through the repositories below – every one hits local PouchDB first.

## Sync status store (contract for `SyncStatusPill`)

```ts
import { syncStatus, syncNow, listConflicts } from '$lib/db';

// syncStatus is a Svelte readable store with this exact shape:
interface SyncStatus {
    state: 'synced' | 'syncing' | 'offline' | 'pending' | 'error';
    lastSyncedAt: string | null;  // ISO; persisted across reloads (localStorage)
    pendingChanges: boolean;      // local edits not yet pushed (dot badge)
    error: string | null;         // message when state === 'error'
}

```

```svelte
<script>
    import { syncStatus, syncNow } from '$lib/db';
</script>
{#if $syncStatus.state === 'offline'}Showing saved data{/if}
<button on:click={() => syncNow()}>Sync now</button>

```

| state | Meaning | Pill |
| --- | --- | --- |
| `synced` | Caught up | check + `Synced {lastSyncedAt}` |
| `syncing` | Transferring | spinner |
| `offline` | No connection | cloud-off |
| `pending` | Local changes queued | dot badge |
| `error` | Replication error | warning + "Retry now" → `syncNow()` |

* `syncNow(): Promise<void>` – manual one-shot sync.
* `listConflicts(): Promise<ConflictReport[]>` – for a future "Review changes" screen; returns the LwW winner + the **retained** losing revisions for conflicted doc.

## Repositories (the page API)

Each is a namespace import: `import { trips, itinerary, ... } from '$lib/db'`.

### `trips`

`list(opts)` · `sections(today?)` → `{ active, upcoming, past, archived }` (derived status, nights, countdown) · `get(id)` · `getWithDerived(id)` · `create(TripInput)` · `update(id, patch)` · `archive(id)` / `unarchive(id)` · `softDelete(id)` / `restore(id)` · `setCover(id, attId)` · `duplicate(id, DuplicateOptions)` (deep-copy children, optional date-shift, reset checklist).

### `itinerary`

`byTrip` · `byDay` · `unscheduled` · `dayList` · `create` · `update` · `softDelete` / `restore` · `moveToDay` · `reorderWithinDay` · `link(id, {flightId})` · `addAsExpense(itemId)` · `getDay` / `setDayMeta` (TripDay title/notes) · `dayTimeline(tripId, date)`  /  `tripTimeline(tripId)`  → merged `DayTimeline` (all-day + timed entries combining items, flight legs, reservation placements; daily to-dos; per-day cost `subtotal`).

### `checklist`

`byTrip` · `groups(tripId, {hideCompleted})` · `byDay` · `toBuy` · `todosForDay` · `progress` · `create` / `update` / `toggle` / `softDelete` / `restore` · `moveToGroup` · `reorderWithinGroup` · `resetChecks` · `checkAllInGroup` · `clearCompleted` · `applyTemplate(tripId, tripId, 'merge'|'replace')` · `saveAsTemplate(tripId, name)` · `templates.{list,get,create,update,remove,setDefault,getDefault}`.

### `flights`

`byTrip` (sorted by first depart) · `get` · `create` / `update` / `softDelete` / `restore` · `reorder` · `computeFlight(flight)`  → durations, layovers, "+1 day", route, stops (tz-aware) · `listAttachments` · `linkAttachment` / `unlinkAttachment`. Setting `cost` upserts one linked `expense` (`category: transport`); clearing it removes that expense.

### `reservations`

`byTrip` · `get` · `create` / `update` / `softDelete` / `restore` · `reorder` · `lodgingNights` · `datedForItinerary(tripId, date)` · `placementsForDate(list, date)` → check-in/check-out/staying/point · `listAttachments` · `link` / `unlinkAttachment`. `cost` upserts a linked `expense` with the category mapped by kind.

### `expenses`

`byTrip` / `byDay` / `byCategory` · `get` · `create` / `update` / `softDelete` / `restore` · `togglePaid` · `summary(tripId)` → est/actual/spent/unpaid + budget remaining + daily average · `byDayRollup` · `byCategoryRollup` · `report(tripid)` (all three) · `upsertLinkedExpense` / `removeLinkedExpense` / `findLinked` (used by flights & reservations – single source of truth).

### `attachments`

`create(tripId, ownerType, ownerId, file, resizeImages?)`  → large images are **client-resized** into `full` (~1600px) + `thumb` (~480px) blobs, others stored as a single `file` blob, all inline in `_attachments`; records the original `mime` **and** a derived `safeMime` · `get` · `byTrip` · `forOwner` ·  `pickBlobName(id, prefer?)`  → the blob name to display: returns `prefer` (`thumb` | `full` | `file`, default `file`) when that blob exists, else `file`, else the first blob, else `null` when the doc has no blobs. The UI uses it to choose a cover/thumbnail blob. ·  `objectUrl(id, name?)`  (offline viewing; pair with `revokeObjectUrl`) – when `name` is omitted it auto-picks via `pickBlobName(id, 'file')`, i.e. **falls back to the `file` blob** (then the first available) when no named blob exists · `setOwner` · `remove` (soft) / `purge` (hard) · `computeResizeDimensions(pure)` · `isInlineRenderable(mime)` / `safeViewMime(mime)` (pure: see **Attachment view safety** below).

### `settings`

`get()` (creates the `settings:app` singleton on first read) · `update(patch)`.

### `trash`

`list()` (all soft-deleted docs, labelled) · `restore(id)` / `purge(id)` · `restoreMany` / `purgeMany` · `empty()`.

## IDs (meaningful, prefix-sortable – matches the server)

| Doc | Id |
| --- | --- |
| trip | `trip:{ulid}` |
| TripDay | `day:{tripUlid}:{date}` |
| itinerary / checklistItem / flight / reservation / expense / attachment | `itin:` / `chk:` / `flt:` / `res:` / `exp:` / `att:` `{tripUlid}:{ulid}` |
| checklistTemplate | `tpl:{ulid}` |
| settings | `settings:app` |

* **Child ids embed the bare trip ULID** (the server's `_normalise_trip_id` strips `trip:`); the `tripId` field stores the full `trip:{ulid}` so it points at the trip document.
* Per-trip data is fetched with **prefix range scans** (`startkey`/`endkey` + `\ufff0`) – no index needed. Builders/parsers: `tripId()`, `expenseId()`, ..., `parseId()`, `tripTypeRange()`.

## Indexes (aligned 1:1 with FastAPI)

`ensureIndexes()` creates exactly the server's six Mango indexes (`api/app/couch.py` `INDEX_SPECS`), same names/ddocs/fields:

* `idx-type` `['type']` · `idx-type-tripid` `['type', 'tripId']` · `idx-type-startDate` `['type', 'startDate']`
* `idx-type-date` `['type', 'date']` · `idx-type-category` `['type', 'category']`
* `idx-type-deletedAt` `['type', 'deletedAt']`.

## Attachment view safety

A `blob:` object URL **inherits the app origin**, so an `image/svg+xml`, `text/html`, `application/xhtml+xml` (or any unknown) attachment rendered inline would execute script **same-origin** and could reach the admin-authed `/db` proxy (stored XSS). The data layer prevents this: `objectUrl()` builds the view Blob with **safeViewMime()**, so only an allowlist of inert types keeps its real MIME – everything else is served as `application/octet-stream` (download-only). Stored bytes and the original `mime` are never modified.

**Inline-renderable allowlist**: `image/png`, `image/jpeg`, `image/webp`, `image/gif`, `application/pdf` · `isInlineRenderable(mime)` / `safeViewMime(mime)` are pure (`attachment-mime.ts`).

**The Phase 3 viewer MUST follow**:

* Gate **all** inline display on `isInlineRenderable(att.mime)` (or check `att.safeMime`).
* Render allowlisted **raster** types only via `<img src={objectUrl(...)}>`.
* Render **PDFs** via a download link, or a `<iframe sandbox>` with **no** `allow-scripts`.
* **Never** point an `<iframe>` / `<object>` / `window.open` at an arbitrary attachment's object URL.
* Non-allowlisted types (svg/html/xhtml/unknown) are download-only – offer a download link (the `octet-stream` view type already forces download).

## Conflict policy

Deterministic **last-write-wins by `updatedAt**` (tie → keep the default, then highest revision hash). The winner is made authoritative and each **losing revision's content is retained** (never dropped) in a device-local log; its conflict branch is then **cleared** from the live revision tree, so the document stops being reported as conflicted instead of being re-resolved forever.

`listConflicts()` reads that log (current winner + retained losers) for a future "Review changes" screen, and `markConflictReviewed(id)` dismisses an entry. Pure decision in `conflicts.ts` (`pickWinner` / `planConflictResolution`); PouchDB wiring in `sync.ts`.

## Migrations

Every doc carries `schemaVersion` (current = `1`). `runMigrations()` migrates anything older on startup, then it re-syncs. Pure, versioned transforms live in `migrations.ts` (`migrateDoc`).

## Offline airport dataset

~150 major international airports (`code, name, city, country, tz`) in `airports.data.ts`, **lazy-loaded** (code-split, precached with the app shell). Source: public-domain OurAirports + the IANA tz database. API: `searchAirports(q)`, `getAirport(code)`, `toSegmentAirport(rec)`, `loadAirports()`, and the pure `searchAirportsIn(list, q)`.

## Module map

| File | Role |
| --- | --- |
| `index.ts` | Public barrel + `initDb()` |
| `constants.ts` · `ids.ts` · `schemas.ts` | Names/prefixes · id builders · Zod schemas + types |
| `datetime.ts` · `money.ts` | Pure date/tz + FX/budget maths |
| `conflicts.ts` · `migrations.ts` | Pure LwW + pure migrations |
| `pouch.ts` · `indexes.ts` · `base.ts` · `sync.ts` | PouchDB setup · Mango indexes · CRUD helpers · replication + status + conflicts |
| `airports.ts` · `airports.data.ts` | Offline airport lookup + dataset |
| `repositories/*.ts` | The typed page API (`repositories/attachment-mime.ts` = pure MIME allowlist) |
| `*.test.ts` | Vitest unit tests for the pure logic |

## Testing note

Pure-logic modules never import PouchDB, so their unit tests run anywhere. In this corporate environment `pouchdb-browser` / `pouchdb-find` 404 on the mirror and cannot be installed, so the PouchDB-bound modules and their integration tests cannot execute locally – they are written to the pouchdb-browser 7.x API and resolve in the production (public-npm) Docker build. Run pure tests with `pnpm -C web test`.
