<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { flights, itinerary, reservations, todayIso, trips } from '$lib/db';
  import type { Flight, ItineraryItem, Reservation, Trip } from '$lib/db';
  import { CalendarDays, Plus, Search, X, MapPin, Clock } from 'lucide-svelte';
  import { Button, EmptyState, ErrorState, Input, Skeleton } from '$lib/components/ui';
  import ExportCalendarButton from '$lib/components/trip/ExportCalendarButton.svelte';
  import { DateStrip, ItineraryDay, ItineraryItemSheet, TripMap, WholeTripOverview } from '$lib/components/itinerary';
  import { getTripShellContext } from '$lib/trip-context';
  import { startLive } from '$lib/live';
  import { t } from '$lib/i18n.svelte';
  import { cn } from '$lib/utils';

  const shell = getTripShellContext();
  const reloadSignal = shell.reloadSignal;

  const id = $derived(page.params.id ?? '');

  let loaded = $state(false);
  let loadError = $state(false);
  let everLoaded = false;
  let trip = $state<Trip | null>(null);
  let timeline = $state<{ days: itinerary.DayTimeline[]; unscheduled: itinerary.DayTimeline } | null>(
    null
  );
  let flightList = $state<Flight[]>([]);
  let resList = $state<Reservation[]>([]);
  let today = $state(todayIso());

  // `null` selection = the Unscheduled / Ideas bucket.
  let selectedDate = $state<string | null>(null);
  let initForId = '';
  let viewMode = $state<'day' | 'overview'>('day');




  let sheetOpen = $state(false);
  let sheetMode = $state<'create' | 'edit'>('create');
  let sheetItem = $state<ItineraryItem | null>(null);

  function initSelection(tl: NonNullable<typeof timeline>) {
    const ds = tl.days.map((d) => d.date as string);
    const param = page.url.searchParams.get('date');
    if (param && ds.includes(param)) selectedDate = param;
    else if (param === 'ideas') selectedDate = null;
    else if (ds.includes(today)) selectedDate = today;
    else selectedDate = ds[0] ?? null;
  }

  async function loadAll(tid: string) {
    if (!tid) return;
    today = todayIso();
    try {
      const [t, tl, fl, rl] = await Promise.all([
        trips.get(tid),
        itinerary.tripTimeline(tid),
        flights.byTrip(tid),
        reservations.byTrip(tid)
      ]);
      trip = t;
      timeline = tl;
      flightList = fl;
      resList = rl;
      if (initForId !== tid) {
        initSelection(tl);
        initForId = tid;
      }
      everLoaded = true;
      loadError = false;
    } catch {
      // First-load failure surfaces an inline retry; later reloads keep prior data.
      if (!everLoaded) loadError = true;
    } finally {
      loaded = true;
    }
  }

  $effect(() => {
    const tid = id;
    void $reloadSignal;
    loadAll(tid);
  });

  onMount(() => startLive(() => loadAll(page.params.id ?? '')));

  const dates = $derived(timeline ? timeline.days.map((d) => d.date as string) : []);
  const homeCurrency = $derived(trip?.homeCurrency ?? 'EUR');
  const flightsById = $derived(new Map(flightList.map((f) => [f._id, f])));
  const reservationsById = $derived(new Map(resList.map((r) => [r._id, r])));
  const ideasCount = $derived(
    timeline ? timeline.unscheduled.allDay.length + timeline.unscheduled.timed.length : 0
  );

  const currentDay = $derived.by(() => {
    if (!timeline) return null;
    if (selectedDate === null) return timeline.unscheduled;
    return timeline.days.find((d) => d.date === selectedDate) ?? timeline.days[0] ?? null;
  });

  const selectedKey = $derived(selectedDate ?? 'ideas');
  const links = $derived({
    flights: `/trip/${id}/bookings?tab=flights`,
    reservations: `/trip/${id}/bookings?tab=reservations`
  });

  const allTripItems = $derived.by(() => {
    if (!timeline) return [];
    const itemsList: ItineraryItem[] = [];
    const pushEntries = (entries: any[]) => {
      for (const entry of entries) {
        if (entry && typeof entry === 'object') {
          if ('kind' in entry) {
            if (entry.kind === 'item' && entry.item) itemsList.push(entry.item as ItineraryItem);
          } else if ('_id' in entry && entry.type === 'itineraryItem') {
            itemsList.push(entry as ItineraryItem);
          }
        }
      }
    };
    for (const d of timeline.days) {
      pushEntries(d.allDay);
      pushEntries(d.timed);
    }
    pushEntries(timeline.unscheduled.allDay);
    pushEntries(timeline.unscheduled.timed);
    return itemsList;
  });

  let itinerarySearch = $state('');
  let itineraryCategory = $state<string>('all');

  const searchFilteredItems = $derived.by(() => {
    const q = itinerarySearch.trim().toLowerCase();
    const cat = itineraryCategory;
    if (!q && cat === 'all') return null;

    return allTripItems.filter((item) => {
      const matchCat = cat === 'all' || item.category === cat;
      if (!matchCat) return false;
      if (!q) return true;

      const titleMatch = item.title?.toLowerCase().includes(q);
      const notesMatch = item.notes?.toLowerCase().includes(q);
      let locMatch = false;
      if (typeof item.location === 'string') {
        locMatch = (item.location as string).toLowerCase().includes(q);
      } else if (item.location && typeof item.location === 'object') {
        const loc = item.location as { name?: string; address?: string };
        locMatch = Boolean(
          loc.name?.toLowerCase().includes(q) || loc.address?.toLowerCase().includes(q)
        );
      }
      return Boolean(titleMatch || notesMatch || locMatch);
    });
  });

  const currentDayItems = $derived.by(() => {
    if (!currentDay) return [];
    const itemsList: ItineraryItem[] = [];
    for (const item of currentDay.allDay) itemsList.push(item);
    for (const entry of currentDay.timed) {
      if (entry.kind === 'item' && entry.item) itemsList.push(entry.item);
    }
    return itemsList;
  });

  const hasDays = $derived(dates.length > 0);

  function reload() {
    loadAll(id);
  }

  function retry() {
    loadError = false;
    loaded = false;
    loadAll(id);
  }

  function openAdd(date: string | null = null) {
    if (date !== null) {
      selectedDate = date;
    }
    sheetMode = 'create';
    sheetItem = null;
    sheetOpen = true;
  }

  function openEdit(item: ItineraryItem) {
    sheetMode = 'edit';
    sheetItem = item;
    sheetOpen = true;
  }
</script>

<svelte:head>
  <title>{t('itinerary')} – {trip?.title ?? 'Trip'}</title>
</svelte:head>

<section aria-labelledby="itinerary-heading" class="pb-28">
  <h1 id="itinerary-heading" class="sr-only">{t('itinerary')}</h1>

  {#if !loaded}
    <div class="space-y-4">
      <Skeleton class="h-16 w-full rounded-lg" />
      <Skeleton class="h-8 w-48 rounded-lg" />
      <Skeleton class="h-64 w-full rounded-lg" />
      <Skeleton class="h-24 w-full rounded-lg" />
    </div>
  {:else if loadError}
    <ErrorState title={t('could_not_load_itinerary')} onretry={retry} />
  {:else if !hasDays && ideasCount === 0}
    <EmptyState
      icon={CalendarDays}
      title={t('lets_plan_days')}
      description={t('plan_days_desc')}
    >
      <Button onclick={shell.openEditor}>{t('set_trip_dates')}</Button>
    </EmptyState>
  {:else}
    <div class="space-y-5">
      <div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        {#if viewMode === 'day' && hasDays}
          <div class="w-full min-w-0 sm:flex-1">
            <DateStrip
              {dates}
              selected={selectedDate}
              {today}
              ideasCount={ideasCount}
              onselect={(d) => (selectedDate = d)}
            />
          </div>
        {:else if viewMode === 'overview'}
          <h2 class="font-serif text-xl font-semibold text-ink">{t('whole_trip_overview')}</h2>
        {/if}

        <div class="flex items-center justify-between sm:justify-end gap-2 shrink-0">
          {#if trip}
            <ExportCalendarButton {trip} items={currentDayItems} />
          {/if}

          <div class="inline-flex items-center rounded-lg border border-border bg-surface-sunken p-1 select-none">
            <button
              type="button"
              onclick={() => (viewMode = 'day')}
              class={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === 'day'
                  ? 'bg-surface text-primary-700 shadow-soft'
                  : 'text-ink-muted hover:text-ink'
              )}
            >
              {t('day')}
            </button>
            <button
              type="button"
              onclick={() => (viewMode = 'overview')}
              class={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                viewMode === 'overview'
                  ? 'bg-surface text-primary-700 shadow-soft'
                  : 'text-ink-muted hover:text-ink'
              )}
            >
              {t('overview')}
            </button>
          </div>
        </div>
      </div>

      <!-- Itinerary Search & Category Quick Filters -->
      <div class="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 rounded-xl border border-border bg-surface p-2.5 shadow-soft">
        <div class="relative flex-1">
          <Input
            value={itinerarySearch}
            placeholder="Buscar atividade, lugar, restaurante..."
            class="pl-9 pr-10 text-sm"
            oninput={(e) => (itinerarySearch = e.currentTarget.value)}
          />
          <Search class="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-ink-muted/50 pointer-events-none" />
          {#if itinerarySearch}
            <button
              type="button"
              aria-label="Clear search"
              class="absolute right-1 top-1/2 -translate-y-1/2 size-9 min-h-[36px] min-w-[36px] rounded grid place-items-center text-ink-muted hover:text-ink active:scale-95"
              onclick={() => (itinerarySearch = '')}
            >
              <X class="size-4" />
            </button>
          {/if}
        </div>

        <div class="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          {#each [['all', 'Todas'], ['sightseeing', 'Passeios'], ['food', 'Comida'], ['transport', 'Transporte'], ['lodging', 'Hospedagem']] as [catVal, catLabel]}
            <button
              type="button"
              class={cn(
                'min-h-[44px] sm:min-h-0 min-w-[44px] px-3 py-2 sm:py-1 text-xs font-medium rounded-lg shrink-0 transition-colors flex items-center justify-center',
                itineraryCategory === catVal
                  ? 'bg-primary-600 text-white shadow-soft'
                  : 'bg-surface-sunken text-ink-muted hover:text-ink hover:bg-surface-sunken/80'
              )}
              onclick={() => (itineraryCategory = catVal)}
            >
              {catLabel}
            </button>
          {/each}
        </div>
      </div>

      {#if searchFilteredItems !== null}
        <div class="flex flex-col gap-3">
          <div class="flex items-center justify-between text-xs text-ink-muted px-1">
            <span>{searchFilteredItems.length} atividades encontradas</span>
            <button
              type="button"
              class="text-primary-600 hover:underline font-medium"
              onclick={() => { itinerarySearch = ''; itineraryCategory = 'all'; }}
            >
              Limpar filtros
            </button>
          </div>

          {#if searchFilteredItems.length === 0}
            <div class="rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center text-sm text-ink-muted">
              Nenhuma atividade corresponde aos critérios de busca.
            </div>
          {:else}
            <div class="flex flex-col gap-2">
              {#each searchFilteredItems as itm (itm._id)}
                <div
                  role="button"
                  tabindex="0"
                  class="flex items-center justify-between gap-3 p-3 rounded-lg border border-border bg-surface hover:bg-surface-sunken/60 shadow-soft cursor-pointer transition-colors text-left"
                  onclick={() => openEdit(itm)}
                  onkeydown={(e) => e.key === 'Enter' && openEdit(itm)}
                >
                  <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                      <span class="text-xs font-semibold px-2 py-0.5 rounded bg-primary-100 text-primary-700">
                        {itm.date || 'Ideias'}
                      </span>
                      {#if itm.startTime}
                        <span class="text-xs text-ink-muted flex items-center gap-1">
                          <Clock class="size-3" />
                          {itm.startTime}
                        </span>
                      {/if}
                    </div>
                    <div class="font-medium text-ink text-sm truncate">{itm.title}</div>
                    {#if itm.location}
                      <div class="text-xs text-ink-muted truncate flex items-center gap-1 mt-0.5">
                        <MapPin class="size-3 shrink-0" />
                        <span>{typeof itm.location === 'string' ? itm.location : (itm.location.name || itm.location.address)}</span>
                      </div>
                    {/if}
                  </div>
                  <Button variant="ghost" size="sm" class="shrink-0 text-xs">Editar</Button>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      {:else}
        {#if allTripItems.length > 0}
          <div class="rounded-xl border border-border bg-surface p-1 shadow-soft">
            <TripMap items={allTripItems} destination={trip?.destinations[0]?.name} tripId={id} onchanged={reload} />
          </div>
        {/if}

        {#if viewMode === 'day'}
        {#if currentDay}
          {#key selectedKey}
            <ItineraryDay
              day={currentDay}
              tripId={id}
              {dates}
              destinations={trip?.destinations ?? []}
              {homeCurrency}
              travelerCount={trip?.travelerCount ?? 1}
              flightsById={flightsById}
              reservationsById={reservationsById}
              {links}
              onedit={openEdit}
              onchanged={reload}
            />
          {/key}
        {/if}
      {:else if timeline}
        <WholeTripOverview
          days={timeline.days}
          tripId={id}
          {dates}
          destinations={trip?.destinations ?? []}
          {homeCurrency}
          flightsById={flightsById}
          reservationsById={reservationsById}
          {links}
          onedit={openEdit}
          onchanged={reload}
          onaddactivity={(date) => openAdd(date)}
        />
      {/if}
      {/if}
    </div>
  {/if}
</section>

<!-- Floating add button -->
{#if loaded && (hasDays || ideasCount > 0)}
  <button
    type="button"
    onclick={() => openAdd()}
    aria-label={t('add_activity')}
    class="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-primary-600 px-5 text-base font-medium text-white shadow-card transition-colors hover:bg-primary-700 focus:visible:outline-none focus:visible:ring-2 focus:visible:ring-primary-600 focus:visible:ring-offset-2 focus:visible:ring-offset-bg lg:bottom-8 [&_svg]:size-5"
  >
    <Plus />
    <span class="hidden sm:inline">{t('add_activity')}</span>
  </button>
{/if}

<ItineraryItemSheet
  bind:open={sheetOpen}
  mode={sheetMode}
  tripId={id}
  item={sheetItem}
  defaultDate={selectedDate}
  {dates}
  flights={flightList}
  reservations={resList}
  {homeCurrency}
  onsaved={reload}
/>
