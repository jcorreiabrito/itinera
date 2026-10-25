<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { checklist, expenses, flights, itinerary, reservations, todayIso, trips } from '$lib/db';
	import type { ChecklistItem, Expense, Flight, Reservation } from '$lib/db';
	import { t } from '$lib/i18n.svelte';
	import { ErrorState, Skeleton } from '$lib/components/ui';
	import {
		BudgetWidget,
		ChecklistWidget,
		DestinationsWidget,
		FlightsWidget,
		HeroWidget,
		NextUpWidget,
		NotesWidget,
		ReservationsWidget,
		TodayPlanWidget
	} from '$lib/components/overview';
	import { ReadinessCard } from '$lib/components/readiness';
	import { flagEnabled } from '$lib/config';
	import { computeNextUp, nextFlightIndex, summarizeReservations } from '$lib/overview';
	import { computeReadiness } from '$lib/readiness';
	import { getTripShellContext } from '$lib/trip-context';
	import { startLive } from '$lib/live';

	const readinessEnabled = flagEnabled('readiness');
	const todayEnabled = flagEnabled('today');

	const shell = getTripShellContext();
	const reloadSignal = shell.reloadSignal;

	const id = $derived(page.params.id ?? '');

	let loaded = $state(false);
	let loadError = $state(false);
	let everLoaded = false;
	let tripWD = $state<trips.TripWithDerived | null>(null);
	let timeline = $state<{
		days: itinerary.DayTimeline[];
		unscheduled: itinerary.DayTimeline;
	} | null>(null);
	let checkItems = $state<ChecklistItem[]>([]);
	let budget = $state<expenses.BudgetSummary | null>(null);
	let flightList = $state<Flight[]>([]);
	let resList = $state<Reservation[]>([]);
	let expenseList = $state<Expense[]>([]);
	let today = $state(todayIso());

	async function loadAll(tripId: string) {
		if (!tripId) return;
		today = todayIso();
		try {
			const [t, tl, cl, b, fl, rl, el] = await Promise.all([
				trips.getWithDerived(tripId, today),
				itinerary.tripTimeline(tripId),
				checklist.byTrip(tripId),
				expenses.summary(tripId, today),
				flights.byTrip(tripId),
				reservations.byTrip(tripId),
				expenses.byTrip(tripId)
			]);
			tripWD = t;
			timeline = tl;
			checkItems = cl;
			budget = b;
			flightList = fl;
			resList = rl;
			expenseList = el;
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

	const readiness = $derived(
		tripWD
			? computeReadiness(
					{
						trip: tripWD,
						flights: flightList,
						reservations: resList,
						checklist: checkItems,
						expenses: expenseList
					},
					today
				)
			: null
	);

	const nextUp = $derived(timeline ? computeNextUp(timeline.days, Date.now()) : null);
	const todayPlan = $derived(
		timeline ? (timeline.days.find((d) => d.date === today) ?? null) : null
	);
	const resSummary = $derived(summarizeReservations(resList, Date.now()));
	const flightNext = $derived(nextFlightIndex(flightList, Date.now()));

	const links = $derived({
		today: resolve(`/trip/${id}/today`),
		itinerary: resolve(`/trip/${id}/itinerary`),
		checklist: resolve(`/trip/${id}/checklist`),
		costs: resolve(`/trip/${id}/costs`),
		flights: resolve(`/trip/${id}/bookings?tab=flights`),
		reservations: resolve(`/trip/${id}/bookings?tab=reservations`)
	});
</script>

<svelte:head>
	<title>{tripWD?.title?.trim() || t('untitled_trip')} – Itinera</title>
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
	<ErrorState title={t('could_not_load_trip')} onretry={retry} />
{:else if tripWD && budget && timeline}
	<div class="grid gap-5 md:grid-cols-2">
		<div class="min-w-0 md:col-span-2">
			<HeroWidget trip={tripWD} />
		</div>

		{#if (tripWD.destinations ?? []).length > 0}
			<div class="min-w-0 md:col-span-2">
				<DestinationsWidget destinations={tripWD.destinations ?? []} onedit={shell.openEditor} />
			</div>
		{/if}

		{#if readiness && readinessEnabled}
			<div class="min-w-0 md:col-span-2">
				<ReadinessCard {readiness} />
			</div>
		{/if}

		<NextUpWidget {nextUp} href={links.itinerary} />

		{#if isActive}
			<TodayPlanWidget day={todayPlan} href={todayEnabled ? links.today : links.itinerary} />
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

		<div class="min-w-0 md:col-span-2">
			<NotesWidget notes={tripWD.notes} onedit={shell.openEditor} />
		</div>
	</div>
{/if}
