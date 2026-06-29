<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { flights, itinerary, reservations, todayIso, trips } from '$lib/db';
  import type { Flight, ItineraryItem, Reservation, Trip } from '$lib/db';
  import { CalendarDays, Plus } from 'lucide-svelte';
  import { Button, EmptyState, ErrorState, Skeleton } from '$lib/components/ui';
  import { DateStrip, ItineraryDay, ItineraryItemSheet } from '$lib/components/itinerary';
  import { getTripShellContext } from '$lib/trip-context';
  import { startLive } from '$lib/live';

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

  const hasDays = $derived(dates.length > 0);

  function reload() {
    loadAll(id);
  }

  function retry() {
    loadError = false;
    loaded = false;
    loadAll(id);
  }

  function openAdd() {
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
  <title>Itinerary – {trip?.title ?? 'Trip'}</title>
</svelte:head>

<section aria-labelledby="itinerary-heading">
  <h1 id="itinerary-heading" class="sr-only">Itinerary</h1>

  {#if !loaded}
    <div class="space-y-4">
      <Skeleton class="h-16 w-full rounded-lg" />
      <Skeleton class="h-8 w-48 rounded-lg" />
      <Skeleton class="h-64 w-full rounded-lg" />
      <Skeleton class="h-24 w-full rounded-lg" />
    </div>
  {:else if loadError}
    <ErrorState title="Couldn't load your itinerary" onretry={retry} />
  {:else if !hasDays && ideasCount === 0}
    <EmptyState
      icon={CalendarDays}
      title="Let's plan your days"
      description="Add trip dates to build your day-by-day timeline – then map out activities, all-day items and daily to-dos."
    >
      <Button onclick={shell.openEditor}>Set trip dates</Button>
    </EmptyState>
  {:else}
    <div class="space-y-5">
      {#if hasDays}
        <DateStrip
          {dates}
          selected={selectedDate}
          {today}
          ideasCount={ideasCount}
          onselect={(d) => (selectedDate = d)}
        />
      {/if}

      {#if currentDay}
        {#key selectedKey}
          <ItineraryDay
            day={currentDay}
            tripid={id}
            {dates}
            {homeCurrency}
            flightList={flightList}
            reservationList={resList}
            {links}
            onedit={openEdit}
            onchanged={reload}
          />
        {/key}
      {/if}
    </div>
  {/if}
</section>

<!-- Floating add button -->
{#if !loaded && !hasDays && ideasCount > 0}
  <button
    type="button"
    onclick={openAdd}
    aria-label="Add activity"
    class="fixed bottom-20 right-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-primary-600 px-5 text-base font-medium text-white shadow-card transition-colors hover:bg-primary-700 focus:visible:outline-none focus:visible:ring-2 focus:visible:ring-primary-600 focus:visible:ring-offset-2 focus:visible:ring-offset-bg lg:bottom-8 [&_svg]:size-5"
  >
    <Plus />
    <span class="hidden sm:inline">Add activity</span>
  </button>
{/if}

<ItineraryItemSheet
  bind:open={sheetOpen}
  mode={sheetMode}
  tripid={id}
  item={sheetItem}
  defaultDate={selectedDate}
  {dates}
  flights={flightList}
  reservations={resList}
  {homeCurrency}
  onsaved={reload}
/>
