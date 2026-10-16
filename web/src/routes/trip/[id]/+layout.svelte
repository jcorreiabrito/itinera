<script lang="ts">
	import type { Snippet } from 'svelte';
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { writable } from 'svelte/store';
	import { page } from '$app/state';
	import { trips } from '$lib/db';
	import type { Trip } from '$lib/db';
	import { t, type TranslationKey } from '$lib/i18n.svelte';
	import { AlertTriangle, ArrowLeft, MapPinned, Pencil, RotateCw, Share2 } from 'lucide-svelte';
	import type { IconComponent } from '$lib/types';
	import { TRIP_MOBILE_TABS, TRIP_SECTIONS } from '$lib/trip-sections';
	import { formatDateRange } from '$lib/format';
	import { TripDataMenu, TripFormSheet } from '$lib/components/trip';
	import { setTripShellContext } from '$lib/trip-context';
	import { startLive } from '$lib/live';
	import { cn } from '$lib/utils';
	import { Button, ErrorBoundary, Skeleton, SyncStatusPill, ThemeToggle } from '$lib/components/ui';
	import ShareTripModal from '$lib/components/trip/ShareTripModal.svelte';

	let { children }: { children: Snippet } = $props();

	let trip = $state<Trip | null>(null);
	let loaded = $state(false);
	/*
	 * Separate from `trip === null`. Both used to collapse into "Trip not found",
	 * so a transient IndexedDB failure told the user their trip had been deleted
	 * on another device — a claim the app cannot make and one that invites them
	 * to stop looking for data that is still there.
	 */
	let loadError = $state(false);
	let editOpen = $state(false);
	let shareOpen = $state(false);
	const reloadSignal = writable(0);

	const id = $derived(page.params.id ?? '');
	const pathname = $derived(page.url.pathname);
	const tab = $derived(page.url.searchParams.get('tab'));
	/**
	 * The section whose page is on screen, so the shell can size the column to
	 * what it holds. `isActive` is the same predicate the navigation uses, so
	 * `/bookings?tab=reservations` resolves to `reservations` — whose width
	 * happens to match `flights`, its sibling tab.
	 */
	const section = $derived(TRIP_SECTIONS.find((entry) => entry.isActive(pathname, id, tab)));

	async function loadTrip(tripid: string) {
		loadError = false;
		try {
			trip = await trips.get(tripid);
		} catch {
			trip = null;
			loadError = true;
		} finally {
			loaded = true;
		}
	}

	function requestReload() {
		reloadSignal.update((n) => n + 1);
		loadTrip(page.params.id ?? '');
	}

	function openEditor() {
		editOpen = true;
	}

	setTripShellContext({ reloadSignal, requestReload, openEditor });

	// Reload the header trip whenever the route id changes.
	$effect(() => {
		const tid = id;
		loaded = false;
		loadTrip(tid);
	});

	onMount(() => startLive(() => loadTrip(page.params.id ?? '')));

	const sections = $derived(TRIP_SECTIONS);
	const mobileTabs = $derived(TRIP_MOBILE_TABS);
</script>

{#snippet sideLink(
	href: ResolvedPathname,
	labelKey: TranslationKey,
	icon: IconComponent,
	active: boolean
)}
	{@const Icon = icon}
	<a
		{href}
		aria-current={active ? 'page' : undefined}
		class={cn(
			'relative flex min-h-touch items-center gap-1 rounded-md px-3 py-2 text-sm font-medium transition-[background-color,color,padding-left] duration-150 [&_svg]:size-5',
			active
				? 'bg-primary-100 pl-4 text-primary-700 before:absolute before:left-0 before:top-1/2 before:h-5 before:w-0.5 before:-translate-y-1/2 before:rounded-full before:bg-primary-600 before:content-[""]'
				: 'text-ink-muted hover:bg-surface-sunken hover:text-ink'
		)}
	>
		<Icon />
		<span>{t(labelKey)}</span>
	</a>
{/snippet}

<div class="flex min-h-dvh flex-col">
	<!-- Desktop sidebar -->
	<aside
		class="fixed inset-y-0 left-0 z-40 hidden w-60 flex-col border-r border-border bg-surface lg:flex"
	>
		<a
			href={resolve('/')}
			class="flex h-16 items-center gap-2 border-b border-border px-4 text-sm font-medium text-ink-muted transition-colors hover:text-ink [&_svg]:size-4"
		>
			<ArrowLeft />
			<span>{t('all_trips')}</span>
		</a>
		<nav aria-label={t('trip_sections')} class="flex-1 overflow-y-auto p-3">
			<ul class="flex flex-col gap-1">
				{#each sections as section (section.id)}
					<li class={section.separated ? 'mt-2' : undefined}>
						{#if section.group}
							<p class="px-3 pb-1 text-xs font-semibold uppercase tracking-wide text-ink-muted/70">
								{t(section.group)}
							</p>
						{/if}
						{@render sideLink(
							section.path(id),
							section.labelKey,
							section.icon,
							section.isActive(pathname, id, tab)
						)}
					</li>
				{/each}
			</ul>
		</nav>
		<div class="border-t border-border p-4 text-xs text-ink-muted">{t('offline_ready')}</div>
	</aside>

	<!-- Content column -->
	<div class="flex min-h-dvh flex-col lg:pl-60">
		<header
			class="no-print pt-safe sticky top-0 z-30 flex min-h-[4rem] items-center justify-between gap-3 border-b border-border bg-bg/85 px-4 py-2 backdrop-blur-md sm:px-6"
		>
			<div class="flex min-w-0 flex-1 items-center gap-2">
				<a
					href={resolve('/')}
					aria-label={t('back_to_trips')}
					class="grid size-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink active:scale-95 lg:hidden [&_svg]:size-5"
				>
					<ArrowLeft />
				</a>
				{#if loaded}
					<h1 class="animate-slide-down truncate font-serif text-base font-semibold sm:text-lg">
						{trip?.title?.trim() || t('untitled_trip')}
					</h1>
				{:else}
					<Skeleton class="h-5 w-32 sm:w-40" />
				{/if}
			</div>

			<div class="flex shrink-0 items-center gap-1 sm:gap-1.5">
				<SyncStatusPill />
				<div class="hidden sm:block">
					<ThemeToggle />
				</div>
				{#if trip}
					<button
						type="button"
						onclick={() => (shareOpen = true)}
						aria-label={t('share_trip')}
						title={t('share_trip')}
						class="hidden size-11 min-h-[44px] min-w-[44px] place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink active:scale-95 sm:grid [&_svg]:size-5"
					>
						<Share2 />
					</button>
				{/if}
				<button
					type="button"
					onclick={openEditor}
					disabled={!trip}
					aria-label={t('edit')}
					class="hidden size-11 min-h-[44px] min-w-[44px] place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink active:scale-95 disabled:opacity-40 sm:grid [&_svg]:size-5"
				>
					<Pencil />
				</button>
				{#if trip}
					<TripDataMenu
						tripid={id}
						title={trip.title?.trim() || undefined}
						onedit={openEditor}
						onshare={() => (shareOpen = true)}
					/>
				{/if}
			</div>
		</header>

		<!--
			The sheet's own title, for paper only.

			On screen the trip title lives in the shell header above, which is
			`.no-print` — so a browser print (Ctrl+P) from any trip screen produced
			pages with no indication of which trip they belonged to. This is the
			document title on paper, and the route's section heading follows it as
			an `<h2>` so the printed outline has exactly one `<h1>`.
		-->
		{#if loaded && trip}
			<header class="hidden px-4 pt-4 sm:px-6 print:block">
				<h1 class="font-serif text-2xl font-semibold leading-tight">
					{trip.title?.trim() || t('untitled_trip')}
				</h1>
				{#if formatDateRange(trip.startDate, trip.endDate)}
					<p class="mt-1 text-sm text-ink-muted">
						{formatDateRange(trip.startDate, trip.endDate)}
					</p>
				{/if}
			</header>
		{/if}

		<main
			id="page-content"
			class={cn(
				'mx-auto w-full flex-1 px-4 pb-[calc(7.5rem+env(safe-area-inset-bottom,0px))] pt-5 sm:px-6 lg:pb-12',
				// A plan takes the wide column at 2xl; a page of prose keeps the
				// reading measure. See `wide` in $lib/trip-sections.
				section?.wide ? 'max-w-5xl 2xl:max-w-7xl' : 'max-w-5xl'
			)}
		>
			{#if loaded && !trip}
				<div class="flex min-h-[50dvh] flex-col items-center justify-center text-center">
					{#if loadError}
						<AlertTriangle class="size-10 text-warning" aria-hidden="true" />
						<h2 class="mt-4 text-xl font-semibold">{t('could_not_load_trip')}</h2>
						<p class="mt-1 max-w-prose text-ink-muted">{t('could_not_load_trip_retry')}</p>
						<Button class="mt-5" onclick={() => loadTrip(id)}>
							<RotateCw class="size-4" />
							{t('retry')}
						</Button>
					{:else}
						<MapPinned class="size-10 text-ink-muted" aria-hidden="true" />
						<h2 class="mt-4 text-xl font-semibold">{t('trip_not_found')}</h2>
						<p class="mt-1 text-ink-muted">{t('trip_not_found_desc')}</p>
						<a
							href={resolve('/')}
							class="mt-5 inline-flex h-11 items-center rounded-md bg-primary-600 px-4 font-medium text-white shadow-soft transition-colors hover:bg-primary-700 active:scale-[0.97]"
						>
							{t('back_to_trips')}
						</a>
					{/if}
				</div>
			{:else}
				<ErrorBoundary>
					{@render children()}
				</ErrorBoundary>
			{/if}
		</main>

		<!-- Mobile bottom tab bar -->
		<nav
			aria-label={t('trip_sections')}
			class="no-print pb-safe fixed inset-x-0 bottom-0 z-50 border-t border-border bg-surface/95 backdrop-blur-md lg:hidden"
		>
			<ul class="mx-auto flex max-w-xl items-stretch justify-around">
				{#each mobileTabs as item (item.id)}
					{@const Icon = item.icon}
					{@const active = item.isActive(pathname, id)}
					<li class="flex-1">
						<a
							href={item.path(id)}
							aria-current={active ? 'page' : undefined}
							class={cn(
								'relative flex min-h-[3.5rem] flex-col items-center justify-center gap-1 px-1 py-2 text-[0.7rem] font-medium transition-colors [&_svg]:size-5 [&_svg]:transition-transform [&_svg]:duration-100 active:[&_svg]:scale-90',
								active ? 'text-primary-600' : 'text-ink-muted hover:text-ink'
							)}
						>
							<Icon />
							<span>{t(item.labelKey)}</span>
							{#if active}
								<span
									class="absolute bottom-1.5 size-1 animate-fade-in rounded-full bg-primary-600"
									aria-hidden="true"
								></span>
							{/if}
						</a>
					</li>
				{/each}
			</ul>
		</nav>
	</div>
</div>

<TripFormSheet
	bind:open={editOpen}
	mode="edit"
	{trip}
	onsaved={requestReload}
	onlivechange={requestReload}
/>

{#if trip}
	<ShareTripModal bind:open={shareOpen} {trip} />
{/if}
