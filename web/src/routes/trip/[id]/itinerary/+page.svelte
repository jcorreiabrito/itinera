<script lang="ts">
	import { onMount } from 'svelte';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { flights, itinerary, reservations, todayIso, trips } from '$lib/db';
	import type { Flight, ItineraryItem, Reservation, Trip } from '$lib/db';
	import { CalendarDays, Plus, Search, X, MapPin, Clock } from 'lucide-svelte';
	import { Button, EmptyState, ErrorState, Input, Skeleton } from '$lib/components/ui';
	import ExportCalendarButton from '$lib/components/trip/ExportCalendarButton.svelte';
	import {
		DateStrip,
		ItineraryDay,
		ItineraryItemSheet,
		TripMap,
		WholeTripOverview
	} from '$lib/components/itinerary';
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
	let timeline = $state<{
		days: itinerary.DayTimeline[];
		unscheduled: itinerary.DayTimeline;
	} | null>(null);
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
		flights: resolve(`/trip/${id}/bookings?tab=flights`),
		reservations: resolve(`/trip/${id}/bookings?tab=reservations`)
	});

	const allTripItems = $derived.by(() => {
		if (!timeline) return [];
		const itemsList: ItineraryItem[] = [];
		/*
		 * Called with two different array shapes: the all-day lanes hold bare
		 * `ItineraryItem`s while the timed lanes hold `TimelineEntry` wrappers.
		 * The predicate is explicit because `'kind' in entry` alone narrows an
		 * intersection of the two down to `{}` rather than to `ItineraryItem`.
		 */
		const isTimelineEntry = (
			e: ItineraryItem | itinerary.TimelineEntry
		): e is itinerary.TimelineEntry => 'kind' in e;
		const pushEntries = (entries: Array<ItineraryItem | itinerary.TimelineEntry>) => {
			for (const entry of entries) {
				if (isTimelineEntry(entry)) {
					if (entry.kind === 'item' && entry.item) itemsList.push(entry.item);
				} else {
					itemsList.push(entry);
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

	/*
	 * `allTripItems` (below) is the calendar export's payload, deliberately the
	 * whole trip rather than the day on screen. The export button sits next to
	 * the day strip, so passing the visible day's items made "download the
	 * calendar" quietly hand back one day of a two-week trip.
	 */
	const currentDayItems = $derived.by(() => {
		if (!currentDay) return [];
		const itemsList: ItineraryItem[] = [...currentDay.allDay];
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
		<EmptyState icon={CalendarDays} title={t('lets_plan_days')} description={t('plan_days_desc')}>
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
							{ideasCount}
							onselect={(d) => (selectedDate = d)}
						/>
					</div>
				{:else if viewMode === 'overview'}
					<h2 class="font-serif text-xl font-semibold text-ink">{t('whole_trip_overview')}</h2>
				{/if}

				<div class="flex shrink-0 items-center justify-between gap-2 sm:justify-end">
					{#if trip}
						<ExportCalendarButton
							{trip}
							items={allTripItems}
							flights={flightList}
							reservations={resList}
						/>
					{/if}

					<div
						class="inline-flex select-none items-center rounded-lg border border-border bg-surface-sunken p-1"
					>
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
			<div
				class="flex flex-col items-stretch gap-2 rounded-xl border border-border bg-surface p-2.5 shadow-soft sm:flex-row sm:items-center"
			>
				<div class="relative flex-1">
					<Input
						value={itinerarySearch}
						placeholder={t('search_placeholder')}
						class="pl-9 pr-11 text-sm"
						oninput={(e) => (itinerarySearch = e.currentTarget.value)}
					/>
					<Search
						class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted/50"
					/>
					{#if itinerarySearch}
						<button
							type="button"
							aria-label="Clear search"
							class="absolute right-0.5 top-1/2 grid size-11 min-h-[44px] min-w-[44px] -translate-y-1/2 place-items-center rounded text-ink-muted hover:text-ink active:scale-95 sm:size-9 sm:min-h-0 sm:min-w-0"
							onclick={() => (itinerarySearch = '')}
						>
							<X class="size-4" />
						</button>
					{/if}
				</div>

				<div class="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
					{#each [['all', t('filter_all')], ['sightseeing', t('cat_sightseeing')], ['food', t('cat_food')], ['transport', t('cat_transport')], ['lodging', t('cat_lodging')]] as [catVal, catLabel] (catVal)}
						<button
							type="button"
							class={cn(
								'flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center rounded-lg px-3 py-2 text-xs font-medium transition-colors sm:min-h-0 sm:py-1',
								itineraryCategory === catVal
									? 'bg-primary-600 text-white shadow-soft'
									: 'bg-surface-sunken text-ink-muted hover:bg-surface-sunken/80 hover:text-ink'
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
					<div class="flex items-center justify-between px-1 text-xs text-ink-muted">
						<span>{searchFilteredItems.length} {t('cat_activities').toLowerCase()}</span>
						<button
							type="button"
							class="font-medium text-primary-600 hover:underline"
							onclick={() => {
								itinerarySearch = '';
								itineraryCategory = 'all';
							}}
						>
							Clear filters
						</button>
					</div>

					{#if searchFilteredItems.length === 0}
						<div
							class="rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center text-sm text-ink-muted"
						>
							Nenhuma atividade corresponde aos critérios de busca.
						</div>
					{:else}
						<div class="flex flex-col gap-2">
							{#each searchFilteredItems as itm (itm._id)}
								<div
									role="button"
									tabindex="0"
									class="flex cursor-pointer items-center justify-between gap-3 rounded-lg border border-border bg-surface p-3 text-left shadow-soft transition-colors hover:bg-surface-sunken/60"
									onclick={() => openEdit(itm)}
									onkeydown={(e) => e.key === 'Enter' && openEdit(itm)}
								>
									<div class="min-w-0 flex-1">
										<div class="mb-1 flex items-center gap-2">
											<span
												class="rounded bg-primary-100 px-2 py-0.5 text-xs font-semibold text-primary-700"
											>
												{itm.date || t('ideas')}
											</span>
											{#if itm.startTime}
												<span class="flex items-center gap-1 text-xs text-ink-muted">
													<Clock class="size-3" />
													{itm.startTime}
												</span>
											{/if}
										</div>
										<div class="truncate text-sm font-medium text-ink">{itm.title}</div>
										{#if itm.location}
											<div class="mt-0.5 flex items-center gap-1 truncate text-xs text-ink-muted">
												<MapPin class="size-3 shrink-0" />
												<span
													>{typeof itm.location === 'string'
														? itm.location
														: itm.location.name || itm.location.address}</span
												>
											</div>
										{/if}
									</div>
									<Button variant="ghost" size="sm" class="shrink-0 text-xs">{t('edit')}</Button>
								</div>
							{/each}
						</div>
					{/if}
				</div>
			{:else}
				{#if allTripItems.length > 0}
					<div class="rounded-xl border border-border bg-surface p-1 shadow-soft">
						<TripMap
							items={allTripItems}
							destination={trip?.destinations[0]?.name}
							tripId={id}
							onchanged={reload}
						/>
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
								{flightsById}
								{reservationsById}
								{links}
								onedit={openEdit}
								onchanged={reload}
							/>
						{/key}
					{/if}
				{:else if timeline}
					<WholeTripOverview
						days={timeline.days}
						destinations={trip?.destinations ?? []}
						{homeCurrency}
						{links}
						onedit={openEdit}
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
		class="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-primary-600 px-5 text-base font-medium text-white shadow-card transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg lg:bottom-8 [&_svg]:size-5"
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
