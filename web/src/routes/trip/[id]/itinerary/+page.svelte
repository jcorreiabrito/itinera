<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { replaceState } from '$app/navigation';
	import { page } from '$app/state';
	import { resolve } from '$app/paths';
	import { flights, itinerary, reservations, todayIso, trips } from '$lib/db';
	import type { Flight, ItineraryItem, Reservation, Trip } from '$lib/db';
	import { CalendarDays, Plus, Search, X, MapPin, Clock } from 'lucide-svelte';
	import { Button, EmptyState, ErrorState, Input, Skeleton } from '$lib/components/ui';
	import ExportCalendarButton from '$lib/components/trip/ExportCalendarButton.svelte';
	import {
		DateStrip,
		DayRail,
		ItineraryDay,
		ItineraryItemSheet,
		ItemInspector,
		TripMap,
		WholeTripOverview,
		dayItems
	} from '$lib/components/itinerary';
	import { getTripShellContext } from '$lib/trip-context';
	import { startLive } from '$lib/live';
	import { t } from '$lib/i18n.svelte';
	import { cn } from '$lib/utils';
	import { itineraryUrl, readItineraryParams } from '$lib/utils/url-state';
	import { matchShortcut } from '$lib/shortcuts';
	import { clampSwipeOffset, swipeDirection, type SwipeDirection } from '$lib/gestures';
	import { viewport } from '$lib/stores/viewport.svelte';

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
	// Reactive, not a plain flag: the URL-sync effect below keys off it, and it
	// has to wake up when the first load for a trip finishes initialising.
	let initForId = $state('');
	let viewMode = $state<'day' | 'overview'>('day');

	let sheetOpen = $state(false);
	let sheetMode = $state<'create' | 'edit'>('create');
	let sheetItem = $state<ItineraryItem | null>(null);
	// The docked inspector owns its dirty guard; Escape must go through it so a
	// draft is not discarded just because the page handled the keystroke.
	let inspector = $state<{ requestClose: () => boolean } | null>(null);

	/** Apply the URL's view state once, when a trip is first shown. */
	function initSelection(tl: NonNullable<typeof timeline>) {
		const days = tl.days.map((d) => d.date as string);
		const view = readItineraryParams(page.url.searchParams, days, today);
		selectedDate = view.date;
		viewMode = view.overview ? 'overview' : 'day';
		itinerarySearch = view.query;
		itineraryCategory = view.category;
		if (view.item) openByUrlId(view.item, days);
	}

	/**
	 * Reopen the item a link points at.
	 *
	 * A reload — a phone reclaiming the tab, a shared link — should land the user
	 * back on the item they were editing, with the day it belongs to behind it.
	 * An id that no longer names a live item is ignored; the URL-sync effect drops
	 * it from the address bar on its first pass.
	 */
	function openByUrlId(itemId: string, days: string[]) {
		const target = allTripItems.find((item) => item._id === itemId);
		if (!target) return;
		const date = target.date ?? null;
		if (date && days.includes(date)) selectedDate = date;
		sheetMode = 'edit';
		sheetItem = target;
		sheetOpen = true;
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
			// A live reload can delete or move the item under the inspector. The
			// docked pane would otherwise keep editing a record that no longer exists.
			if (sheetOpen && sheetItem && !allTripItems.some((item) => item._id === sheetItem?._id)) {
				closeInspector();
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
	const ideasCount = $derived(timeline ? dayItems(timeline.unscheduled).length : 0);

	/*
	 * The three-pane workspace starts where Tailwind's `xl` does. The layout is
	 * switched in JS rather than by hiding a second copy with `hidden xl:grid`:
	 * two mounted copies would mean two Leaflet maps, and the off-screen one
	 * would initialise at zero size.
	 */
	const wide = $derived(viewport.width >= 1280);

	const currentDay = $derived.by(() => {
		if (!timeline) return null;
		if (selectedDate === null) return timeline.unscheduled;
		return timeline.days.find((d) => d.date === selectedDate) ?? timeline.days[0] ?? null;
	});

	const currentDayItems = $derived(currentDay ? dayItems(currentDay) : []);
	const selectedItemId = $derived(sheetOpen ? (sheetItem?._id ?? null) : null);

	const selectedKey = $derived(selectedDate ?? 'ideas');
	const links = $derived({
		flights: resolve(`/trip/${id}/bookings?tab=flights`),
		reservations: resolve(`/trip/${id}/bookings?tab=reservations`)
	});

	/*
	 * The calendar export's payload, deliberately the whole trip rather than the
	 * day on screen. The export button sits next to the day strip, so passing
	 * the visible day's items made "download the calendar" quietly hand back one
	 * day of a two-week trip.
	 */
	const allTripItems = $derived.by(() => {
		if (!timeline) return [];
		return [...timeline.days.flatMap(dayItems), ...dayItems(timeline.unscheduled)];
	});

	let itinerarySearch = $state('');
	let itineraryCategory = $state<string>('all');

	/*
	 * Keep the address bar in step with what is on screen, so a day, an overview
	 * and a filter can be linked, bookmarked, shared and reloaded.
	 *
	 * `replaceState` rather than a navigation: paging through a week must not fill
	 * the Back button with one entry per tap — Back should still leave the tab,
	 * which is what a user reaching for it mid-trip wants.
	 *
	 * The current URL is read from `window.location`, not from `page.url`, on
	 * purpose: depending on `page.url` here would re-enter this effect on every
	 * write, and the write would then have to be idempotent to terminate. Reading
	 * the location directly keeps the effect's dependencies to the four pieces of
	 * state it mirrors.
	 */
	$effect(() => {
		const tid = id;
		const date = selectedDate;
		const overview = viewMode === 'overview';
		const query = itinerarySearch;
		const category = itineraryCategory;
		// Only an *existing* item has a URL of its own: the create sheet is a
		// transient form with nothing yet to point at.
		const item = sheetOpen && sheetItem ? sheetItem._id : null;
		// Nothing to mirror until the URL has been read for *this* trip.
		if (!tid || initForId !== tid) return;
		const next = itineraryUrl(window.location.href, { date, overview, query, category, item });
		const current = `${window.location.pathname}${window.location.search}`;
		// Built from the live location rather than a route literal, so the path is
		// already the resolved one and `resolve()` has nothing to add — the same
		// reason `Button` opts out for its external and `blob:` hrefs.
		// eslint-disable-next-line svelte/no-navigation-without-resolve
		if (next !== current) replaceState(next, {});
	});

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

	/** Close the inspector and drop `?item=` through the URL-sync effect. */
	function closeInspector() {
		sheetOpen = false;
		sheetItem = null;
	}

	/**
	 * Put focus back on the active day rather than on `<body>`. The rail keeps a
	 * roving tabindex, so the selected entry is the one with `tabindex="0"`.
	 */
	function focusDayRail() {
		const rail = document.getElementById('itinerary-day-rail');
		rail?.querySelector<HTMLElement>('button[tabindex="0"]')?.focus();
	}

	/**
	 * Step through the day strip, including the Ideas bucket at either end.
	 *
	 * The strip's own arrow keys do this while focus is on a chip; these are for
	 * the rest of the screen, where the user has been reading an item and wants
	 * the next day without travelling back to the strip. `wrap` is deliberately
	 * absent — stopping at the ends says "there is no more trip this way", where
	 * wrapping silently jumps a fortnight.
	 */
	function stepDay(direction: 1 | -1) {
		if (!hasDays) return;
		const keys: (string | null)[] = ideasCount > 0 ? [...dates, null] : dates;
		const index = keys.findIndex((key) => key === selectedDate);
		if (index < 0) {
			selectedDate = keys[0] ?? null;
			return;
		}
		const next = index + direction;
		if (next < 0 || next >= keys.length) return;
		selectedDate = keys[next];
	}

	/*
	 * Swipe between days on the day view, for the phone layout where the rail is
	 * not mounted. Left goes forward, right goes back, matching a carousel and
	 * the reading direction. The day strip remains the discoverable control: this
	 * is an accelerator, so it is allowed to be undiscoverable, but never the
	 * only way to change day.
	 *
	 * Ignored starts: the drag handle (it owns horizontal movement too), links,
	 * buttons and form controls (a slider must keep its own gesture), and the
	 * Leaflet canvas (panning the map is not paging the day).
	 */
	const DAY_SWIPE_THRESHOLD = 64;
	const DAY_SWIPE_MAX = 80;
	let daySwipeX = $state(0);
	let daySwiping = $state(false);
	let daySwipeStart: { id: number; x: number; y: number } | null = null;
	/** Swallow the click a completed swipe would otherwise deliver to a card. */
	let swallowNextClick = false;
	let swallowTimer = 0;

	function daySwipeKeys(): (string | null)[] {
		return ideasCount > 0 ? [...dates, null] : dates;
	}

	function canStep(direction: SwipeDirection): boolean {
		const keys = daySwipeKeys();
		const index = keys.findIndex((key) => key === selectedDate);
		if (index < 0) return false;
		const next = index + (direction === 'left' ? 1 : -1);
		return next >= 0 && next < keys.length;
	}

	function onDayPointerDown(event: PointerEvent) {
		if (wide || viewMode !== 'day' || sheetOpen || !hasDays) return;
		if (event.pointerType === 'mouse' && event.button !== 0) return;
		if (event.isPrimary === false || daySwipeStart) return;
		const target = event.target as HTMLElement | null;
		if (
			target?.closest(
				'[data-drag-handle], a, button, input, textarea, select, [contenteditable], .leaflet-container'
			)
		)
			return;

		daySwipeStart = { id: event.pointerId, x: event.clientX, y: event.clientY };
		daySwiping = false;
		window.addEventListener('pointermove', onDayPointerMove, { passive: true });
		window.addEventListener('pointerup', onDayPointerUp);
		window.addEventListener('pointercancel', onDayPointerCancel);
	}

	function onDayPointerMove(event: PointerEvent) {
		const start = daySwipeStart;
		if (!start || event.pointerId !== start.id) return;
		const dx = event.clientX - start.x;
		const dy = event.clientY - start.y;
		if (!daySwiping) {
			// The browser normally cancels a vertical scroll; this covers the
			// browsers and synthetic events that do not.
			if (Math.abs(dy) > 14 && Math.abs(dy) >= Math.abs(dx)) {
				finishDaySwipe();
				return;
			}
			if (Math.abs(dx) < 14 || Math.abs(dx) <= Math.abs(dy)) return;
			daySwiping = true;
		}
		const direction: SwipeDirection = dx > 0 ? 'right' : 'left';
		daySwipeX = clampSwipeOffset(canStep(direction) ? dx : dx * 0.25, DAY_SWIPE_MAX);
	}

	function onDayPointerUp(event: PointerEvent) {
		const start = daySwipeStart;
		if (!start || event.pointerId !== start.id) return;
		const dx = event.clientX - start.x;
		const dy = event.clientY - start.y;
		const wasSwiping = daySwiping;
		finishDaySwipe();
		if (!wasSwiping) return;

		const direction = swipeDirection(dx, dy, DAY_SWIPE_THRESHOLD);
		if (!direction) return;
		swallowClick();
		if (!canStep(direction)) return;
		stepDay(direction === 'left' ? 1 : -1);
	}

	function onDayPointerCancel() {
		finishDaySwipe();
	}

	function finishDaySwipe() {
		if (daySwipeStart) {
			window.removeEventListener('pointermove', onDayPointerMove);
			window.removeEventListener('pointerup', onDayPointerUp);
			window.removeEventListener('pointercancel', onDayPointerCancel);
		}
		daySwipeStart = null;
		daySwiping = false;
		daySwipeX = 0;
	}

	function swallowClick() {
		swallowNextClick = true;
		clearTimeout(swallowTimer);
		swallowTimer = window.setTimeout(() => {
			swallowNextClick = false;
		}, 0);
	}

	function onDayClickCapture(event: MouseEvent) {
		if (!swallowNextClick) return;
		swallowNextClick = false;
		event.preventDefault();
		event.stopPropagation();
	}

	onDestroy(() => {
		finishDaySwipe();
		clearTimeout(swallowTimer);
	});

	function onShortcut(event: KeyboardEvent) {
		/*
		 * Escape closes the docked inspector and hands focus back to the rail.
		 * A native dialog that is open on top (day details, move-to-day) owns
		 * Escape first; stealing it would close the wrong thing.
		 */
		if (
			wide &&
			viewMode === 'day' &&
			event.key === 'Escape' &&
			sheetOpen &&
			!document.querySelector('dialog[open]')
		) {
			event.preventDefault();
			if (inspector?.requestClose() ?? true) focusDayRail();
			return;
		}
		// A sheet owns the keyboard while it is open: its fields are guarded by
		// `matchShortcut`, but its buttons are not, and `n` there would stack a
		// second sheet behind the first.
		if (sheetOpen || !loaded) return;
		switch (matchShortcut(event)) {
			case 'prev-day':
				event.preventDefault();
				stepDay(-1);
				break;
			case 'next-day':
				event.preventDefault();
				stepDay(1);
				break;
			case 'new-item':
				event.preventDefault();
				openAdd(selectedDate);
				break;
			default:
				break;
		}
	}
</script>

<svelte:window onkeydown={onShortcut} />

<svelte:head>
	<title>{t('itinerary')} – {trip?.title?.trim() || t('untitled_trip')}</title>
</svelte:head>

{#snippet dayTimeline()}
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
{/snippet}

{#snippet searchResults(items: ItineraryItem[])}
	<div class="flex flex-col gap-3">
		<div class="flex items-center justify-between px-1 text-xs text-ink-muted">
			<span>{items.length} {t('cat_activities').toLowerCase()}</span>
			<button
				type="button"
				class="font-medium text-primary-600 hover:underline"
				onclick={() => {
					itinerarySearch = '';
					itineraryCategory = 'all';
				}}
			>
				{t('workspace_clear_filters')}
			</button>
		</div>

		{#if items.length === 0}
			<div
				class="rounded-xl border border-dashed border-border bg-surface/50 p-8 text-center text-sm text-ink-muted"
			>
				{t('workspace_no_search_results')}
			</div>
		{:else}
			<div class="flex flex-col gap-2">
				{#each items as itm (itm._id)}
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
{/snippet}

<section aria-labelledby="itinerary-heading" class="pb-28">
	<h2 id="itinerary-heading" class="sr-only">{t('itinerary')}</h2>

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
				{#if viewMode === 'day' && hasDays && !wide}
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
							aria-label={t('clear_search')}
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

			{#if timeline && wide && viewMode === 'day'}
				<!--
					The shell only widens at 2xl, so the panes start narrower than their
					ideal width and grow with the column. `minmax(0,1fr)` and `min-w-0`
					on the centre are what stop a long item title from forcing the page
					to scroll sideways.
				-->
				<div
					class="grid grid-cols-[11rem_minmax(0,1fr)_20rem] items-start gap-4 2xl:grid-cols-[13rem_minmax(0,1fr)_22rem]"
				>
					<DayRail
						days={timeline.days}
						unscheduled={timeline.unscheduled}
						selected={selectedDate}
						{today}
						onselect={(d) => (selectedDate = d)}
					/>

					<div class="min-w-0 space-y-4">
						{#if searchFilteredItems !== null}
							{@render searchResults(searchFilteredItems)}
						{:else}
							{@render dayTimeline()}
							{#if currentDay}
								<div class="sticky bottom-4 z-10">
									<TripMap
										items={currentDayItems}
										destination={trip?.destinations[0]?.name}
										tripId={id}
										onchanged={reload}
										selectedId={selectedItemId}
										onselect={openEdit}
										heightClass="h-64"
									/>
								</div>
							{/if}
						{/if}
					</div>

					<ItemInspector
						bind:this={inspector}
						open={sheetOpen}
						mode={sheetMode}
						tripId={id}
						item={sheetItem}
						defaultDate={selectedDate}
						{dates}
						flights={flightList}
						reservations={resList}
						{homeCurrency}
						onsaved={reload}
						onclose={closeInspector}
						onclosed={focusDayRail}
						oncreate={() => openAdd()}
					/>
				</div>
			{:else if searchFilteredItems !== null}
				{@render searchResults(searchFilteredItems)}
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
					<!-- Swipe is an accelerator for the day strip, not a control of its own. -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div
						class={cn(
							'touch-pan-y will-change-transform',
							!daySwiping && 'transition-transform duration-200'
						)}
						style:transform={daySwipeX ? `translateX(${daySwipeX}px)` : undefined}
						onpointerdown={onDayPointerDown}
						onclickcapture={onDayClickCapture}
					>
						{@render dayTimeline()}
					</div>
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
{#if loaded && (hasDays || ideasCount > 0) && !(wide && viewMode === 'day')}
	<button
		type="button"
		onclick={() => openAdd()}
		aria-label={t('add_activity')}
		aria-keyshortcuts="n"
		class="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-primary-600 px-5 text-base font-medium text-white shadow-card transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg lg:bottom-8 [&_svg]:size-5"
	>
		<Plus />
		<span class="hidden sm:inline">{t('add_activity')}</span>
	</button>
{/if}

<!-- On phones and tablets the sheet stays the editor; the docked inspector takes
	over only in the wide day view, and the two never mount together. -->
{#if !wide || viewMode !== 'day'}
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
{/if}
