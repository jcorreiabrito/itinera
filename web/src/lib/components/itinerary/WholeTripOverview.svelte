<script lang="ts">
	import type { ResolvedPathname } from '$app/types';
	import { DateTime } from 'luxon';
	import { itinerary } from '$lib/db';
	import type { Destination, ItineraryItem } from '$lib/db';
	import {
		BedDouble,
		Bus,
		Car,
		ListTodo,
		MapPin,
		Plus,
		Plane,
		Ticket,
		Utensils,
		Wallet
	} from 'lucide-svelte';
	import type { IconComponent } from '$lib/types';
	import { flagEmoji, formatMoney, formatTime } from '$lib/format';
	import { getDestinationForDate } from '$lib/destinations';
	import { minutesOfDay } from '$lib/db/datetime';
	import { categoryMeta } from './categories';
	import { cn } from '$lib/utils';
	import { t } from '$lib/i18n.svelte';

	interface Props {
		days: itinerary.DayTimeline[];
		destinations?: Destination[];
		homeCurrency?: string;
		links: { flights: ResolvedPathname; reservations: ResolvedPathname };
		onedit: (item: ItineraryItem) => void;
		onaddactivity: (date: string | null) => void;
	}

	let {
		days,
		destinations = [],
		homeCurrency = 'EUR',
		links,
		onedit,
		onaddactivity
	}: Props = $props();

	let gridScrollContainer = $state<HTMLDivElement>();

	const resIcons: Record<string, IconComponent> = {
		lodging: BedDouble,
		car: Car,
		restaurant: Utensils,
		activity: Ticket,
		transport: Bus,
		other: MapPin
	};

	const ROW_HEIGHT = 64; // Pixels per hour row
	const START_HOUR = 0;
	const START_MIN = START_HOUR * 60;

	// Parts helper for formatting dates
	function parts(iso: string | null) {
		if (!iso) return { weekday: '', day: '', month: '' };
		const dt = DateTime.fromISO(iso);
		return {
			weekday: dt.isValid ? dt.toFormat('ccc') : '',
			day: dt.isValid ? dt.toFormat('d') : '',
			month: dt.isValid ? dt.toFormat('LLL') : ''
		};
	}

	// Get display title based on entry kind
	function getTitle(entry: itinerary.TimelineEntry): string {
		if (entry.kind === 'flight' && entry.flight) {
			const seg = entry.flight.segment;
			const from = seg?.from?.code ?? seg?.from?.city ?? '–';
			const to = seg?.to?.code ?? seg?.to?.city ?? '–';
			return `Flight ${seg?.flightNumber ?? ''} ${from} → ${to}`;
		}
		if (entry.kind === 'reservation' && entry.reservation) {
			const placement = entry.reservation;
			const res = placement.reservation;
			if (placement.placement === 'point') {
				return res?.name ?? t('label_reservation');
			}
			const verb = {
				checkIn: 'Check-in',
				checkOut: 'Check-out',
				staying: 'Staying at',
				point: ''
			}[placement.placement ?? 'staying'];
			return `${verb}: ${res?.name ?? t('label_reservation')}`;
		}
		return entry.item?.title ?? t('untitled');
	}

	// Get display icon for entry
	function getIcon(entry: itinerary.TimelineEntry): IconComponent {
		if (entry.kind === 'flight') return Plane;
		if (entry.kind === 'reservation' && entry.reservation) {
			return resIcons[entry.reservation.reservation?.kind ?? 'other'] ?? MapPin;
		}
		return categoryMeta(entry.item?.category).icon;
	}

	// Get styles based on category/type
	function getEntryStyles(entry: itinerary.TimelineEntry): string {
		if (entry.kind === 'flight') {
			return 'bg-info/10 border-info/30 text-info hover:bg-info/20';
		}
		if (entry.kind === 'reservation') {
			const staying = entry.reservation?.placement === 'staying';
			return staying
				? 'bg-surface border-border text-ink-muted hover:bg-surface-sunken'
				: 'bg-primary-100 border-primary-200 text-primary-700 hover:bg-primary-200';
		}
		// Itinerary items
		const cat = entry.item?.category ?? 'other';
		switch (cat) {
			case 'sightseeing':
				return 'bg-accent-terracotta/10 border-accent-terracotta/20 text-accent-terracotta hover:bg-accent-terracotta/20';
			case 'food':
				return 'bg-accent-amber/10 border-accent-amber/20 text-accent-amber hover:bg-accent-amber/20';
			case 'transport':
				return 'bg-info/10 border-info/20 text-info hover:bg-info/20';
			case 'lodging':
				return 'bg-primary-100 border-primary-200 text-primary-700 hover:bg-primary-200';
			case 'activity':
				return 'bg-primary-100/50 border-primary-200/50 text-primary-700 hover:bg-primary-100';
			case 'free':
				return 'bg-surface-sunken border-border text-ink-muted hover:bg-surface';
			default:
				return 'bg-surface-sunken border-border text-ink-muted hover:bg-surface';
		}
	}

	// Get time range text
	function getTimeRangeText(entry: itinerary.TimelineEntry): string {
		if (entry.minutes == null) return '';
		const startText = formatTime(
			entry.item?.startTime ??
				(entry.kind === 'flight' ? entry.flight?.segment?.departLocal : entry.reservation?.time)
		);
		let endText = '';
		if (entry.kind === 'item' && entry.item?.endTime) {
			endText = ' - ' + formatTime(entry.item.endTime);
		}
		return `${startText}${endText}`;
	}

	// Get cost estimate
	function getCost(entry: itinerary.TimelineEntry): string {
		if (entry.kind === 'item' && entry.item?.estCost != null) {
			return formatMoney(entry.item.estCost, entry.item.currency ?? homeCurrency);
		}
		return '';
	}

	// Type definitions for position computation
	interface PositionedEntry {
		entry: itinerary.TimelineEntry;
		top: number; // in pixels
		height: number; // in pixels
		left: number; // percentage (0 to 100)
		width: number; // percentage (0 to 100)
	}

	// Resolve overlaps with interval partitioning
	function computePositions(entries: itinerary.TimelineEntry[]): PositionedEntry[] {
		const timed = entries
			.filter((e) => e.minutes !== null)
			.map((e) => {
				const start = e.minutes!;
				let duration = 60; // Default 1 hour duration
				if (e.kind === 'item' && e.item) {
					if (e.item.endTime) {
						const end = minutesOfDay(e.item.endTime);
						if (end !== null && end > start) {
							duration = end - start;
						}
					}
				}
				return { entry: e, start, end: start + duration };
			})
			.sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start));

		const clusters: { events: typeof timed; maxLanes: number }[] = [];
		for (const item of timed) {
			let placed = false;
			for (const cluster of clusters) {
				const overlaps = cluster.events.some((c) => item.start < c.end && item.end > c.start);
				if (overlaps) {
					cluster.events.push(item);
					placed = true;
					break;
				}
			}
			if (!placed) {
				clusters.push({ events: [item], maxLanes: 0 });
			}
		}

		const result: PositionedEntry[] = [];
		const MIN_HEIGHT = 32;

		for (const cluster of clusters) {
			const lanes: { end: number }[][] = [];
			const eventsWithLane = cluster.events.map((ev) => {
				let laneIndex = 0;
				while (true) {
					if (!lanes[laneIndex]) {
						lanes[laneIndex] = [];
					}
					const lastInLane = lanes[laneIndex][lanes[laneIndex].length - 1];
					if (!lastInLane || lastInLane.end <= ev.start) {
						lanes[laneIndex].push(ev);
						break;
					}
					laneIndex++;
				}
				return { ev, laneIndex };
			});

			const maxLanes = lanes.length;
			for (const { ev, laneIndex } of eventsWithLane) {
				const top = Math.max(0, (ev.start - START_MIN) * (ROW_HEIGHT / 60));
				const height = Math.max(MIN_HEIGHT, (ev.end - ev.start) * (ROW_HEIGHT / 60));
				const width = 100 / maxLanes;
				const left = laneIndex * width;

				result.push({
					entry: ev.entry,
					top,
					height,
					left,
					width
				});
			}
		}

		return result;
	}

	// Scroll to earliest activity or 07:00 on mount
	$effect(() => {
		if (gridScrollContainer && days.length > 0) {
			let earliestMin = 24 * 60;
			for (const day of days) {
				for (const entry of day.timed) {
					if (entry.minutes !== null) {
						earliestMin = Math.min(earliestMin, entry.minutes);
					}
				}
			}
			const targetMin = earliestMin < 24 * 60 ? Math.max(0, earliestMin - 60) : 7 * 60;
			gridScrollContainer.scrollTop = targetMin * (ROW_HEIGHT / 60);
		}
	});
</script>

<div
	bind:this={gridScrollContainer}
	class="relative max-h-[calc(100vh-200px)] min-h-[450px] w-full animate-fade-in select-none snap-x snap-mandatory overflow-auto overscroll-x-contain scroll-smooth rounded-xl border border-border bg-surface shadow-card lg:max-h-[calc(100vh-250px)]"
>
	<div class="flex min-w-max flex-col">
		<!-- Row 1: Sticky Header row containing day titles, to-dos and costs -->
		<div class="sticky top-0 z-40 flex border-b border-border bg-surface-sunken">
			<!-- TIME Corner Cell -->
			<div
				class="sticky left-0 z-50 flex h-[100px] w-12 shrink-0 items-center justify-center border-r border-border bg-surface-sunken text-[10px] font-bold tracking-wider text-ink-muted/80 sm:w-16"
			>
				TIME
			</div>
			<!-- Day Headers Columns -->
			<div class="flex flex-1">
				{#each days as day (day.date)}
					{@const p = parts(day.date)}
					<div
						class="flex h-[100px] w-[calc(100vw-4.5rem)] flex-1 shrink-0 snap-start flex-col justify-between gap-1 border-r border-border p-3 sm:w-[200px] lg:w-auto lg:min-w-[160px]"
					>
						<div class="flex items-start justify-between">
							<div>
								<span class="text-[10px] font-bold uppercase tracking-wider text-ink-muted"
									>{p.weekday}</span
								>
								<div class="text-base font-bold tabular-nums leading-tight text-ink">
									{p.day} <span class="text-xs font-semibold text-ink-muted">{p.month}</span>
								</div>
							</div>
							{#if day.date}
								<button
									type="button"
									onclick={() => onaddactivity(day.date)}
									aria-label="Add activity to {p.day} {p.month}"
									class="flex size-6 items-center justify-center rounded-md text-primary-600 transition-colors hover:bg-surface hover:text-primary-700"
								>
									<Plus class="size-4" />
								</button>
							{/if}
						</div>

						<!-- Destination Badge -->
						{#if day.date && destinations.length > 0}
							{@const activeDest = getDestinationForDate(day.date, destinations)}
							{#if activeDest}
								<div
									class="mt-0.5 flex items-center gap-1 truncate text-[10px] font-semibold text-primary-800"
									title={activeDest.name}
								>
									<span class="size-1.5 shrink-0 rounded-full bg-primary-600"></span>
									{#if flagEmoji(activeDest.country)}<span>{flagEmoji(activeDest.country)}</span
										>{/if}
									<span class="truncate">{activeDest.name}</span>
								</div>
							{/if}
						{/if}

						<!-- Day Metadata Title -->
						{#if day.day?.title}
							<div
								class="mt-0.5 truncate text-xs font-semibold text-primary-700"
								title={day.day.title}
							>
								{day.day.title}
							</div>
						{/if}

						<!-- Tasks & Costs summary badges -->
						<div class="mt-1 flex flex-wrap gap-x-2 gap-y-0.5">
							{#if day.todos.length > 0}
								<div
									class="inline-flex items-center gap-1 rounded-full border border-border bg-surface/50 px-1.5 py-0.5 text-[10px] font-medium text-ink-muted"
								>
									<ListTodo class="size-3 text-primary-600" />
									<span class="tabular-nums"
										>{day.todos.filter((t) => t.done).length}/{day.todos.length}</span
									>
								</div>
							{/if}

							{#if day.subtotal.spent > 0}
								<div
									class="inline-flex items-center gap-1 rounded-full border border-border bg-surface/50 px-1.5 py-0.5 text-[10px] font-semibold text-ink"
								>
									<Wallet class="size-3 text-primary-600" />
									<span class="tabular-nums"
										>{formatMoney(day.subtotal.spent, homeCurrency, { compact: true })}</span
									>
								</div>
							{/if}
						</div>
					</div>
				{/each}
			</div>
		</div>

		<!-- Row 2: Sticky All-Day / Untimed Row -->
		<div class="sticky top-[100px] z-30 flex border-b border-border bg-surface-sunken">
			<!-- ALL DAY Corner Cell -->
			<div
				class="sticky left-0 z-50 flex w-12 shrink-0 items-center justify-center border-r border-border bg-surface-sunken py-2 text-[9px] font-bold uppercase tracking-wider text-ink-muted/80 sm:w-16"
			>
				ALL DAY
			</div>
			<!-- Day Columns for All-Day elements -->
			<div class="flex flex-1 bg-surface-sunken">
				{#each days as day (day.date)}
					<div
						class="w-[calc(100vw-4.5rem)] flex-1 shrink-0 snap-start space-y-1 border-r border-border p-2 sm:w-[200px] lg:w-auto lg:min-w-[160px]"
					>
						<!-- Traditional All-Day items -->
						{#each day.allDay as item (item._id)}
							<button
								type="button"
								onclick={() => onedit(item)}
								class="flex w-full items-center gap-1.5 truncate rounded-md border border-primary-200 bg-primary-100/60 p-1.5 text-left text-xs text-primary-700 shadow-sm transition-colors hover:bg-primary-200/60"
							>
								<BedDouble class="size-3.5 shrink-0" />
								<span class="truncate font-medium">{item.title ?? t('untitled')}</span>
							</button>
						{/each}

						<!-- Untimed events in timed lane (minutes === null) -->
						{#each day.timed.filter((e) => e.minutes === null) as entry (itinerary.entryKey(entry))}
							{#if entry.kind === 'item' && entry.item}
								{@const meta = categoryMeta(entry.item.category)}
								{@const Icon = meta.icon}
								<button
									type="button"
									onclick={() => onedit(entry.item!)}
									class={cn(
										'flex w-full items-center gap-1.5 truncate rounded-md border p-1.5 text-left text-xs font-medium shadow-sm transition-colors',
										getEntryStyles(entry)
									)}
								>
									<Icon class="size-3.5 shrink-0" />
									<span class="truncate">{entry.item.title ?? t('untitled')}</span>
								</button>
							{:else if entry.kind === 'flight' && entry.flight}
								<a
									href={links.flights}
									class={cn(
										'flex w-full items-center gap-1.5 truncate rounded-md border p-1.5 text-left text-xs font-medium shadow-sm transition-colors',
										getEntryStyles(entry)
									)}
								>
									<Plane class="size-3.5 shrink-0" />
									<span class="truncate">{getTitle(entry)}</span>
								</a>
							{:else if entry.kind === 'reservation' && entry.reservation}
								{@const ResIcon =
									resIcons[entry.reservation.reservation?.kind ?? 'other'] ?? MapPin}
								<a
									href={links.reservations}
									class={cn(
										'flex w-full items-center gap-1.5 truncate rounded-md border p-1.5 text-left text-xs font-medium shadow-sm transition-colors',
										getEntryStyles(entry)
									)}
								>
									<ResIcon class="size-3.5 shrink-0" />
									<span class="truncate">{getTitle(entry)}</span>
								</a>
							{/if}
						{/each}

						{#if day.allDay.length === 0 && day.timed.filter((e) => e.minutes === null).length === 0}
							<div
								class="flex h-6 items-center justify-center text-[10px] italic text-ink-muted/40"
							>
								none
							</div>
						{/if}
					</div>
				{/each}
			</div>
		</div>

		<!-- Row 3: Timed Grid Area (scrolls vertically inside the unified parent viewport) -->
		<div class="relative flex">
			<!-- Left time markings sticky column (stays on left when scrolling horizontally) -->
			<div
				class="sticky left-0 z-30 w-12 shrink-0 select-none border-r border-border bg-surface shadow-[2px_0_4px_rgba(42,38,32,0.02)] sm:w-16"
			>
				{#each Array(24) as _, hour (hour)}
					<div
						class="flex h-16 items-start justify-end border-b border-border/30 bg-surface px-2 pt-1 text-[10px] font-semibold tabular-nums text-ink-muted/80"
					>
						{hour.toString().padStart(2, '0')}:00
					</div>
				{/each}
			</div>

			<!-- Main Hourly Columns Grid -->
			<div class="relative flex flex-1">
				<!-- Horizontal background gridlines -->
				<div class="pointer-events-none absolute inset-0 z-0 flex flex-col">
					{#each Array(24) as _, i (i)}
						<div class="h-16 w-full border-b border-border/10"></div>
					{/each}
				</div>

				<!-- Columns for each day's timed events -->
				{#each days as day (day.date)}
					<div
						class="relative z-10 h-[1536px] w-[calc(100vw-4.5rem)] flex-1 shrink-0 snap-start border-r border-border/30 bg-transparent sm:w-[200px] lg:w-auto lg:min-w-[160px]"
					>
						{#each computePositions(day.timed) as item (itinerary.entryKey(item.entry))}
							{@const Icon = getIcon(item.entry)}

							{#if item.entry.kind === 'item' && item.entry.item}
								<button
									type="button"
									onclick={() => onedit(item.entry.item!)}
									style="top: {item.top}px; height: {item.height}px; left: {item.left}%; width: {item.width}%;"
									class={cn(
										'hover:z-25 absolute z-10 flex flex-col justify-between overflow-hidden rounded-lg border p-1.5 text-left text-xs shadow-sm transition-all hover:scale-[1.01] hover:shadow',
										getEntryStyles(item.entry)
									)}
								>
									<div class="min-w-0">
										<div class="flex items-center gap-1 truncate font-semibold">
											<Icon class="size-3.5 shrink-0" />
											<span class="truncate">{getTitle(item.entry)}</span>
										</div>
										<div class="mt-0.5 text-[9px] font-medium tabular-nums opacity-80">
											{getTimeRangeText(item.entry)}
										</div>
									</div>

									{#if item.height > 50}
										<div
											class="border-current-soft mt-0.5 flex items-center justify-between truncate border-t pt-0.5 text-[9px] font-medium opacity-80"
										>
											<span class="max-w-[80px] truncate">
												{item.entry.item.location?.name ?? ''}
											</span>
											{#if getCost(item.entry)}
												<span class="shrink-0 font-semibold tabular-nums"
													>{getCost(item.entry)}</span
												>
											{/if}
										</div>
									{/if}
								</button>
							{:else if item.entry.kind === 'flight' && item.entry.flight}
								<a
									href={links.flights}
									style="top: {item.top}px; height: {item.height}px; left: {item.left}%; width: {item.width}%;"
									class={cn(
										'hover:z-25 absolute z-10 flex flex-col justify-between overflow-hidden rounded-lg border p-1.5 text-left text-xs shadow-sm transition-all hover:scale-[1.01] hover:shadow',
										getEntryStyles(item.entry)
									)}
								>
									<div class="min-w-0">
										<div class="flex items-center gap-1 truncate font-semibold">
											<Icon class="size-3.5 shrink-0" />
											<span class="truncate">{getTitle(item.entry)}</span>
										</div>
										<div class="mt-0.5 text-[9px] font-medium tabular-nums opacity-80">
											{getTimeRangeText(item.entry)}
										</div>
									</div>

									{#if item.height > 50}
										<div
											class="border-current-soft mt-0.5 flex items-center justify-between truncate border-t pt-0.5 text-[9px] font-medium opacity-80"
										>
											<span class="truncate">Flight Booking</span>
										</div>
									{/if}
								</a>
							{:else if item.entry.kind === 'reservation' && item.entry.reservation}
								<a
									href={links.reservations}
									style="top: {item.top}px; height: {item.height}px; left: {item.left}%; width: {item.width}%;"
									class={cn(
										'hover:z-25 absolute z-10 flex flex-col justify-between overflow-hidden rounded-lg border p-1.5 text-left text-xs shadow-sm transition-all hover:scale-[1.01] hover:shadow',
										getEntryStyles(item.entry)
									)}
								>
									<div class="min-w-0">
										<div class="flex items-center gap-1 truncate font-semibold">
											<Icon class="size-3.5 shrink-0" />
											<span class="truncate">{getTitle(item.entry)}</span>
										</div>
										<div class="mt-0.5 text-[9px] font-medium tabular-nums opacity-80">
											{getTimeRangeText(item.entry)}
										</div>
									</div>

									{#if item.height > 50}
										<div
											class="border-current-soft mt-0.5 flex items-center justify-between truncate border-t pt-0.5 text-[9px] font-medium opacity-80"
										>
											<span class="truncate">Reservation Booking</span>
										</div>
									{/if}
								</a>
							{/if}
						{/each}
					</div>
				{/each}
			</div>
		</div>
	</div>
</div>
