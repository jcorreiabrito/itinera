<script lang="ts">
	import { onMount } from 'svelte';
	import type { ResolvedPathname } from '$app/types';
	import { flights, reservations } from '$lib/db';
	import type { Attachment } from '$lib/db';
	import { AttachmentViewer } from '$lib/components/attachments';
	import { airlineLabel, endpointCode, endpointName } from '$lib/components/flights/labels';
	import { Badge, Button, toast } from '$lib/components/ui';
	import { formatNights, formatTime, formatWeekdayDate } from '$lib/format';
	import { t } from '$lib/i18n.svelte';
	import { cn } from '$lib/utils';
	import { copyToClipboard } from '$lib/utils/clipboard';
	import type { WalletItem } from '$lib/wallet';
	import {
		ArrowRight,
		BedDouble,
		ChevronRight,
		Copy,
		MapPin,
		Paperclip,
		Pencil,
		Phone,
		Plane
	} from 'lucide-svelte';

	interface Props {
		item: WalletItem;
		/** Attachments owned by this booking (already filtered by owner). */
		files?: Attachment[];
		/** The soonest upcoming card gets the "Next" marker. */
		next?: boolean;
		/** Small link to the booking's editor; the wallet itself has no edit controls. */
		editHref: ResolvedPathname;
	}

	let { item, files = [], next = false, editHref }: Props = $props();

	const computed = $derived(item.kind === 'flight' ? flights.computeFlight(item.flight) : null);
	const stay = $derived(item.kind === 'stay' ? item.reservation : null);
	const headingId = $derived(`wallet-${item.id.replace(/[^a-zA-Z0-9_-]/g, '-')}`);

	const title = $derived.by(() => {
		if (item.kind === 'stay') return item.reservation.name?.trim() || t('cat_lodging');
		const segments = item.flight.segments ?? [];
		// One airline per leg is normal; a return booked as one document may name two.
		const airlines: string[] = [];
		for (const segment of segments) {
			const name = segment.airline?.trim();
			if (name && !airlines.includes(name)) airlines.push(name);
		}
		if (airlines.length > 0) return airlines.join(' · ');
		const number = segments[0]?.flightNumber;
		return number ? t('flight_n', { n: number }) : t('flight');
	});

	const reference = $derived(
		item.kind === 'flight' ? item.flight.bookingRef?.trim() : item.reservation.confirmation?.trim()
	);
	const referenceLabel = $derived(
		item.kind === 'flight' ? t('wallet_flight_ref') : t('wallet_stay_ref')
	);
	const nights = $derived(stay ? reservations.lodgingNights(stay) : 0);
	const phone = $derived(stay?.contact?.phone?.trim() ?? '');

	const addressLines = $derived.by(() => {
		if (!stay) return [];
		const details = (stay.details ?? {}) as Record<string, unknown>;
		const line2 = typeof details.address2 === 'string' ? details.address2 : '';
		return [stay.location?.address, line2]
			.map((line) => line?.trim())
			.filter((line): line is string => Boolean(line));
	});

	let copied = $state(false);
	let copyTimer: ReturnType<typeof setTimeout> | null = null;
	let viewerOpen = $state(false);
	let selected = $state<Attachment | null>(null);

	async function copyReference(ref: string | undefined) {
		if (!ref) return;
		const ok = await copyToClipboard(ref);
		if (!ok) {
			// The clipboard is blocked (plain-HTTP LAN): show the value so it can be selected.
			toast.info(ref);
			return;
		}
		copied = true;
		toast.success(t('copied_to_clipboard'));
		if (copyTimer) clearTimeout(copyTimer);
		copyTimer = setTimeout(() => {
			copied = false;
			copyTimer = null;
		}, 2000);
	}

	function openFile(file: Attachment) {
		selected = file;
		viewerOpen = true;
	}

	onMount(() => () => {
		if (copyTimer) clearTimeout(copyTimer);
	});
</script>

{#snippet detail(label: string, value: string | undefined)}
	{#if value}
		<div class="min-w-[4.5rem] flex-1 rounded-md bg-surface-sunken px-2 py-1.5 text-center">
			<p class="text-[0.65rem] font-semibold uppercase tracking-wide text-ink-muted">{label}</p>
			<p class="text-lg font-bold tabular-nums text-ink">{value}</p>
		</div>
	{/if}
{/snippet}

<article
	aria-labelledby={headingId}
	class={cn(
		'w-full overflow-hidden rounded-xl border bg-surface shadow-card',
		next ? 'border-primary-600/60' : 'border-border'
	)}
>
	<div class="p-4 sm:p-5">
		<header class="flex flex-wrap items-center gap-2">
			<span
				class="inline-flex items-center gap-1.5 text-sm font-semibold uppercase tracking-wide text-ink-muted [&_svg]:size-4"
			>
				{#if item.kind === 'flight'}
					<Plane aria-hidden="true" />
				{:else}
					<BedDouble aria-hidden="true" />
				{/if}
				{item.kind === 'flight' ? t('flight') : t('cat_lodging')}
			</span>
			{#if next}
				<Badge variant="primary">{t('wallet_next')}</Badge>
			{/if}
		</header>

		<h3
			id={headingId}
			class="mt-1 break-words font-serif text-2xl font-semibold leading-tight text-ink"
		>
			{title}
		</h3>

		<!-- The one thing every desk clerk asks for. -->
		<div class="mt-4 rounded-lg border border-border bg-surface-sunken p-3">
			<p class="text-xs font-semibold uppercase tracking-wide text-ink-muted">{referenceLabel}</p>
			{#if reference}
				<div class="mt-1 flex flex-wrap items-center gap-2">
					<p
						class="min-w-0 select-all break-all font-mono text-2xl font-bold tracking-wide text-ink"
					>
						{reference}
					</p>
					<Button
						variant="secondary"
						size="sm"
						class="shrink-0"
						onclick={() => copyReference(reference)}
						aria-label={t('wallet_copy_ref', { ref: reference })}
					>
						<Copy class="size-4" aria-hidden="true" />
						{copied ? t('wallet_copied') : t('wallet_copy')}
					</Button>
				</div>
			{:else}
				<p class="mt-1 text-base text-ink-muted">{t('wallet_no_reference')}</p>
			{/if}
		</div>

		{#if item.kind === 'flight'}
			{#if computed && computed.segments.length > 0}
				<ul class="mt-4 space-y-3">
					{#each computed.segments as segment, index (index)}
						<li class="rounded-lg border border-border p-3">
							<div class="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
								<p class="text-base font-semibold text-ink">
									{airlineLabel(segment) || t('flight')}
								</p>
								<p class="text-sm text-ink-muted">{formatWeekdayDate(segment.departLocal)}</p>
							</div>

							<div class="mt-2 flex items-center gap-2">
								<div class="min-w-0 flex-1">
									<p class="text-2xl font-bold tabular-nums leading-none text-ink">
										{endpointCode(segment.from)}
									</p>
									<p class="mt-1 truncate text-xs text-ink-muted">{endpointName(segment.from)}</p>
									<p class="mt-1 text-base font-semibold tabular-nums text-ink">
										{formatTime(segment.departLocal)}
									</p>
								</div>
								<ArrowRight class="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
								<div class="min-w-0 flex-1 text-right">
									<p class="text-2xl font-bold tabular-nums leading-none text-ink">
										{endpointCode(segment.to)}
									</p>
									<p class="mt-1 truncate text-xs text-ink-muted">{endpointName(segment.to)}</p>
									<p
										class="mt-1 flex items-center justify-end gap-1 text-base font-semibold tabular-nums text-ink"
									>
										{formatTime(segment.arriveLocal)}
										{#if segment.arrivalDayOffset > 0}
											<span
												class="rounded-full bg-accent-terracotta/15 px-1.5 py-0.5 text-xs font-bold text-accent-terracotta"
											>
												+{segment.arrivalDayOffset}
											</span>
										{/if}
									</p>
								</div>
							</div>

							{#if segment.terminal || segment.gate || segment.seat}
								<div class="mt-3 flex flex-wrap gap-2">
									{@render detail(t('terminal'), segment.terminal)}
									{@render detail(t('gate'), segment.gate)}
									{@render detail(t('seat'), segment.seat)}
								</div>
							{/if}
						</li>
					{/each}
				</ul>
			{:else}
				<p class="mt-4 text-base text-ink-muted">{t('wallet_no_times')}</p>
			{/if}
		{:else if stay}
			<dl class="mt-4 grid grid-cols-2 gap-3">
				<div class="rounded-lg border border-border p-3">
					<dt class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
						{t('check_in')}
					</dt>
					{#if formatTime(stay.start)}
						<dd class="mt-1 text-2xl font-bold tabular-nums text-ink">
							{formatTime(stay.start)}
						</dd>
					{/if}
					<dd class="mt-0.5 text-sm text-ink-muted">
						{formatWeekdayDate(stay.start) || t('wallet_not_set')}
					</dd>
				</div>
				<div class="rounded-lg border border-border p-3">
					<dt class="text-xs font-semibold uppercase tracking-wide text-ink-muted">
						{t('check_out')}
					</dt>
					{#if formatTime(stay.end)}
						<dd class="mt-1 text-2xl font-bold tabular-nums text-ink">{formatTime(stay.end)}</dd>
					{/if}
					<dd class="mt-0.5 text-sm text-ink-muted">
						{formatWeekdayDate(stay.end) || t('wallet_not_set')}
					</dd>
				</div>
			</dl>

			{#if nights > 0}
				<p class="mt-2 text-sm text-ink-muted">{formatNights(nights)}</p>
			{/if}

			{#if addressLines.length > 0}
				<address class="mt-4 flex gap-2 not-italic">
					<MapPin class="mt-0.5 size-5 shrink-0 text-ink-muted" aria-hidden="true" />
					<span class="min-w-0 text-base leading-relaxed text-ink">
						{#each addressLines as line, index (index)}
							<span class="block break-words">{line}</span>
						{/each}
					</span>
				</address>
			{/if}

			{#if phone}
				<a
					href={`tel:${phone}`}
					class="mt-3 inline-flex min-h-touch items-center gap-2 rounded-md bg-primary-100 px-3 text-base font-semibold text-primary-700 transition-colors hover:bg-primary-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
				>
					<Phone class="size-4" aria-hidden="true" />
					<span class="sr-only">{t('phone')}:</span>
					{phone}
				</a>
			{/if}
		{/if}

		{#if files.length > 0}
			<ul class="mt-4 space-y-2 border-t border-border pt-3">
				{#each files as file (file._id)}
					{@const name = file.filename?.trim() || t('attachments')}
					<li>
						<button
							type="button"
							onclick={() => openFile(file)}
							aria-label={t('wallet_open_file', { name })}
							class="flex min-h-touch w-full items-center gap-3 rounded-lg border border-border bg-surface-sunken px-3 py-2.5 text-left transition-colors hover:bg-border/30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.99]"
						>
							<span
								class="grid size-9 shrink-0 place-items-center rounded-md bg-surface text-primary-700 [&_svg]:size-4"
							>
								<Paperclip aria-hidden="true" />
							</span>
							<span class="min-w-0 flex-1 break-words text-base font-medium text-ink">{name}</span>
							<ChevronRight class="size-5 shrink-0 text-ink-muted" aria-hidden="true" />
						</button>
					</li>
				{/each}
			</ul>
		{/if}

		<footer class="mt-3 flex justify-end">
			<a
				href={editHref}
				class="inline-flex min-h-touch items-center gap-1.5 rounded-md px-2 text-sm font-medium text-ink-muted underline-offset-4 transition-colors hover:text-ink hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
			>
				<Pencil class="size-4" aria-hidden="true" />
				{t('wallet_edit_booking')}
			</a>
		</footer>
	</div>
</article>

<AttachmentViewer
	bind:open={viewerOpen}
	attachment={selected}
	onclose={() => (viewerOpen = false)}
/>
