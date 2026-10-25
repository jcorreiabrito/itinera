<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { listConflicts, trips } from '$lib/db';
	import { t } from '$lib/i18n.svelte';
	import { ArrowLeft, GitMerge, Check } from 'lucide-svelte';
	import { EmptyState, Skeleton, SyncStatusPill, toast } from '$lib/components/ui';
	import { ConflictCard } from '$lib/components/conflicts';
	import { startLive } from '$lib/live';

	type Report = Awaited<ReturnType<typeof listConflicts>>[number];

	let loaded = $state(false);
	let reports = $state<Report[]>([]);
	let tripTitles = $state<Map<string, string>>(new Map());

	async function load() {
		try {
			const [list, allTrips] = await Promise.all([listConflicts(), trips.list()]);
			reports = list;
			tripTitles = new Map(
				allTrips.map((trip) => [trip._id, trip.title?.trim() || t('untitled_trip')])
			);
		} catch {
			toast.error(t('could_not_load_changes'));
		} finally {
			loaded = true;
		}
	}

	onMount(() => {
		load();
		return startLive(load);
	});

	/** Which trip a record belongs to — the title is the reader's only handle. */
	function contextFor(report: Report): string {
		if (report.winner.type === 'trip') return '';
		const tripid = (report.winner as Record<string, unknown>).tripid as string | undefined;
		return tripid ? (tripTitles.get(tripid) ?? '') : '';
	}
</script>

<svelte:head>
	<title>{t('review_changes_title')}</title>
</svelte:head>

<header class="sticky top-0 z-30 border-b border-border bg-bg/85 backdrop-blur-md">
	<div class="mx-auto flex h-16 max-w-3xl items-center justify-between gap-3 px-4 sm:px-6">
		<div class="flex items-center gap-2">
			<a
				href={resolve('/settings')}
				aria-label={t('settings')}
				class="grid size-11 min-h-[44px] min-w-[44px] place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink active:scale-95 sm:size-9 sm:min-h-0 sm:min-w-0 [&_svg]:size-5"
			>
				<ArrowLeft />
			</a>
			<h1 class="font-serif text-xl font-semibold">{t('review_changes')}</h1>
		</div>
		<SyncStatusPill />
	</div>
</header>

<main id="page-content" class="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-6 sm:px-6 lg:pb-12">
	<p
		class="flex items-start gap-2 rounded-lg border border-border bg-surface px-4 py-3 text-sm text-ink-muted [&_svg]:mt-0.5 [&_svg]:size-4 [&_svg]:shrink-0 [&_svg]:text-primary-700"
	>
		<Check />
		<span>
			{t('conflicts_help_text')}
		</span>
	</p>

	{#if !loaded}
		<div class="space-y-4">
			<Skeleton class="h-28 w-full rounded-lg" />
			<Skeleton class="h-28 w-full rounded-lg" />
		</div>
	{:else if reports.length === 0}
		<EmptyState
			icon={GitMerge}
			title={t('no_conflicts_title')}
			description={t('no_conflicts_desc')}
		/>
	{:else}
		<ul class="space-y-4">
			{#each reports as report (report.id)}
				<li>
					<ConflictCard {report} context={contextFor(report)} onresolved={load} />
				</li>
			{/each}
		</ul>
	{/if}
</main>
