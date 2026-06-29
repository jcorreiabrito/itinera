<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/state';
  import { checklist, expenses, flights, itinerary, reservations, todayIso, trips } from '$lib/db';
  import type { ChecklistItem, Flight, Reservation } from '$lib/db';
  import { ErrorState, Skeleton } from '$lib/components/ui';
  import {
    BudgetWidget,
    ChecklistWidget,
    FlightsWidget,
    HeroWidget,
    NextUpWidget,
    NotesWidget,
    ReservationsWidget,
    TodayPlanWidget
  } from '$lib/components/overview';
  import { computeNextUp, nextFlightIndex, summarizeReservations } from '$lib/overview';
  import { getTripShellContext } from '$lib/trip-context';
  import { startLive } from '$lib/live';

  const shell = getTripShellContext();
  const reloadSignal = shell.reloadSignal;

  const id = $derived(page.params.id ?? '');

  let loaded = $state(false);
  let loadError = $state(false);
  let everLoaded = false;
  let tripWD = $state<trips.TripWithDerived | null>(null);
  let timeline = $state<{ days: itinerary.DayTimeline[]; unscheduled: itinerary.DayTimeline } | null>(
    null
  );
  let checkItems = $state<ChecklistItem[]>([]);
  let budget = $state<expenses.BudgetSummary | null>(null);
  let flightList = $state<Flight[]>([]);
  let resList = $state<Reservation[]>([]);
  let today = $state(todayIso());

  async function loadAll(tripId: string) {
    if (!tripId) return;
    today = todayIso();
    try {
      const [t, tl, cl, b, fl, rl] = await Promise.all([
        trips.getWithDerived(tripId, today),
        itinerary.tripTimeline(tripId),
        checklist.byTrip(tripId),
        expenses.summary(tripId, today),
        flights.byTrip(tripId),
        reservations.byTrip(tripId)
      ]);
      tripWD = t;
      timeline = tl;
      checkItems = cl;
      budget = b;
      flightList = fl;
      resList = rl;
      everLoaded = true;
      loadError = false;
    } catch {
      // First-load failure surfaces an inline retry; later reloads keep prior data.
      if (!everLoaded) loadError = true;
    } finally {
      loaded = true;
    }
  }

  // Reload on route id change and whenever the shell signals a trip change.
  $effect(() => {
    const tid = id;
    void $reloadSignal;
    loadAll(tid);
  });

  onMount(() => startLive(() => loadAll(page.params.id ?? '')));

  function retry() {
    loadError = false;
    loaded = false;
    loadAll(id);
  }

  const isActive = $derived(tripWD?.derived.status === 'Active');

  const progress = $derived.by(() => {
    const total = checkItems.length;
    const done = checkItems.filter((i) => i.done).length;
    return { done, total, fraction: total ? done / total : 0 };
  });

  const topUnchecked = $derived(
    checkItems
      .filter((i) => !i.done)
      .sort((a, b) => {
        if (!!a.important !== !!b.important) return a.important ? -1 : 1;
        return (a.order ?? 0) - (b.order ?? 0);
      })
      .slice(0, 3)
  );

  const nextUp = $derived(timeline ? computeNextUp(timeline.days, Date.now()) : null);
  const todayPlan = $derived(timeline ? (timeline.days.find((d) => d.date === today) ?? null) : null);
  const resSummary = $derived(summarizeReservations(resList, Date.now()));
  const flightNext = $derived(nextFlightIndex(flightList, Date.now()));

  const links = $derived({
    itinerary: `/trip/${id}/itinerary`,
    checklist: `/trip/${id}/checklist`,
    costs: `/trip/${id}/costs`,
    flights: `/trip/${id}/bookings?tab=flights`,
    reservations: `/trip/${id}/bookings?tab=reservations`
  });
</script>

<svelte:head>
  <title>{tripWD?.title ?? 'Trip'} – Itinera</title>
</svelte:head>

{#if !loaded}
  <div class="space-y-5">
    <Skeleton class="aspect-[16/9] w-full rounded-xl sm:aspect-[5/2]" />
    <div class="grid gap-5 md:grid-cols-2">
      {#each Array(4) as _, i (i)}
        <Skeleton class="h-32 w-full rounded-lg" />
      {/each}
    </div>
  </div>
{:else if loadError}
  <ErrorState title="Couldn't load this trip" onretry={retry} />
{:else if tripWD && budget && timeline}
  <div class="grid gap-5 md:grid-cols-2">
    <div class="md:col-span-2">
      <HeroWidget trip={tripWD} />
    </div>

    <NextUpWidget {nextUp} href={links.itinerary} />

    {#if isActive}
      <TodayPlanWidget day={todayPlan} href={links.itinerary} />
    {/if}

    <ChecklistWidget
      done={progress.done}
      total={progress.total}
      fraction={progress.fraction}
      top={topUnchecked}
      href={links.checklist}
    />

    <BudgetWidget {budget} href={links.costs} />

    <FlightsWidget flights={flightList} nextIndex={flightNext} href={links.flights} />

    <ReservationsWidget summary={resSummary} reservations={resList} href={links.reservations} />

    <div class="md:col-span-2">
      <NotesWidget notes={tripWD.notes} onedit={shell.openEditor} />
    </div>
  </div>
{/if}
