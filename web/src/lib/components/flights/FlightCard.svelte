<script lang="ts">
	import { flights } from '$lib/db';
	import type { Flight } from '$lib/db';
	import {
		ArrowRight,
		Copy,
		ExternalLink,
		MoreVertical,
		Paperclip,
		Pencil,
		Plane,
		Trash2,
		TriangleAlert
	} from 'lucide-svelte';
	import { Badge, MenuItem, Popover, toast } from '$lib/components/ui';
	import { t } from '$lib/i18n.svelte';
	import { copyToClipboard } from '$lib/utils/clipboard';
	import { formatMoney, formatTime, formatWeekdayDate } from '$lib/format';
	import {
		airlineLabel,
		endpointCode,
		firstDepart,
		flightAriaSummary,
		legAriaLabel
	} from './labels';

	interface Props {
		flight: Flight;
		homeCurrency?: string;
		attachmentCount?: number;
		onedit: () => void;
		ondelete?: () => void;
	}

	let { flight, homeCurrency = 'EUR', attachmentCount = 0, onedit, ondelete }: Props = $props();

	let menuOpen = $state(false);

	const computed = $derived(flights.computeFlight(flight));
	const segs = $derived(computed.segments);
	const ariaSummary = $derived(flightAriaSummary(computed));
	const headDate = $derived(formatWeekdayDate(firstDepart(flight)));
	const bookingNotes = $derived((flight as Flight & { notes?: string }).notes ?? '');
	const totalDuration = $derived(
		segs
			.map((s) => s.durationText)
			.filter(Boolean)
			.join(' + ')
	);

	function act(fn?: () => void) {
		menuOpen = false;
		fn?.();
	}
</script>

<article
	aria-label={ariaSummary}
	class="rounded-lg border border-border bg-surface p-4 shadow-soft"
>
	<header class="flex items-start justify-between gap-3">
		<div class="min-w-0">
			<p class="flex flex-wrap items-center gap-x-2 gap-y-1 text-base font-semibold text-ink">
				<span class="inline-flex items-center gap-1.5">
					<Plane class="size-4 text-primary-700" aria-hidden="true" />
					{computed.route || t('flight')}
				</span>
				{#if computed.stops > 0}
					<Badge variant="neutral">
						{computed.stops > 1
							? t('stops_count_plural', { n: String(computed.stops) })
							: t('stops_count', { n: String(computed.stops) })}
					</Badge>
				{:else}
					<Badge variant="neutral">{t('direct')}</Badge>
				{/if}
			</p>
			<p class="mt-0.5 text-xs text-ink-muted">
				{#if headDate}{headDate}{/if}{#if totalDuration}{headDate ? ' · ' : ''}{totalDuration}{/if}
			</p>
		</div>

		<Popover bind:open={menuOpen} label={t('flight_actions')}>
			{#snippet trigger({ toggle, open })}
				<button
					type="button"
					onclick={toggle}
					aria-label={t('flight_actions')}
					aria-haspopup="true"
					aria-expanded={open}
					class="grid size-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink sm:size-9 sm:min-h-0 sm:min-w-0 [&_svg]:size-5 sm:[&_svg]:size-4"
				>
					<MoreVertical />
				</button>
			{/snippet}
			<MenuItem icon={Pencil} onclick={() => act(onedit)}>{t('edit')}</MenuItem>
			<MenuItem icon={Trash2} tone="danger" onclick={() => act(ondelete)}>{t('delete')}</MenuItem>
		</Popover>
	</header>

	<!-- Each leg is a labelled list item; layovers are separate text items. -->
	<ul class="mt-4 flex flex-col gap-2" aria-label={t('legs')}>
		{#each segs as seg, i (i)}
			<li
				aria-label={legAriaLabel(seg)}
				class="rounded-md border border-border bg-surface-sunken/40 p-2.5"
			>
				<div class="flex items-baseline justify-between gap-2">
					<span class="text-sm font-medium text-ink">{airlineLabel(seg) || t('flight')}</span>
					{#if seg.durationText}
						<span class="text-xs tabular-nums text-ink-muted">{seg.durationText}</span>
					{/if}
				</div>

				<div class="mt-1.5 grid grid-cols-[auto_1fr_auto] items-center gap-2 text-sm">
					<div class="flex items-baseline gap-1.5">
						<span class="font-semibold tabular-nums text-ink">{endpointCode(seg.from)}</span>
						<span class="text-xs tabular-nums text-ink-muted">{formatTime(seg.departLocal)}</span>
					</div>
					<div class="flex min-w-0 items-center gap-1 px-1">
						<span class="h-px flex-1 border-t border-dashed border-border" aria-hidden="true"
						></span>
						<ArrowRight class="size-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
						<span class="h-px flex-1 border-t border-dashed border-border" aria-hidden="true"
						></span>
					</div>
					<div class="flex items-baseline gap-1.5">
						<span class="font-semibold tabular-nums text-ink">{endpointCode(seg.to)}</span>
						<span class="text-xs tabular-nums text-ink-muted">{formatTime(seg.arriveLocal)}</span>
						{#if seg.arrivalDayOffset > 0}
							<span
								class="rounded-full bg-accent-terracotta/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-accent-terracotta"
								title={t(
									seg.arrivalDayOffset > 1 ? 'arrives_days_after_many' : 'arrives_days_after_one',
									{ n: String(seg.arrivalDayOffset) }
								)}
							>
								+{seg.arrivalDayOffset}
							</span>
						{/if}
					</div>
				</div>

				{#if seg.seat || seg.terminal || seg.gate || seg.baggage}
					<p class="mt-1.5 flex flex-wrap gap-3 gap-y-0.5 text-xs text-ink-muted">
						{#if seg.seat}<span>{t('seat')}: <b class="font-semibold text-ink">{seg.seat}</b></span
							>{/if}
						{#if seg.terminal}<span
								>{t('terminal')}: <b class="font-semibold text-ink">{seg.terminal}</b></span
							>{/if}
						{#if seg.gate}<span>{t('gate')}: <b class="font-semibold text-ink">{seg.gate}</b></span
							>{/if}
						{#if seg.baggage}<span
								>{t('baggage')}: <b class="font-semibold text-ink">{seg.baggage}</b></span
							>{/if}
					</p>
				{/if}

				{#if i < segs.length - 1}
					{@const lay = computed.layovers[i]}
					{@const tight = lay ? lay.minutes != null && lay.minutes < 60 : false}
					<div
						aria-label={t('layover_aria', {
							code: endpointCode(seg.to),
							text: lay?.text ?? ''
						})}
						class="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-border/50 pt-2 text-xs {tight
							? 'font-medium text-warning'
							: 'text-ink-muted'}"
					>
						{#if tight}<TriangleAlert class="size-3.5" aria-hidden="true" />{/if}
						<span>
							{t('layover_label', { code: endpointCode(seg.to) })}{lay?.text
								? ` · ${lay.text}`
								: ''}{tight ? ` · ${t('tight')}` : ''}
						</span>
						{#if lay?.changeAirport}<span>{t('change_airport')}</span>{/if}
					</div>
				{/if}
			</li>
		{/each}
	</ul>

	{#if flight.bookingRef || flight.cost != null || attachmentCount > 0 || flight.checkInUrl || bookingNotes}
		<footer
			class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-3 text-xs text-ink-muted"
		>
			{#if flight.bookingRef}
				<button
					type="button"
					onclick={async () => {
						const success = await copyToClipboard(flight.bookingRef!);
						if (success) {
							toast.success(t('copied_to_clipboard'));
						} else {
							toast.info(flight.bookingRef!);
						}
					}}
					title={t('click_to_copy_pnr')}
					class="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 py-1 transition-colors hover:bg-surface-sunken active:scale-95 sm:min-h-0"
				>
					<span>PNR <b class="font-semibold text-ink">{flight.bookingRef}</b></span>
					<Copy class="size-3 text-ink-muted" />
				</button>
			{/if}
			{#if flight.cost != null}
				<Badge variant="neutral">{formatMoney(flight.cost, flight.currency ?? homeCurrency)}</Badge>
			{/if}
			{#if attachmentCount > 0}
				<span class="inline-flex items-center gap-1">
					<Paperclip class="size-3.5" aria-hidden="true" />
					{attachmentCount > 1
						? t('file_count_many', { n: String(attachmentCount) })
						: t('file_count_one', { n: String(attachmentCount) })}
				</span>
			{/if}
			{#if flight.checkInUrl}
				<a
					href={flight.checkInUrl}
					target="_blank"
					rel="noopener noreferrer external"
					class="inline-flex min-h-[44px] items-center gap-1.5 rounded-md px-2 py-1 font-medium text-primary-700 hover:bg-primary-100 hover:underline sm:min-h-0 [&_svg]:size-3.5"
				>
					<ExternalLink />
					{t('check_in')}
				</a>
			{/if}
			{#if bookingNotes}
				<span class="w-full text-ink-muted">{bookingNotes}</span>
			{/if}
		</footer>
	{/if}
</article>
