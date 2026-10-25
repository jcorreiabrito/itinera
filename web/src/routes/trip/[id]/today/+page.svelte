<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { checklist, flights, itinerary, reservations, trips } from '$lib/db';
	import type { ChecklistItem, Flight, Reservation, Trip } from '$lib/db';
	import { countdownText, dateOf } from '$lib/db/datetime';
	import { entryKey } from '$lib/db/repositories/itinerary';
	import { CalendarDays } from 'lucide-svelte';
	import { Button, EmptyState, ErrorState, Skeleton, toast } from '$lib/components/ui';
	import {
		BeforeTripCard,
		NowCard,
		TodayChecklist,
		TodayTickets,
		TodayTimeline
	} from '$lib/components/today';
	import { formatWeekdayDate } from '$lib/format';
	import { getTripShellContext } from '$lib/trip-context';
	import { startLive } from '$lib/live';
	import { t } from '$lib/i18n.svelte';
	import { computeNowState, flightsOn, localNowIso, reservationsOn } from '$lib/today';

	const shell = getTripShellContext();
	const reloadSignal = shell.reloadSignal;
	const id = $derived(page.params.id ?? '');

	let loaded = $state(false);
	let loadError = $state(false);
	let everLoaded = false;
	let trip = $state<Trip | null>(null);
	let timeline = $state<{
		days: itinerary.DayTimeline[];
		unscheduled: itinerary.DayTimeline;
	} | null>(null);
	let dayView = $state<checklist.ChecklistDayView[]>([]);
	let flightList = $state<Flight[]>([]);
	let resList = $state<Reservation[]>([]);

	/**
	 * The page's one clock.
	 *
	 * Stored as local wall-clock ISO rather than a `Date`, because that is how
	 * every itinerary day stores its times. The single interval below ticks it;
	 * `loadAll` also refreshes it, so a reload after the tab wakes does not show
	 * a stale minute beside fresh data.
	 */
	let now = $state(localNowIso());

	async function loadAll(tripId: string) {
		if (!tripId) return;
		now = localNowIso();
		try {
			const [tripDoc, tl, dv, fl, rl] = await Promise.all([
				trips.get(tripId),
				itinerary.tripTimeline(tripId),
				checklist.byDay(tripId),
				flights.byTrip(tripId),
				reservations.byTrip(tripId)
			]);
			trip = tripDoc;
			timeline = tl;
			dayView = dv;
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

	$effect(() => {
		const tid = id;
		void $reloadSignal;
		loadAll(tid);
	});

	onMount(() => {
		// A tab that was asleep can miss the interval entirely; catch up now.
		now = localNowIso();
		const interval = setInterval(() => {
			now = localNowIso();
		}, 30_000);
		const stopLive = startLive(() => loadAll(page.params.id ?? ''));
		return () => {
			clearInterval(interval);
			stopLive();
		};
	});

	function retry() {
		loadError = false;
		loaded = false;
		loadAll(id);
	}

	// Same call the checklist page makes, so both routes agree on what a tick means.
	async function toggleTodo(item: ChecklistItem) {
		try {
			await checklist.toggle(item._id);
			loadAll(id);
		} catch {
			toast.error(t('could_not_toggle_item'));
		}
	}

	const todayDate = $derived(dateOf(now) ?? '');
	const nowState = $derived(timeline ? computeNowState(timeline.days, now) : null);
	const todayDay = $derived(
		timeline && todayDate ? (timeline.days.find((day) => day.date === todayDate) ?? null) : null
	);
	const firstDay = $derived(timeline?.days[0] ?? null);
	const todos = $derived(dayView.find((view) => view.date === todayDate)?.items ?? []);
	const todaysFlights = $derived(todayDate ? flightsOn(flightList, todayDate) : []);
	const todaysReservations = $derived(todayDate ? reservationsOn(resList, todayDate) : []);
	const currentKey = $derived(nowState?.current ? entryKey(nowState.current) : null);
	const countdown = $derived(
		trip?.startDate && trip.endDate && todayDate
			? countdownText(trip.startDate, trip.endDate, todayDate)
			: ''
	);

	const links = $derived({
		itinerary: resolve('/trip/[id]/itinerary', { id }),
		bookings: resolve('/trip/[id]/bookings', { id }),
		overview: resolve('/trip/[id]/overview', { id })
	});
</script>

<svelte:head>
	<title>{t('today_title')} – {trip?.title?.trim() || t('untitled_trip')} – Itinera</title>
</svelte:head>

{#if !loaded}
	<div class="space-y-4">
		<Skeleton class="h-44 w-full rounded-lg" />
		<Skeleton class="h-28 w-full rounded-lg" />
		<Skeleton class="h-28 w-full rounded-lg" />
	</div>
{:else if loadError}
	<ErrorState title={t('could_not_load_itinerary')} onretry={retry} />
{:else if nowState}
	<header class="mb-4 flex items-baseline justify-between gap-3">
		<h2 class="font-serif text-xl font-semibold text-ink">{t('today_title')}</h2>
		{#if todayDate}
			<span class="text-sm text-ink-muted">{formatWeekdayDate(todayDate)}</span>
		{/if}
	</header>

	{#if nowState.phase === 'nodates'}
		<EmptyState icon={CalendarDays} title={t('no_dates_yet')} description={t('today_needs_dates')}>
			<Button href={links.itinerary}>{t('set_trip_dates')}</Button>
		</EmptyState>
	{:else if nowState.phase === 'before'}
		<BeforeTripCard {countdown} {firstDay} hrefItinerary={links.itinerary} />
	{:else if nowState.phase === 'after'}
		<EmptyState
			icon={CalendarDays}
			title={t('today_after_title')}
			description={t('today_after_desc')}
		>
			<Button href={links.itinerary}>{t('itinerary')}</Button>
		</EmptyState>
	{:else}
		<div class="space-y-5">
			<NowCard
				state={nowState}
				day={todayDay}
				nowIso={now}
				dayLabel={countdown}
				hrefItinerary={links.itinerary}
			/>

			{#if todayDay}
				<TodayTimeline day={todayDay} {currentKey} hrefBookings={links.bookings} />
			{/if}

			{#if todos.length > 0}
				<TodayChecklist items={todos} ontoggle={toggleTodo} />
			{/if}

			{#if todaysFlights.length > 0 || todaysReservations.length > 0}
				<TodayTickets
					flights={todaysFlights}
					reservations={todaysReservations}
					date={todayDate}
					hrefBookings={links.bookings}
				/>
			{/if}

			<!-- Overview has no mobile tab; it is reached from here instead. -->
			<nav
				class="flex flex-wrap items-center gap-2 border-t border-border pt-4"
				aria-label={t('trip_sections')}
			>
				<Button variant="ghost" size="sm" href={links.itinerary}>{t('itinerary')}</Button>
				<Button variant="ghost" size="sm" href={links.overview}>{t('overview')}</Button>
			</nav>
		</div>
	{/if}
{/if}
