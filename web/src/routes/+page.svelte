<script lang="ts">
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { bareTripUid, settings, trips } from '$lib/db';
  import type { Trip } from '$lib/db';
  import { t } from '$lib/i18n.svelte';
  import { ChevronDown, Compass, MapPin, Plus, Search, Settings } from 'lucide-svelte';
  import { Button, Dialog, EmptyState, Skeleton, SyncStatusPill, toast } from '$lib/components/ui';
  import { DuplicateTripSheet, NewTripSheet, TripCard, TripFormSheet } from '$lib/components/trip';
  import { startLive } from '$lib/live';

  let sectionsData = $state<trips.TripSections | null>(null);
  let loading = $state(true);
  let search = $state('');
  let reloadKey = $state(0);
  let defaultCurrency = $state('EUR');
  let archiveOpen = $state(false);

  let createOpen = $state(false);
  let editOpen = $state(false);
  let editTrip = $state<Trip | null>(null);
  let dupOpen = $state(false);
  let dupTrip = $state<Trip | null>(null);
  let deleteOpen = $state(false);
  let deleteTrip = $state<Trip | null>(null);

  async function load() {
    try {
      sectionsData = await trips.sections();
    } catch {
      toast.error('Could not load your trips.');
    } finally {
      loading = false;
    }
  }

  function reload() {
    reloadKey += 1;
    load();
  }

  onMount(() => {
    load();
    settings
      .get()
      .then((s) => (defaultCurrency = s.homeCurrencyDefault ?? 'EUR'))
      .catch(() => {});
    return startLive(reload);
  });

  function matches(trip: trips.TripWithDerived, query: string): boolean {
    if (!query) return true;
    const q = query.toLowerCase();
    if (trip.title?.toLowerCase().includes(q)) return true;
    if (trip.tags?.some((t) => t.toLowerCase().includes(q))) return true;
    return (
      trip.destinations?.some(
        (d) => d.name?.toLowerCase().includes(q) || d.country?.toLowerCase().includes(q)
      ) ?? false
    );
  }

  const filtered = $derived.by(() => {
    if (!sectionsData) return null;
    const q = search.trim();
    const f = (list: trips.TripWithDerived[]) => list.filter((t) => matches(t, q));
    return {
      active: f(sectionsData.active),
      upcoming: f(sectionsData.upcoming),
      past: f(sectionsData.past),
      archived: f(sectionsData.archived)
    };
  });

  const totalTrips = $derived(
    sectionsData
      ? sectionsData.active.length +
        sectionsData.upcoming.length +
        sectionsData.past.length +
        sectionsData.archived.length
      : 0
  );

  const visibleNonArchived = $derived(
    filtered ? filtered.active.length + filtered.upcoming.length + filtered.past.length : 0
  );

  // Every trip, offered as a duplicate source in the new-trip flow.
  const allTrips = $derived<Trip[]>(
    sectionsData
      ? [
          ...sectionsData.active,
          ...sectionsData.upcoming,
          ...sectionsData.past,
          ...sectionsData.archived
        ]
      : []
  );

  // --- Actions -------------------------------------------------------------

  function openCreate() {
    createOpen = true;
  }

  function onCreated(trip: Trip) {
    goto(`/trip/${bareTripUid(trip._id)}/overview`);
  }

  function openEdit(trip: Trip) {
    editTrip = trip;
    editOpen = true;
  }

  function openDuplicate(trip: Trip) {
    dupTrip = trip;
    dupOpen = true;
  }

  function onDuplicated(trip: Trip) {
    toast.success('Trip duplicated.');
    goto(`/trip/${bareTripUid(trip._id)}/overview`);
  }

  async function archive(trip: Trip) {
    try {
      await trips.archive(bareTripUid(trip._id));
      reload();
    } catch {
      toast.error('Could not archive the trip.');
    }
  }

  async function unarchive(trip: Trip) {
    try {
      await trips.unarchive(bareTripUid(trip._id));
      reload();
    } catch {
      toast.error('Could not unarchive the trip.');
    }
  }

  function askDelete(trip: Trip) {
    deleteTrip = trip;
    deleteOpen = true;
  }

  async function confirmDelete() {
    if (!deleteTrip) return;
    const id = bareTripUid(deleteTrip._id);
    try {
      await trips.softDelete(id);
      toast.success('Trip moved to Trash.', {
        action: {
          label: 'Undo',
          onClick: async () => {
            try {
              await trips.restore(id);
              reload();
            } catch {
              toast.error('Could not undo. Try restoring from Trash.');
            }
          }
        }
      });
      reload();
    } catch {
      toast.error('Could not delete the trip.');
    } finally {
      deleteOpen = false;
      deleteTrip = null;
    }
  }
</script>

<svelte:head>
  <title>Itinera – {t('trips')}</title>
  <meta name="description" content="Plan and organize your trips, fully offline." />
</svelte:head>

<header class="sticky top-0 z-30 glass-header animate-slide-down">
  <div class="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6">
    <div class="flex items-center justify-between gap-3">
      <div class="flex items-center gap-2">
        <span
          class="grid size-9 place-items-center rounded-md bg-primary-600 text-white animate-bounce-soft [&_svg]:size-5"
        >
          <Compass />
        </span>
        <h1 class="font-serif text-2xl font-semibold">{t('trips')}</h1>
      </div>
      <div class="flex items-center gap-2">
        <SyncStatusPill />
        <a
          href="/settings"
          aria-label={t('settings')}
          class="grid size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink active:scale-95 [&_svg]:size-5"
        >
          <Settings />
        </a>
        <Button class="hidden sm:inline-flex" size="sm" onclick={openCreate}>
          <Plus class="size-4" /> {t('new_trip')}
        </Button>
      </div>
    </div>

    <div class="relative">
      <Search
        class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
      />
      <input
        type="search"
        value={search}
        oninput={(e) => (search = e.currentTarget.value)}
        placeholder={t('search_placeholder')}
        aria-label={t('search_placeholder')}
        class="w-1/2 w-full rounded-md glass-input pl-9 pr-3 text-base text-ink placeholder:text-ink-muted/60 focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/30 transition-[box-shadow] duration-150"
      />
    </div>
  </div>
</header>

<main class="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-12">
  {#if loading && !sectionsData}
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {#each Array(4) as _, i (i)}
        <div class="overflow-hidden rounded-lg border border-border bg-surface">
          <Skeleton class="aspect-[3/2] w-full rounded-none" />
          <div class="space-y-3 p-3">
            <Skeleton class="h-4 w-2/3" />
            <Skeleton class="h-3 w-full" />
            <Skeleton class="h-3 w-1/2" />
          </div>
        </div>
      {/each}
    </div>
  {:else if totalTrips === 0}
    <section aria-labelledby="trips-empty" class="flex min-h-[60dvh] flex-col">
      <h2 id="trips-empty" class="sr-only">{t('trips')}</h2>
      <EmptyState
        icon={MapPin}
        title={t('plan_first_trip')}
        description={t('empty_description')}
      >
        <Button size="lg" onclick={openCreate}>
          <Plus class="size-5" /> {t('new_trip')}
        </Button>
      </EmptyState>
    </section>
  {:else}
    <div class="space-y-8">
      {#if filtered}
        {#if filtered.active.length}
          {@render section('active_now', filtered.active, true, 0)}
        {/if}
        {#if filtered.upcoming.length}
          {@render section('upcoming', filtered.upcoming, false, filtered.active.length ? 80 : 0)}
        {/if}
        {#if filtered.past.length}
          {@render section('past', filtered.past, false, (filtered.active.length ? 80 : 0) + (filtered.upcoming.length ? 80 : 0))}
        {/if}

        {#if filtered.archived.length}
          <section aria-labelledby="section-archived">
            <button
              type="button"
              onclick={() => (archiveOpen = !archiveOpen)}
              aria-expanded={archiveOpen}
              class="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
            >
              <ChevronDown class="size-4 transition-transform ${archiveOpen ? '' : '-rotate-90'}" />
              {t('archived')}
            </button>
            {#if archiveOpen}
              <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {#each filtered.archived as trip (trip._id)}
                  <TripCard
                    {trip}
                    {reloadKey}
                    onedit={() => openEdit(trip)}
                    onduplicate={() => openDuplicate(trip)}
                    onarchive={() => archive(trip)}
                    onunarchive={() => unarchive(trip)}
                    ondelete={() => askDelete(trip)}
                  />
                {/each}
              </div>
            {/if}
          </section>
        {/if}
      {/if}

      {#if search.trim() && visibleNonArchived === 0 && filtered?.archived.length === 0}
        <p class="py-12 text-center text-ink-muted">
          {t('no_trips_found', { search: search.trim() })}
        </p>
      {/if}
    </div>
  {/if}
</main>

{#snippet section(label: string, list: trips.TripWithDerived[], highlight = false, sectionDelay = 0)}
  <section aria-labelledby={`section-${label}`} class="animate-slide-up" style="animation-delay: {sectionDelay}ms">
    <div class="mb-3 flex items-center gap-2">
      {#if highlight}
        <span class="size-2 rounded-full bg-success animate-pulse" aria-hidden="true"></span>
      {/if}
      <h2
        id={`section-${label}`}
        class={highlight
          ? 'text-sm font-semibold text-success'
          : 'text-sm font-semibold text-ink-muted'}
      >
        {t(label)}
      </h2>
    </div>
    <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {#each list as trip, i (trip._id)}
        <TripCard
          {trip}
          {reloadKey}
          animationDelay={i * 70}
          onedit={() => openEdit(trip)}
          onduplicate={() => openDuplicate(trip)}
          onarchive={() => archive(trip)}
          onunarchive={() => unarchive(trip)}
          ondelete={() => askDelete(trip)}
        />
      {/each}
    </div>
  </section>
{/snippet}

<!-- Floating action button (mobile) -->
<button
  type="button"
  onclick={openCreate}
  aria-label={t('new_trip')}
  class="fixed bottom-6 right-5 z-40 grid size-14 place-items-center rounded-full bg-primary-600 text-white shadow-sheet transition-colors hover:bg-primary-700 focus:visible:outline-none focus:visible:ring-2 focus:visible:ring-primary-600 focus:visible:ring-offset-2 focus:visible:ring-offset-bg sm:hidden [&_svg]:size-6"
>
  <Plus />
</button>

<NewTripSheet
  bind:open={createOpen}
  sources={allTrips}
  defaultCurrency={defaultCurrency}
  onsaved={onCreated}
  onduplicate={openDuplicate}
/>

<TripFormSheet
  bind:open={editOpen}
  mode="edit"
  trip={editTrip}
  defaultCurrency={defaultCurrency}
  onsaved={reload}
  onlivechange={reload}
/>

<DuplicateTripSheet bind:open={dupOpen} source={dupTrip} onsaved={onDuplicated} />

<Dialog
  bind:open={deleteOpen}
  title={t('delete_trip_title')}
  description={deleteTrip?.title
    ? `"${deleteTrip.title}" ${t('delete_trip_desc').toLowerCase()}`
    : t('delete_trip_desc')}
>
  <p class="text-sm text-ink-muted">
    {t('delete_trip_desc')}
  </p>
  {#snippet footer()}
    <Button variant="ghost" onclick={() => (deleteOpen = false)}>{t('cancel')}</Button>
    <Button variant="destructive" onclick={confirmDelete}>{t('delete')}</Button>
  {/snippet}
</Dialog>
