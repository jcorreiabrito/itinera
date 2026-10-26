<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import type { ItineraryItem, Flight, Reservation } from '$lib/db';
	import { itinerary } from '$lib/db';
	import {
		ArrowDown,
		ArrowUp,
		BedDouble,
		Bus,
		CalendarDays,
		Car,
		ChevronRight,
		GripVertical,
		Link2,
		Link2Off,
		MapPin,
		MoreVertical,
		Pencil,
		Plane,
		Ticket,
		Trash2,
		Utensils,
		Wallet
	} from 'lucide-svelte';
	import { Badge, MenuItem, Popover } from '$lib/components/ui';
	import type { IconComponent } from '$lib/types';
	import { entryTimeLabel } from '$lib/overview';
	import { formatMoney, formatTime } from '$lib/format';
	import { renderMarkdown } from '$lib/markdown';
	import { t } from '$lib/i18n.svelte';
	import { categoryMeta } from './categories';
	import { cn } from '$lib/utils';

	interface Props {
		entry: itinerary.TimelineEntry;
		/** Section links for read-only bookings. */
		links: { flights: ResolvedPathname; reservations: ResolvedPathname };
		/** Live bookings, to detect an item's linked-but-deleted booking. */
		flightsById?: Map<string, Flight>;
		reservationsById?: Map<string, Reservation>;
		homeCurrency?: string;
		travelerCount?: number;
		/** Reorderable lane row: renders the drag handle. */
		draggable?: boolean;
		/** The lane the row belongs to, exposed as a drop-target contract. */
		dragLane?: 'allDay' | 'untimed';
		ondragpointerdown?: (event: PointerEvent, item: ItineraryItem) => void;
		canMoveUp?: boolean;
		canMoveDown?: boolean;
		onedit: (item: ItineraryItem) => void;
		onmoveup?: (item: ItineraryItem) => void;
		onmovedown?: (item: ItineraryItem) => void;
		onmovetoday?: (item: ItineraryItem) => void;
		onaddexpense?: (item: ItineraryItem) => void;
		ondelete: (item: ItineraryItem) => void;
	}

	let {
		entry,
		links,
		flightsById,
		reservationsById,
		homeCurrency = 'EUR',
		travelerCount = 1,
		draggable = false,
		dragLane,
		ondragpointerdown,
		canMoveUp = false,
		canMoveDown = false,
		onedit,
		onmoveup,
		onmovedown,
		onmovetoday,
		onaddexpense,
		ondelete
	}: Props = $props();

	let menuOpen = $state(false);
	let noteOpen = $state(false);

	const timeLabel = $derived(entry.minutes != null ? entryTimeLabel(entry.minutes) : '');
	const gutterLabel = $derived(entry.item?.allDay ? t('all_day') : timeLabel);

	const resIcons: Record<string, IconComponent> = {
		lodging: BedDouble,
		car: Car,
		restaurant: Utensils,
		activity: Ticket,
		transport: Bus,
		other: MapPin
	};

	// --- Item link status (linked booking present / removed) --------------------
	const linkStatus = $derived.by(() => {
		const item = entry.item;
		if (!item) return null;
		if (item.linkedFlightId) {
			const f = flightsById?.get(item.linkedFlightId);
			return f
				? { removed: false, label: t('flight'), href: links.flights }
				: { removed: true, label: t('flight'), href: links.flights };
		}
		if (item.linkedReservationId) {
			const r = reservationsById?.get(item.linkedReservationId);
			return r
				? { removed: false, label: r.name ?? t('label_reservation'), href: links.reservations }
				: { removed: true, label: t('label_reservation'), href: links.reservations };
		}
		return null;
	});

	function act(fn?: (item: ItineraryItem) => void) {
		menuOpen = false;
		if (entry.item) fn?.(entry.item);
	}

	/*
	 * Arrow keys on the handle go through the same `move()` path as the row
	 * menu, so a keyboard user who finds the drag affordance is not left holding
	 * a control that only works with a pointer.
	 */
	function onHandleKeyDown(event: KeyboardEvent, item: ItineraryItem) {
		if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
		if (event.altKey || event.ctrlKey || event.metaKey) return;
		event.preventDefault();
		event.stopPropagation();
		if (event.key === 'ArrowUp' && canMoveUp) onmoveup?.(item);
		else if (event.key === 'ArrowDown' && canMoveDown) onmovedown?.(item);
	}
</script>

{#snippet activityMenu(item: ItineraryItem)}
	<Popover bind:open={menuOpen} label={t('activity_actions')} align="end">
		{#snippet trigger({ toggle, open })}
			<button
				type="button"
				onclick={(e) => {
					e.stopPropagation();
					toggle();
				}}
				aria-label={t('activity_actions')}
				aria-haspopup="true"
				aria-expanded={open}
				class="grid size-11 min-h-[44px] min-w-[44px] shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink active:scale-95 sm:size-9 sm:min-h-0 sm:min-w-0 [&_svg]:size-5 sm:[&_svg]:size-4"
			>
				<MoreVertical />
			</button>
		{/snippet}
		<MenuItem icon={Pencil} onclick={() => act(onedit)}>{t('edit')}</MenuItem>
		<MenuItem icon={ArrowUp} disabled={!canMoveUp} onclick={() => act(onmoveup)}
			>{t('move_up')}</MenuItem
		>
		<MenuItem icon={ArrowDown} disabled={!canMoveDown} onclick={() => act(onmovedown)}>
			{t('move_down')}
		</MenuItem>
		<MenuItem icon={CalendarDays} onclick={() => act(onmovetoday)}>{t('move_to_day')}</MenuItem>
		{#if item.estCost != null}
			<MenuItem icon={Wallet} onclick={() => act(onaddexpense)}>{t('add_as_expense')}</MenuItem>
		{/if}
		<MenuItem icon={Trash2} tone="danger" onclick={() => act(ondelete)}>{t('delete')}</MenuItem>
	</Popover>
{/snippet}

{#if entry.kind === 'item' && entry.item}
	{@const item = entry.item}
	{@const meta = categoryMeta(item.category)}
	{@const Icon = meta.icon}
	<li class="relative flex items-start gap-2 sm:gap-3" data-drag-lane={dragLane}>
		<span
			class="w-10 shrink-0 pt-2 text-right text-[0.7rem] font-medium tabular-nums leading-tight text-ink-muted sm:w-12"
			aria-hidden={!!gutterLabel}
		>
			{gutterLabel}
		</span>
		<span
			class="relative z-10 mt-1 grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface text-primary-700 [&_svg]:size-4"
			aria-hidden="true"
		>
			<Icon />
		</span>
		<!-- `-webkit-tap-highlight-color` is off app-wide (app.css), so the card shows its own press. -->
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			onclick={(e) => {
				if ((e.target as HTMLElement)?.closest('button, a')) return;
				onedit(item);
			}}
			class="density-row min-w-0 flex-1 cursor-pointer rounded-lg border border-border bg-surface p-3 shadow-soft transition-colors hover:border-primary-600/40 active:scale-[0.99]"
		>
			<div class="flex items-start justify-between gap-2">
				{#if draggable}
					<button
						type="button"
						data-drag-handle
						aria-label={t('gestures_drag_item', { title: item.title ?? t('untitled') })}
						aria-keyshortcuts="ArrowUp ArrowDown"
						onpointerdown={(e) => ondragpointerdown?.(e, item)}
						onkeydown={(e) => onHandleKeyDown(e, item)}
						class="-ml-1.5 -mt-1.5 grid size-11 min-h-[44px] min-w-[44px] shrink-0 touch-none place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-surface active:scale-95"
					>
						<GripVertical class="size-5" aria-hidden="true" />
					</button>
				{/if}
				<div class="min-w-0 flex-1">
					<p class="font-medium text-ink">
						{#if gutterLabel}<span class="sr-only">{gutterLabel} – </span>{/if}{item.title ??
							t('untitled')}
					</p>
					<p class="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-ink-muted">
						<span class="inline-flex items-center gap-1">
							<Icon class="size-3.5" />
							{meta.label}
						</span>
						{#if timeLabel && !item.allDay}
							<span aria-hidden="true">·</span><span>{timeLabel}</span>
						{/if}
						{#if item.endTime && !item.allDay}
							<span aria-hidden="true">·</span><span class="tabular-nums"
								>{t('until_time', { time: formatTime(item.endTime) })}</span
							>
						{/if}
						{#if item.location?.name}
							<span aria-hidden="true">·</span>
							<!-- The edit sheet shows the address; compact rows keep the activity. -->
							<span class="density-secondary inline-flex items-center gap-1">
								<MapPin class="size-3" />
								<span class="max-w-[10rem] truncate">{item.location.name}</span>
							</span>
						{/if}
					</p>
				</div>
				<div class="-mr-1 -mt-1 shrink-0">
					{@render activityMenu(item)}
				</div>
			</div>

			{#if item.estCost != null || linkStatus || item.notes}
				<div class="mt-2 flex flex-wrap items-center gap-1.5">
					{#if item.estCost != null}
						{@const ccy = item.currency ?? homeCurrency}
						{@const costStr = formatMoney(item.estCost, ccy, { decimals: true })}
						<span
							title={travelerCount > 1
								? t('cost_total_tooltip', {
										total: costStr,
										perPerson: formatMoney(item.estCost / travelerCount, ccy, { decimals: true })
									})
								: costStr}
						>
							<Badge variant="neutral">
								{costStr}
								{#if travelerCount > 1}
									<span class="ml-1 text-[0.7rem] font-normal opacity-75"
										>({formatMoney(item.estCost / travelerCount, ccy, {
											decimals: true
										})}/p.p.)</span
									>
								{/if}
							</Badge>
						</span>
					{/if}
					{#if linkStatus}
						{#if linkStatus.removed}
							<Badge variant="neutral" class="opacity-60">
								<Link2Off class="size-3" />
								{t('booking_removed')}
							</Badge>
						{:else if linkStatus}
							<a href={linkStatus.href} class="inline-flex">
								<Badge variant="primary"><Link2 class="size-3" /> {linkStatus.label}</Badge>
							</a>
						{/if}
					{/if}
					{#if item.notes}
						<button
							type="button"
							onclick={(e) => {
								e.stopPropagation();
								noteOpen = !noteOpen;
							}}
							aria-expanded={noteOpen}
							aria-label={noteOpen ? t('hide_note') : t('show_note')}
							class="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sunken px-2.5 py-0.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
						>
							{noteOpen ? t('hide_note') : t('note')}
						</button>
					{/if}
				</div>
			{/if}

			{#if noteOpen && item.notes}
				<div class="mt-2 space-y-1.5 border-t border-border pt-2 text-sm text-ink-muted">
					<!-- eslint-disable-next-line svelte/no-at-html-tags -- renderMarkdown escapes all user text and only adds allowlisted tags ($lib/markdown.ts) -->
					{@html renderMarkdown(item.notes)}
				</div>
			{/if}
		</div>
	</li>
{:else if entry.kind === 'flight' && entry.flight}
	{@const seg = entry.flight.segment}
	{@const arrivalDayOffset = entry.flight.computed?.arrivalDayOffset ?? 0}
	{@const from = seg?.from?.code ?? seg?.from?.city ?? '–'}
	{@const to = seg?.to?.code ?? seg?.to?.city ?? '–'}
	<li class="relative flex items-start gap-2 sm:gap-3">
		<span
			class="w-10 shrink-0 pt-2 text-right text-xs font-medium tabular-nums text-ink-muted sm:w-12"
		>
			{timeLabel}
		</span>
		<span
			class="relative z-10 mt-1 grid size-8 shrink-0 place-items-center rounded-full border border-info/30 bg-info/10 text-info [&_svg]:size-4"
			aria-hidden="true"
		>
			<Plane />
		</span>
		<a
			href={links.flights}
			class="density-row group min-w-0 flex-1 rounded-lg border border-border bg-surface-sunken p-3 transition-colors hover:bg-surface active:scale-[0.99]"
		>
			<div class="flex items-center gap-2">
				<div class="min-w-0 flex-1">
					<p class="font-medium text-ink">
						{#if timeLabel}<span class="sr-only">{timeLabel} – </span>{/if}
						{t('flight_n', { n: seg?.flightNumber ?? '' })}
						<span class="tabular-nums">{from} → {to}</span>
						{#if arrivalDayOffset > 0}
							<span
								class="ml-1 rounded-full bg-accent-terracotta/15 px-1.5 py-0.5 align-middle text-[0.65rem] font-semibold text-accent-terracotta"
								title={t(
									arrivalDayOffset > 1 ? 'arrives_days_after_many' : 'arrives_days_after_one',
									{ n: String(arrivalDayOffset) }
								)}
							>
								+{arrivalDayOffset}
							</span>
						{/if}
					</p>
					<p class="mt-0.5 text-xs text-ink-muted">
						{seg?.airline ?? ''} · <span>{t('tap_to_view_flights')}</span>
					</p>
				</div>
				<Badge variant="info">{t('bookings')}</Badge>
				<ChevronRight
					class="size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5"
				/>
			</div>
		</a>
	</li>
{:else if entry.kind === 'reservation' && entry.reservation}
	{@const placement = entry.reservation}
	{@const res = placement.reservation}
	{@const ResIcon = resIcons[res?.kind ?? 'other'] ?? MapPin}
	{@const staying = placement.placement === 'staying'}
	{@const verb = {
		checkIn: t('check_in') + ':',
		checkOut: t('check_out') + ':',
		staying: t('staying_at'),
		point: ''
	}[placement.placement ?? 'staying']}
	<li class="relative flex items-start gap-2 sm:gap-3">
		<span
			class="w-10 shrink-0 pt-2 text-right text-xs font-medium tabular-nums text-ink-muted sm:w-12"
		>
			{timeLabel}
		</span>
		<span
			class={cn(
				'relative z-10 mt-1 grid size-8 shrink-0 place-items-center rounded-full border [&_svg]:size-4',
				staying
					? 'border-border bg-surface text-ink-muted'
					: 'border-primary-100 bg-primary-100 text-primary-700'
			)}
			aria-hidden="true"
		>
			<ResIcon />
		</span>
		<a
			href={links.reservations}
			class={cn(
				'density-row group min-w-0 flex-1 rounded-lg border border-border p-3 transition-colors active:scale-[0.99]',
				staying ? 'bg-transparent hover:bg-surface-sunken' : 'bg-surface-sunken hover:bg-surface'
			)}
		>
			<div class="flex items-center gap-2">
				<div class="min-w-0 flex-1">
					<p class="font-medium text-ink">
						{#if timeLabel}<span class="sr-only">{timeLabel} – </span>{/if}
						{#if verb}<span class={staying ? 'text-sm text-ink-muted' : 'font-medium text-ink'}
								>{verb}</span
							>
						{/if}{res?.name ?? t('reservations')}
					</p>
					{#if !staying}<Badge variant="primary">{t('bookings')}</Badge>{/if}
					<ChevronRight
						class="size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5"
					/>
				</div>
			</div>
		</a>
	</li>
{/if}
