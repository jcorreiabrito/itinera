<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { flights, itinerary, reservations, todayIso, trips } from '$lib/db';
  import type { Flight, ItineraryItem, Reservation, Trip } from '$lib/db';
  import { CalendarDays, Plus } from 'lucide-svelte';
  import { Button, EmptyState, ErrorState, Skeleton } from '$lib/components/ui';
  import ExportCalendarButton from '$lib/components/trip/ExportCalendarButton.svelte';
  import { DateStrip, ItineraryDay, ItineraryItemSheet, WholeTripOverview } from '$lib/components/itinerary';
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



  // Dynamically expand layout width for the Whole Trip Overview
  $effect(() => {
    if (typeof document !== 'undefined') {
      const mainEl = document.querySelector('main');
      if (mainEl) {
        if (viewMode === 'overview') {
          mainEl.classList.remove('max-w-5xl');
          mainEl.classList.add('max-w-none');
        } else {
          mainEl.classList.remove('max-w-none');
          mainEl.classList.add('max-w-5xl');
        }
      }
      return () => {
        if (mainEl) {
          mainEl.classList.remove('max-w-none');
          mainEl.classList.add('max-w-5xl');
        }
      };
    }
  });

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

<section aria-labelledby="itinerary-heading">
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
      <div class="flex items-center justify-between gap-4">
        {#if viewMode === 'day' && hasDays}
          <div class="flex-1 min-w-0">
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

        <div class="flex items-center space-x-2">
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
    </div>
  {/if}
</section>

<!-- Floating add button -->
{#if !loaded && !hasDays && ideasCount > 0}
  <button
    type="button"
    onclick={() => openAdd()}
    aria-label={t('add_activity')}
    class="fixed bottom-20 right-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-primary-600 px-5 text-base font-medium text-white shadow-card transition-colors hover:bg-primary-700 focus:visible:outline-none focus:visible:ring-2 focus:visible:ring-primary-600 focus:visible:ring-offset-2 focus:visible:ring-offset-bg lg:bottom-8 [&_svg]:size-5"
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
