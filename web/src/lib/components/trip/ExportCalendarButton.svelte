<script lang="ts">
	import type { Flight, ItineraryItem, Reservation, Trip } from '$lib/db';
	import { downloadTripICS } from '$lib/utils/ics';
	import { MenuItem, Popover, toast } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import { getApiUrl } from '$lib/api';
	import { Calendar, Download, Link2 } from 'lucide-svelte';

	/**
	 * Two ways out, and the difference is the user's to make:
	 *
	 *  - the file works offline and imports into any calendar app, but it is a
	 *    snapshot — re-importing an updated file updates the same events
	 *    because the UIDs are stable;
	 *  - the feed URL stays live but needs the home server reachable.
	 *
	 * `items` used to be only the selected day's activities, so "download the
	 * calendar" quietly gave you one day of the trip. Flights and reservations
	 * were dropped entirely.
	 */
	let {
		trip,
		items = [],
		flights = [],
		reservations = []
	}: {
		trip: Trip;
		items?: ItineraryItem[];
		flights?: Flight[];
		reservations?: Reservation[];
	} = $props();

	let open = $state(false);

	const hasAnything = $derived(items.length + flights.length + reservations.length > 0);

	function handleExportFile() {
		open = false;
		try {
			downloadTripICS(trip, { items, flights, reservations });
			toast.success(t('calendar_downloaded'));
		} catch (err) {
			console.error('Failed to export calendar', err);
			toast.error(t('could_not_download_calendar'));
		}
	}

	async function handleCopyFeed() {
		open = false;
		const feedUrl = `${window.location.origin}${getApiUrl(
			`/trips/${encodeURIComponent(trip._id)}/calendar.ics`
		)}`;
		try {
			await navigator.clipboard.writeText(feedUrl);
			toast.success(t('calendar_link_copied'));
		} catch {
			toast.error(t('could_not_copy_link'));
		}
	}
</script>

<Popover bind:open align="end" label={t('export_calendar')} panelClass="w-72">
	{#snippet trigger({ toggle, open: isOpen })}
		<button
			type="button"
			onclick={toggle}
			aria-haspopup="true"
			aria-expanded={isOpen}
			class="inline-flex min-h-touch items-center gap-1.5 rounded-md border border-border bg-surface px-3 text-xs font-medium text-ink shadow-soft transition-colors hover:bg-surface-sunken [&_svg]:size-4"
		>
			<Calendar class="text-primary-600" />
			<span>{t('calendar')}</span>
		</button>
	{/snippet}

	<div class="flex flex-col gap-0.5">
		<MenuItem icon={Download} onclick={handleExportFile}>
			<span class="flex flex-col">
				<span>{t('download_ics')}</span>
				<span class="text-[10px] font-normal text-ink-muted">{t('download_ics_hint')}</span>
			</span>
		</MenuItem>

		<MenuItem icon={Link2} onclick={handleCopyFeed}>
			<span class="flex flex-col">
				<span>{t('subscribe_calendar')}</span>
				<span class="text-[10px] font-normal text-ink-muted">{t('subscribe_calendar_hint')}</span>
			</span>
		</MenuItem>

		{#if !hasAnything}
			<!--
				The file would contain only the trip's own dates. Saying so beats
				handing over a near-empty calendar the user assumes is broken.
			-->
			<p class="mt-1 border-t border-border px-2.5 pt-2 text-[10px] text-ink-muted">
				{t('calendar_empty_hint')}
			</p>
		{/if}
	</div>
</Popover>
