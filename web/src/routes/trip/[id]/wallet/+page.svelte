<script lang="ts">
	import { onMount } from 'svelte';
	import { resolve } from '$app/paths';
	import type { ResolvedPathname } from '$app/types';
	import { page } from '$app/state';
	import { attachments, flights, reservations } from '$lib/db';
	import type { Attachment, Flight, Reservation } from '$lib/db';
	import { ChevronDown, Printer, Ticket } from 'lucide-svelte';
	import { Button, EmptyState, ErrorState, Skeleton } from '$lib/components/ui';
	import { WalletCard } from '$lib/components/wallet';
	import { printHref } from '$lib/export-center';
	import { getLanguage, t } from '$lib/i18n.svelte';
	import { startLive } from '$lib/live';
	import { localNowIso } from '$lib/today';
	import { buildWallet, flightItem, isStay, stayItem, type WalletItem } from '$lib/wallet';

	const id = $derived(page.params.id ?? '');

	let loaded = $state(false);
	let loadError = $state(false);
	let everLoaded = false;
	let flightList = $state<Flight[]>([]);
	let stayList = $state<Reservation[]>([]);
	let attachmentList = $state<Attachment[]>([]);

	/**
	 * The page's one clock, in local wall-clock form – the same shape the
	 * bookings store their times in. The interval keeps the "next" card and the
	 * Past disclosure honest while the page sits open on a table.
	 */
	let now = $state(localNowIso());

	async function loadAll(tripId: string) {
		if (!tripId) return;
		now = localNowIso();
		try {
			const [flightDocs, reservationDocs, files] = await Promise.all([
				flights.byTrip(tripId),
				reservations.byTrip(tripId),
				attachments.byTrip(tripId)
			]);
			flightList = flightDocs;
			stayList = reservationDocs.filter(isStay);
			attachmentList = files;
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
		const tripId = id;
		loadAll(tripId);
	});

	onMount(() => {
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

	const wallet = $derived(
		buildWallet([...flightList.map(flightItem), ...stayList.map(stayItem)], now)
	);

	/** Attachments live on their own documents; the card only needs its own. */
	function filesFor(item: WalletItem): Attachment[] {
		return attachmentList.filter((file) => file.ownerId === item.id);
	}

	/**
	 * One small way back to the record's editor. It points at the Bookings route
	 * with the deep-link query its panes already understand, so editing a ticket
	 * never happens on the wallet page itself.
	 */
	function editHref(item: WalletItem): ResolvedPathname {
		if (item.kind === 'flight') {
			return resolve(`/trip/${id}/bookings?tab=flights&flight=${encodeURIComponent(item.id)}`);
		}
		return resolve(
			`/trip/${id}/bookings?tab=reservations&reservation=${encodeURIComponent(item.id)}`
		);
	}

	const bookingsHref = $derived(resolve('/trip/[id]/bookings', { id }));
	const printTarget = $derived(
		printHref(resolve('/trip/[id]/print', { id }), {
			doc: 'bookings',
			paper: 'a4',
			lang: getLanguage()
		})
	);
</script>

<svelte:head>
	<title>{t('wallet_title')} – Itinera</title>
</svelte:head>

<div class="pl-safe pr-safe mx-auto w-full max-w-2xl">
	{#if !loaded}
		<div class="space-y-4">
			<Skeleton class="h-10 w-40" />
			<Skeleton class="h-56 w-full rounded-xl" />
			<Skeleton class="h-40 w-full rounded-xl" />
		</div>
	{:else if loadError}
		<ErrorState
			title={t('could_not_load_trip')}
			description={t('could_not_load_trip_retry')}
			onretry={retry}
		/>
	{:else}
		<header class="mb-5 flex items-start justify-between gap-3">
			<div class="min-w-0">
				<h2 class="font-serif text-2xl font-semibold text-ink">{t('wallet_title')}</h2>
				<p class="mt-1 text-sm text-ink-muted">{t('wallet_subtitle')}</p>
			</div>
			<Button variant="ghost" size="sm" href={printTarget} class="shrink-0">
				<Printer class="size-4" aria-hidden="true" />
				{t('wallet_print')}
			</Button>
		</header>

		{#if wallet.next || wallet.upcoming.length > 0 || wallet.past.length > 0}
			{#if wallet.next}
				<section aria-labelledby="wallet-next-heading" class="mb-6">
					<h3 id="wallet-next-heading" class="sr-only">{t('wallet_next')}</h3>
					<WalletCard
						item={wallet.next}
						files={filesFor(wallet.next)}
						next
						editHref={editHref(wallet.next)}
					/>
				</section>
			{/if}

			{#if wallet.upcoming.length > 0}
				<section aria-labelledby="wallet-upcoming-heading">
					<h3
						id="wallet-upcoming-heading"
						class="mb-3 text-sm font-semibold uppercase tracking-wide text-ink-muted"
					>
						{t('upcoming')}
					</h3>
					<ul class="space-y-4">
						{#each wallet.upcoming as item (item.id)}
							<li>
								<WalletCard {item} files={filesFor(item)} editHref={editHref(item)} />
							</li>
						{/each}
					</ul>
				</section>
			{/if}

			{#if wallet.past.length > 0}
				<details class="group mt-6 rounded-xl border border-border bg-surface-sunken/40">
					<summary
						class="flex min-h-touch cursor-pointer list-none items-center justify-between gap-3 rounded-xl px-4 py-3 text-base font-semibold text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg [&::-webkit-details-marker]:hidden"
					>
						<span class="flex items-center gap-2">
							{t('past')}
							<span
								class="rounded-full bg-surface-sunken px-2 py-0.5 text-xs font-semibold tabular-nums text-ink-muted"
							>
								{wallet.past.length}
							</span>
						</span>
						<ChevronDown
							class="size-5 shrink-0 text-ink-muted transition-transform group-open:rotate-180"
							aria-hidden="true"
						/>
					</summary>
					<ul class="space-y-4 p-3 pt-0">
						{#each wallet.past as item (item.id)}
							<li>
								<WalletCard {item} files={filesFor(item)} editHref={editHref(item)} />
							</li>
						{/each}
					</ul>
				</details>
			{/if}
		{:else}
			<EmptyState
				icon={Ticket}
				title={t('wallet_empty_title')}
				description={t('wallet_empty_desc')}
			>
				<Button href={bookingsHref}>{t('wallet_empty_action')}</Button>
			</EmptyState>
		{/if}
	{/if}
</div>
