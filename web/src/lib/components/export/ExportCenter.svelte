<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import { BookOpen, CalendarDays, Info, ListChecks, Plane, Wallet } from 'lucide-svelte';
	import {
		checklist,
		expenses,
		flights,
		itinerary,
		reservations,
		tripDayCount,
		trips
	} from '$lib/db';
	import { t } from '$lib/i18n.svelte';
	import type { IconComponent } from '$lib/types';
	import { ErrorState, Skeleton } from '$lib/components/ui';
	import { EXPORT_DOCS, type ExportCounts, type ExportDocId } from '$lib/export-center';
	import { startLive } from '$lib/live';
	import DocumentCard from './DocumentCard.svelte';

	interface Props {
		/** Bare trip ULID. */
		tripId: string;
	}

	let { tripId }: Props = $props();

	const ICONS: Record<ExportDocId, IconComponent> = {
		all: BookOpen,
		itinerary: CalendarDays,
		costs: Wallet,
		checklist: ListChecks,
		bookings: Plane
	};

	let counts = $state<ExportCounts | null>(null);
	let loaded = $state(false);
	let loadError = $state(false);
	let everLoaded = false;

	/*
	 * Six small local reads rather than the timeline merge: the cards are a
	 * manifest, so they count documents, they do not rebuild them. The print
	 * route already does the merging.
	 */
	async function loadAll(id: string) {
		if (!id) return;
		try {
			const [trip, items, expenseList, checklistItems, flightList, reservationList] =
				await Promise.all([
					trips.get(id),
					itinerary.byTrip(id),
					expenses.byTrip(id),
					checklist.byTrip(id),
					flights.byTrip(id),
					reservations.byTrip(id)
				]);
			counts = {
				days: trip?.startDate && trip?.endDate ? tripDayCount(trip.startDate, trip.endDate) : 0,
				items: items.length,
				expenses: expenseList.length,
				checklist: checklistItems.length,
				flights: flightList.length,
				reservations: reservationList.length
			};
			everLoaded = true;
			loadError = false;
		} catch {
			if (!everLoaded) loadError = true;
		} finally {
			loaded = true;
		}
	}

	$effect(() => {
		const id = tripId;
		loadAll(id);
	});

	onMount(() => startLive(() => loadAll(tripId)));

	const printPath = $derived(resolve('/trip/[id]/print', { id: tripId }));

	function retry() {
		loadError = false;
		loaded = false;
		loadAll(tripId);
	}
</script>

{#if !loaded}
	<div class="space-y-4" aria-busy="true">
		<Skeleton class="h-6 w-2/3" />
		<div class="grid gap-4 md:grid-cols-2">
			<Skeleton class="h-64 w-full rounded-lg md:col-span-2" />
			<Skeleton class="h-64 w-full rounded-lg" />
			<Skeleton class="h-64 w-full rounded-lg" />
			<Skeleton class="h-64 w-full rounded-lg" />
		</div>
	</div>
{:else if loadError}
	<ErrorState title={t('export_center_load_error')} onretry={retry} />
{:else if counts}
	<div class="space-y-5">
		<p class="max-w-prose text-sm text-ink-muted">{t('export_center_lead')}</p>

		<div class="grid gap-4 md:grid-cols-2">
			{#each EXPORT_DOCS as doc (doc.id)}
				<div class={doc.id === 'all' ? 'md:col-span-2' : ''}>
					<DocumentCard
						{tripId}
						{printPath}
						{doc}
						{counts}
						icon={ICONS[doc.id]}
						serverPdf={doc.id === 'all'}
					/>
				</div>
			{/each}
		</div>

		<!-- The one place the offline/server split is explained, quietly. -->
		<p
			class="no-print flex items-start gap-2 rounded-lg border border-border bg-surface-sunken p-3 text-xs text-ink-muted"
		>
			<Info class="mt-0.5 size-4 shrink-0" aria-hidden="true" />
			<span>{t('export_center_offline_note')}</span>
		</p>
	</div>
{/if}
