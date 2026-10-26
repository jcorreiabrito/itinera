<script lang="ts">
	import { onMount } from 'svelte';
	import { goto, pushState, replaceState } from '$app/navigation';
	import { resolve } from '$app/paths';
	import { page } from '$app/state';
	import { bareTripUid, prefixScan, settings, todayIso, trips } from '$lib/db';
	import type { ChecklistItem, ItineraryItem, Reservation, Trip } from '$lib/db';
	import { t, type TranslationKey } from '$lib/i18n.svelte';
	import { countPlanning, type HorizonCounts } from '$lib/horizon';
	import {
		ChevronDown,
		History,
		MapPin,
		Plus,
		RotateCw,
		Search,
		Settings,
		Sparkles
	} from 'lucide-svelte';
	import {
		Button,
		Dialog,
		EmptyState,
		ErrorBoundary,
		Skeleton,
		SyncStatusPill,
		ThemeToggle,
		toast
	} from '$lib/components/ui';
	import IosStorageNotice from '$lib/components/ui/IosStorageNotice.svelte';
	import TripTemplateModal from '$lib/components/trip/TripTemplateModal.svelte';
	import { DuplicateTripSheet, NewTripSheet, TripCard, TripFormSheet } from '$lib/components/trip';
	import { HorizonTimeline } from '$lib/components/horizon';
	import ItineraLogo from '$lib/components/brand/ItineraLogo.svelte';
	import { startLive } from '$lib/live';
	import {
		onlyTextFilterChanged,
		readTripsParams,
		tripsUrl,
		type TripsFilter
	} from '$lib/utils/url-state';

	let sectionsData = $state<trips.TripSections | null>(null);
	let loading = $state(true);
	/*
	 * Distinct from `loading`: a failed load used to only raise a toast, which
	 * auto-dismisses, leaving the trip list showing the empty state — i.e. the
	 * app told the user they had no trips when it simply could not read them.
	 */
	let loadError = $state(false);
	/*
	 * The search box and the stage filter decide which trips the page shows, so
	 * they live in the query string: a reload, a shared link or Back into this
	 * page has to bring back the list you were looking at. Read once, at
	 * initialisation, so the first frame is already the linked one.
	 */
	const fromUrl = readTripsParams(page.url.searchParams);
	let search = $state(fromUrl.query);
	let filterTab = $state<TripsFilter>(fromUrl.filter);
	let reloadKey = $state(0);
	let defaultCurrency = $state('EUR');
	// Child-document counts for the horizon, keyed by trip id. Read once for all
	// trips in `load()` rather than one query per trip.
	let horizonCounts = $state<HorizonCounts>({});
	let horizonToday = $state(todayIso());
	// A disclosure inside one section, not a filter over the list: left out of the
	// URL, where it would only add noise to every shared link.
	let archiveOpen = $state(false);

	let templateOpen = $state(false);
	let createOpen = $state(page.url.searchParams.get('new') === '1');
	let editOpen = $state(false);
	let editTrip = $state<Trip | null>(null);
	let dupOpen = $state(false);
	let dupTrip = $state<Trip | null>(null);
	let deleteOpen = $state(false);
	let deleteTrip = $state<Trip | null>(null);

	/** The URL this page owns, for the popstate guard in `onMount`. */
	const ownPath = resolve('/');

	/**
	 * Take the filter state from a query string.
	 *
	 * Used for Back/Forward, which move between the history entries the effect
	 * below pushes: by the time the event fires the browser is already on the
	 * other URL, so applying it here is what makes Back show the previous filter
	 * instead of leaving the current one on screen.
	 */
	function applyUrlState(params: URLSearchParams) {
		const state = readTripsParams(params);
		search = state.query;
		filterTab = state.filter;
	}

	/*
	 * Keep the address bar in step with what is on screen, so a search, a stage
	 * filter and the list they produce can be linked, bookmarked, shared and
	 * reloaded — the same shape as the itinerary's effect.
	 *
	 * The current URL is read from `window.location`, not from `page.url`: the
	 * latter would make this effect depend on its own writes, and the write
	 * would then have to be idempotent to terminate.
	 *
	 * Typing in the search box only *replaces* the current entry, so a
	 * five-letter search is not five Back presses; the stage filter is a
	 * deliberate act that pushes, so Back undoes it. The first pass normalises
	 * whatever the URL already said and replaces, for the same reason.
	 */
	let urlNormalised = false;
	$effect(() => {
		const nextQuery = search;
		const nextFilter = filterTab;
		const next = tripsUrl(window.location.href, { query: nextQuery, filter: nextFilter });
		const current = `${window.location.pathname}${window.location.search}`;
		if (next === current) {
			urlNormalised = true;
			return;
		}
		/*
		 * Built from the live location rather than a route literal, so the path is
		 * already the resolved one and `resolve()` has nothing to add.
		 */
		/* eslint-disable svelte/no-navigation-without-resolve */
		if (urlNormalised && !onlyTextFilterChanged(current, next)) pushState(next, {});
		else replaceState(next, {});
		/* eslint-enable svelte/no-navigation-without-resolve */
		urlNormalised = true;
	});

	/*
	 * The command palette opens New trip by navigating to /?new=1. Arriving
	 * from another route is covered by the initial read above, but when the
	 * palette runs while this page is already mounted only an effect sees it.
	 * Drop the parameter once consumed so Back does not reopen the sheet.
	 */
	$effect(() => {
		if (page.url.searchParams.get('new') !== '1') return;
		createOpen = true;
		const url = new URL(page.url);
		url.searchParams.delete('new');
		// The current page minus one parameter: already resolved, nothing to add.
		/* eslint-disable svelte/no-navigation-without-resolve */
		replaceState(url, {});
		/* eslint-enable svelte/no-navigation-without-resolve */
	});

	async function load() {
		loadError = false;
		try {
			/*
			 * The horizon needs each trip's itinerary, checklist and lodging
			 * counts. `sections()` already loads every trip, so the counts ride
			 * the same pass: three prefix scans cover all trips at once, where
			 * asking each repository per trip would be three queries per card.
			 */
			const today = todayIso();
			const [sections, itineraryDocs, checklistDocs, reservationDocs] = await Promise.all([
				trips.sections(today),
				prefixScan<ItineraryItem>('itin:'),
				prefixScan<ChecklistItem>('chk:'),
				prefixScan<Reservation>('res:')
			]);
			sectionsData = sections;
			horizonCounts = countPlanning(itineraryDocs, checklistDocs, reservationDocs);
			horizonToday = today;
		} catch {
			loadError = true;
			toast.error(t('could_not_load_trips'));
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
		const stopLive = startLive(reload);
		/*
		 * The pathname is checked before applying: a Back that leaves this page
		 * also fires here, and copying the next page's query string onto this
		 * page's state would mirror it straight back into the address bar,
		 * fighting the navigation already under way.
		 */
		const onPopstate = () => {
			if (window.location.pathname !== ownPath) return;
			applyUrlState(new URLSearchParams(window.location.search));
		};
		window.addEventListener('popstate', onPopstate);
		return () => {
			stopLive();
			window.removeEventListener('popstate', onPopstate);
		};
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
			planning: f(sectionsData.planning),
			past: f(sectionsData.past),
			archived: f(sectionsData.archived)
		};
	});

	const totalTrips = $derived(
		sectionsData
			? sectionsData.active.length +
					sectionsData.upcoming.length +
					sectionsData.planning.length +
					sectionsData.past.length +
					sectionsData.archived.length
			: 0
	);

	const visibleNonArchived = $derived(
		filtered
			? filtered.active.length +
					filtered.upcoming.length +
					filtered.planning.length +
					filtered.past.length
			: 0
	);

	// Every trip, offered as a duplicate source in the new-trip flow.
	const allTrips = $derived<Trip[]>(
		sectionsData
			? [
					...sectionsData.active,
					...sectionsData.upcoming,
					...sectionsData.planning,
					...sectionsData.past,
					...sectionsData.archived
				]
			: []
	);

	/*
	 * The horizon covers every non-archived trip, not just the cards matching
	 * the search box or the stage filter: a trip the filter hides still needs
	 * its gap flagged. Archived trips are excluded, like the horizon model.
	 */
	const horizonTrips = $derived<Trip[]>(
		sectionsData
			? [
					...sectionsData.active,
					...sectionsData.upcoming,
					...sectionsData.planning,
					...sectionsData.past
				]
			: []
	);

	// --- Actions -------------------------------------------------------------

	function openCreate() {
		createOpen = true;
	}

	function onCreated(trip: Trip) {
		goto(resolve(`/trip/${bareTripUid(trip._id)}/overview`));
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
		toast.success(t('trip_duplicated'));
		goto(resolve(`/trip/${bareTripUid(trip._id)}/overview`));
	}

	async function archive(trip: Trip) {
		try {
			await trips.archive(bareTripUid(trip._id));
			reload();
		} catch {
			toast.error(t('could_not_archive_trip'));
		}
	}

	async function unarchive(trip: Trip) {
		try {
			await trips.unarchive(bareTripUid(trip._id));
			reload();
		} catch {
			toast.error(t('could_not_unarchive_trip'));
		}
	}

	async function changeStage(trip: Trip, stage: 'planning' | 'confirmed') {
		try {
			await trips.setStage(bareTripUid(trip._id), stage);
			reload();
		} catch {
			toast.error(t('could_not_change_stage'));
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
			toast.success(t('trip_moved_to_trash'), {
				action: {
					label: t('undo'),
					onClick: async () => {
						try {
							await trips.restore(id);
							reload();
						} catch {
							toast.error(t('could_not_undo'));
						}
					}
				}
			});
			reload();
		} catch {
			toast.error(t('could_not_delete_trip'));
		} finally {
			deleteOpen = false;
			deleteTrip = null;
		}
	}
</script>

<svelte:head>
	<title>Itinera – {t('trips')}</title>
	<meta name="description" content={t('app_meta_description')} />
</svelte:head>

<header class="pt-safe glass-header sticky top-0 z-30 animate-slide-down">
	<div class="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-3 sm:px-6">
		<div class="flex items-center justify-between gap-3">
			<div class="flex items-center gap-2.5">
				<ItineraLogo size={36} />
				<div>
					<span
						class="block font-sans text-[10px] font-semibold uppercase leading-none tracking-wider text-primary-700 dark:text-primary-400"
						>Itinera</span
					>
					<h1 class="font-serif text-2xl font-semibold leading-tight text-ink">{t('trips')}</h1>
				</div>
			</div>
			<div class="flex items-center gap-2">
				<SyncStatusPill />
				<a
					href={resolve('/settings/conflicts')}
					aria-label={t('sync_conflict_history')}
					title={t('sync_conflict_history')}
					class="hidden size-9 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink active:scale-95 sm:grid [&_svg]:size-4"
				>
					<History />
				</a>
				<ThemeToggle />
				<a
					href={resolve('/settings')}
					aria-label={t('settings')}
					class="grid size-11 min-h-[44px] min-w-[44px] place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink active:scale-95 sm:size-9 sm:min-h-0 sm:min-w-0 [&_svg]:size-5"
				>
					<Settings />
				</a>
				<Button
					variant="ghost"
					size="sm"
					class="hidden sm:inline-flex"
					onclick={() => (templateOpen = true)}
				>
					<Sparkles class="size-4" />
					<span>{t('templates')}</span>
				</Button>
				<Button class="hidden sm:inline-flex" size="sm" onclick={openCreate}>
					<Plus class="size-4" />
					{t('new_trip')}
				</Button>
			</div>
		</div>

		<div class="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
			<div class="relative w-full sm:max-w-sm">
				<Search
					class="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-muted"
				/>
				<input
					type="search"
					value={search}
					oninput={(e) => (search = e.currentTarget.value)}
					placeholder={t('search_placeholder')}
					aria-label={t('search_placeholder')}
					class="glass-input w-full rounded-md pl-9 pr-3 text-base text-ink transition-[box-shadow] duration-150 placeholder:text-ink-muted focus:border-primary-600 focus:outline-none focus:ring-2 focus:ring-primary-600/30"
				/>
			</div>

			<div
				class="flex w-full items-center justify-center gap-1 rounded-md border border-border bg-surface p-1 shadow-sm sm:w-auto"
			>
				<button
					class="flex-1 rounded px-3 py-1.5 text-center text-sm font-medium transition-colors sm:flex-initial {filterTab ===
					'all'
						? 'bg-primary-100 text-primary-700'
						: 'text-ink-muted hover:text-ink'}"
					onclick={() => (filterTab = 'all')}
				>
					{t('filter_all')}
				</button>
				<button
					class="flex-1 rounded px-3 py-1.5 text-center text-sm font-medium transition-colors sm:flex-initial {filterTab ===
					'confirmed'
						? 'bg-primary-100 text-primary-700'
						: 'text-ink-muted hover:text-ink'}"
					onclick={() => (filterTab = 'confirmed')}
				>
					{t('filter_confirmed')}
				</button>
				<button
					class="flex-1 rounded px-3 py-1.5 text-center text-sm font-medium transition-colors sm:flex-initial {filterTab ===
					'planning'
						? 'bg-primary-100 text-primary-700'
						: 'text-ink-muted hover:text-ink'}"
					onclick={() => (filterTab = 'planning')}
				>
					{t('filter_planning')}
				</button>
			</div>
		</div>
	</div>
</header>

<main id="page-content" class="mx-auto w-full max-w-6xl flex-1 px-4 pb-28 pt-5 sm:px-6 lg:pb-12">
	<IosStorageNotice compact />
	<ErrorBoundary>
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
		{:else if loadError && !sectionsData}
			<section
				aria-labelledby="trips-error"
				class="flex min-h-[60dvh] flex-col items-center justify-center text-center"
			>
				<h2 id="trips-error" class="font-serif text-xl font-semibold text-ink">
					{t('could_not_load_trips')}
				</h2>
				<p class="mt-2 max-w-prose text-sm text-ink-muted">{t('error_generic_desc')}</p>
				<Button class="mt-5" onclick={reload}>
					<RotateCw class="size-4" />
					{t('retry')}
				</Button>
			</section>
		{:else if totalTrips === 0}
			<section aria-labelledby="trips-empty" class="flex min-h-[60dvh] flex-col">
				<h2 id="trips-empty" class="sr-only">{t('trips')}</h2>
				<EmptyState icon={MapPin} title={t('plan_first_trip')} description={t('empty_description')}>
					<div class="mt-4 flex flex-wrap items-center justify-center gap-3">
						<Button size="lg" onclick={openCreate}>
							<Plus class="size-5" />
							{t('new_trip')}
						</Button>
						<Button variant="secondary" size="lg" onclick={() => (templateOpen = true)}>
							<Sparkles class="size-5" />
							{t('browse_all_templates')}
						</Button>
					</div>
				</EmptyState>
			</section>
		{:else}
			<div class="space-y-8">
				<HorizonTimeline
					trips={horizonTrips}
					counts={horizonCounts}
					today={horizonToday}
					onedit={openEdit}
				/>

				{#if filtered}
					{#if filterTab === 'all' || filterTab === 'planning'}
						{#if filtered.planning.length}
							{@render section('planning_section', filtered.planning, false, 0)}
						{/if}
					{/if}

					{#if filterTab === 'all' || filterTab === 'confirmed'}
						{#if filtered.active.length}
							{@render section(
								'active_now',
								filtered.active,
								true,
								filtered.planning.length ? 80 : 0
							)}
						{/if}
						{#if filtered.upcoming.length}
							{@render section(
								'upcoming',
								filtered.upcoming,
								false,
								(filtered.planning.length ? 80 : 0) + (filtered.active.length ? 80 : 0)
							)}
						{/if}
						{#if filtered.past.length}
							{@render section(
								'past',
								filtered.past,
								false,
								(filtered.planning.length ? 80 : 0) +
									(filtered.active.length ? 80 : 0) +
									(filtered.upcoming.length ? 80 : 0)
							)}
						{/if}
					{/if}

					{#if filterTab === 'all'}
						{#if filtered.archived.length}
							<section aria-labelledby="section-archived">
								<button
									type="button"
									onclick={() => (archiveOpen = !archiveOpen)}
									aria-expanded={archiveOpen}
									class="mb-3 flex items-center gap-2 text-sm font-semibold text-ink-muted transition-colors hover:text-ink"
								>
									<ChevronDown
										class="size-4 transition-transform {archiveOpen ? '' : '-rotate-90'}"
									/>
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
												onstagechange={(s) => changeStage(trip, s)}
											/>
										{/each}
									</div>
								{/if}
							</section>
						{/if}
					{/if}
				{/if}

				{#if search.trim() && visibleNonArchived === 0 && filtered?.archived.length === 0}
					<p class="py-12 text-center text-ink-muted">
						{t('no_trips_found', { search: search.trim() })}
					</p>
				{/if}
			</div>
		{/if}
	</ErrorBoundary>
</main>

{#snippet section(
	label: TranslationKey,
	list: trips.TripWithDerived[],
	highlight = false,
	sectionDelay = 0
)}
	<section
		aria-labelledby={`section-${label}`}
		class="animate-slide-up"
		style="animation-delay: {sectionDelay}ms"
	>
		<div class="mb-3 flex items-center gap-2">
			{#if highlight}
				<span class="size-2 animate-pulse rounded-full bg-success" aria-hidden="true"></span>
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
					onstagechange={(s) => changeStage(trip, s)}
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
	class="fixed bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] right-5 z-40 grid size-14 place-items-center rounded-full bg-primary-600 text-white shadow-sheet transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg sm:hidden [&_svg]:size-6"
>
	<Plus />
</button>

<NewTripSheet
	bind:open={createOpen}
	sources={allTrips}
	{defaultCurrency}
	onsaved={onCreated}
	onduplicate={openDuplicate}
/>

<TripFormSheet
	bind:open={editOpen}
	mode="edit"
	trip={editTrip}
	{defaultCurrency}
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

<TripTemplateModal
	bind:open={templateOpen}
	onCreated={(tripId) => goto(resolve(`/trip/${bareTripUid(tripId)}/overview`))}
/>
