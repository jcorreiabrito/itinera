<script lang="ts">
  import { onMount } from 'svelte';
  import { DateTime } from 'luxon';
  import { checklist, itinerary } from '$lib/db';
  import type { ChecklistItem, Destination, Flight, ItineraryItem, Reservation } from '$lib/db';
  import {
    BedDouble,
    Bus,
    CalendarDays,
    Car,
    ChevronRight,
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

  interface Props {
    days: itinerary.DayTimeline[];
    tripId: string;
    dates: string[];
    destinations?: Destination[];
    homeCurrency?: string;
    flightsById?: Map<string, Flight>;
    reservationsById?: Map<string, Reservation>;
    links: { flights: string; reservations: string };
    onedit: (item: ItineraryItem) => void;
    onchanged: () => void;
    onaddactivity: (date: string | null) => void;
  }

  let {
    days,
    tripId,
    dates,
    destinations = [],
    homeCurrency = 'EUR',
    flightsById,
    reservationsById,
    links,
    onedit,
    onchanged,
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
  const END_HOUR = 24;
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
      const verb = {
        checkIn: 'Check-in',
        checkOut: 'Check-out',
        staying: 'Staying at',
        point: 'Reservation'
      }[placement.placement ?? 'staying'];
      return `${verb}: ${res?.name ?? 'Reservation'}`;
    }
    return entry.item?.title ?? 'Untitled';
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
    const startText = formatTime(entry.item?.startTime ?? (entry.kind === 'flight' ? entry.flight?.segment?.departLocal : entry.reservation?.time));
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
      .sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));

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
  class="overflow-auto max-h-[calc(100vh-250px)] min-h-[500px] w-full relative border border-border bg-surface rounded-xl shadow-card select-none animate-fade-in"
>
  <div class="flex flex-col min-w-max">
    <!-- Row 1: Sticky Header row containing day titles, to-dos and costs -->
    <div class="flex sticky top-0 z-40 border-b border-border bg-surface-sunken">
      <!-- TIME Corner Cell -->
      <div class="w-16 shrink-0 border-r border-border bg-surface-sunken sticky left-0 z-50 flex items-center justify-center text-[10px] font-bold tracking-wider text-ink-muted/80 h-[100px]">
        TIME
      </div>
      <!-- Day Headers Columns -->
      <div class="flex flex-1">
        {#each days as day}
          {@const p = parts(day.date)}
          <div class="flex-1 min-w-[160px] border-r border-border p-3 flex flex-col justify-between gap-1 h-[100px]">
            <div class="flex items-start justify-between">
              <div>
                <span class="text-[10px] font-bold text-ink-muted uppercase tracking-wider">{p.weekday}</span>
                <div class="text-base font-bold text-ink leading-tight tabular-nums">
                  {p.day} <span class="text-xs font-semibold text-ink-muted">{p.month}</span>
                </div>
              </div>
              {#if day.date}
                <button
                  type="button"
                  onclick={() => onaddactivity(day.date)}
                  aria-label="Add activity to {p.day} {p.month}"
                  class="size-6 rounded-md hover:bg-surface text-primary-600 hover:text-primary-700 transition-colors flex items-center justify-center"
                >
                  <Plus class="size-4" />
                </button>
              {/if}
            </div>

            <!-- Destination Badge -->
            {#if day.date && destinations.length > 0}
              {@const activeDest = getDestinationForDate(day.date, destinations)}
              {#if activeDest}
                <div class="text-[10px] font-semibold text-primary-800 truncate flex items-center gap-1 mt-0.5" title={activeDest.name}>
                  <span class="size-1.5 rounded-full bg-primary-600 shrink-0"></span>
                  {#if flagEmoji(activeDest.country)}<span>{flagEmoji(activeDest.country)}</span>{/if}
                  <span class="truncate">{activeDest.name}</span>
                </div>
              {/if}
            {/if}

            <!-- Day Metadata Title -->
            {#if day.day?.title}
              <div class="text-xs font-semibold text-primary-700 truncate mt-0.5" title={day.day.title}>
                {day.day.title}
              </div>
            {/if}

            <!-- Tasks & Costs summary badges -->
            <div class="flex flex-wrap gap-x-2 gap-y-0.5 mt-1">
              {#if day.todos.length > 0}
                <div class="inline-flex items-center gap-1 text-[10px] text-ink-muted font-medium bg-surface/50 border border-border px-1.5 py-0.5 rounded-full">
                  <ListTodo class="size-3 text-primary-600" />
                  <span class="tabular-nums">{day.todos.filter((t) => t.done).length}/{day.todos.length}</span>
                </div>
              {/if}

              {#if day.subtotal.spent > 0}
                <div class="inline-flex items-center gap-1 text-[10px] text-ink font-semibold bg-surface/50 border border-border px-1.5 py-0.5 rounded-full">
                  <Wallet class="size-3 text-primary-600" />
                  <span class="tabular-nums">{formatMoney(day.subtotal.spent, homeCurrency, { compact: true })}</span>
                </div>
              {/if}
            </div>
          </div>
        {/each}
      </div>
    </div>

    <!-- Row 2: Sticky All-Day / Untimed Row -->
    <div class="flex sticky top-[100px] z-30 border-b border-border bg-surface-sunken">
      <!-- ALL DAY Corner Cell -->
      <div class="w-16 shrink-0 border-r border-border bg-surface-sunken sticky left-0 z-50 flex items-center justify-center text-[9px] font-bold tracking-wider text-ink-muted/80 uppercase py-2">
        ALL DAY
      </div>
      <!-- Day Columns for All-Day elements -->
      <div class="flex flex-1 bg-surface-sunken">
        {#each days as day}
          <div class="flex-1 min-w-[160px] border-r border-border p-2 space-y-1">
            <!-- Traditional All-Day items -->
            {#each day.allDay as item (item._id)}
              <button
                type="button"
                onclick={() => onedit(item)}
                class="w-full text-left p-1.5 rounded-md text-xs border bg-primary-100/60 border-primary-200 text-primary-700 hover:bg-primary-200/60 transition-colors flex items-center gap-1.5 truncate shadow-sm"
              >
                <BedDouble class="size-3.5 shrink-0" />
                <span class="truncate font-medium">{item.title ?? 'Untitled'}</span>
              </button>
            {/each}

            <!-- Untimed events in timed lane (minutes === null) -->
            {#each day.timed.filter((e) => e.minutes === null) as entry}
              {#if entry.kind === 'item' && entry.item}
                {@const meta = categoryMeta(entry.item.category)}
                {@const Icon = meta.icon}
                <button
                  type="button"
                  onclick={() => onedit(entry.item!)}
                  class={cn(
                    'w-full text-left p-1.5 rounded-md text-xs border transition-colors flex items-center gap-1.5 truncate shadow-sm font-medium',
                    getEntryStyles(entry)
                  )}
                >
                  <Icon class="size-3.5 shrink-0" />
                  <span class="truncate">{entry.item.title ?? 'Untitled'}</span>
                </button>
              {:else if entry.kind === 'flight' && entry.flight}
                <a
                  href={links.flights}
                  class={cn(
                    'w-full text-left p-1.5 rounded-md text-xs border transition-colors flex items-center gap-1.5 truncate shadow-sm font-medium',
                    getEntryStyles(entry)
                  )}
                >
                  <Plane class="size-3.5 shrink-0" />
                  <span class="truncate">{getTitle(entry)}</span>
                </a>
              {:else if entry.kind === 'reservation' && entry.reservation}
                {@const ResIcon = resIcons[entry.reservation.reservation?.kind ?? 'other'] ?? MapPin}
                <a
                  href={links.reservations}
                  class={cn(
                    'w-full text-left p-1.5 rounded-md text-xs border transition-colors flex items-center gap-1.5 truncate shadow-sm font-medium',
                    getEntryStyles(entry)
                  )}
                >
                  <ResIcon class="size-3.5 shrink-0" />
                  <span class="truncate">{getTitle(entry)}</span>
                </a>
              {/if}
            {/each}

            {#if day.allDay.length === 0 && day.timed.filter((e) => e.minutes === null).length === 0}
              <div class="h-6 flex items-center justify-center text-[10px] text-ink-muted/40 italic">
                none
              </div>
            {/if}
          </div>
        {/each}
      </div>
    </div>

    <!-- Row 3: Timed Grid Area (scrolls vertically inside the unified parent viewport) -->
    <div class="flex relative">
      <!-- Left time markings sticky column (stays on left when scrolling horizontally) -->
      <div class="w-16 shrink-0 border-r border-border bg-surface select-none sticky left-0 z-30 shadow-[2px_0_4px_rgba(42,38,32,0.02)]">
        {#each Array(24) as _, hour}
          <div class="h-16 border-b border-border/30 px-2 flex items-start justify-end text-[10px] font-semibold tabular-nums text-ink-muted/80 pt-1 bg-surface">
            {hour.toString().padStart(2, '0')}:00
          </div>
        {/each}
      </div>

      <!-- Main Hourly Columns Grid -->
      <div class="flex-1 flex relative">
        <!-- Horizontal background gridlines -->
        <div class="absolute inset-0 pointer-events-none flex flex-col z-0">
          {#each Array(24) as _}
            <div class="h-16 border-b border-border/10 w-full"></div>
          {/each}
        </div>

        <!-- Columns for each day's timed events -->
        {#each days as day}
          <div class="flex-1 min-w-[160px] border-r border-border/30 relative h-[1536px] z-10 bg-transparent">
            {#each computePositions(day.timed) as item}
              {@const Icon = getIcon(item.entry)}
              
              {#if item.entry.kind === 'item' && item.entry.item}
                <button
                  type="button"
                  onclick={() => onedit(item.entry.item!)}
                  style="top: {item.top}px; height: {item.height}px; left: {item.left}%; width: {item.width}%;"
                  class={cn(
                    'absolute p-1.5 rounded-lg border text-xs text-left shadow-sm transition-all hover:shadow hover:scale-[1.01] hover:z-25 overflow-hidden flex flex-col justify-between z-10',
                    getEntryStyles(item.entry)
                  )}
                >
                  <div class="min-w-0">
                    <div class="font-semibold truncate flex items-center gap-1">
                      <Icon class="size-3.5 shrink-0" />
                      <span class="truncate">{getTitle(item.entry)}</span>
                    </div>
                    <div class="text-[9px] opacity-80 mt-0.5 font-medium tabular-nums">
                      {getTimeRangeText(item.entry)}
                    </div>
                  </div>

                  {#if item.height > 50}
                    <div class="mt-0.5 flex items-center justify-between text-[9px] opacity-80 font-medium border-t border-current/10 pt-0.5 truncate">
                      <span class="truncate max-w-[80px]">
                        {item.entry.item.location?.name ?? ''}
                      </span>
                      {#if getCost(item.entry)}
                        <span class="font-semibold tabular-nums shrink-0">{getCost(item.entry)}</span>
                      {/if}
                    </div>
                  {/if}
                </button>
              {:else if item.entry.kind === 'flight' && item.entry.flight}
                <a
                  href={links.flights}
                  style="top: {item.top}px; height: {item.height}px; left: {item.left}%; width: {item.width}%;"
                  class={cn(
                    'absolute p-1.5 rounded-lg border text-xs text-left shadow-sm transition-all hover:shadow hover:scale-[1.01] hover:z-25 overflow-hidden flex flex-col justify-between z-10',
                    getEntryStyles(item.entry)
                  )}
                >
                  <div class="min-w-0">
                    <div class="font-semibold truncate flex items-center gap-1">
                      <Icon class="size-3.5 shrink-0" />
                      <span class="truncate">{getTitle(item.entry)}</span>
                    </div>
                    <div class="text-[9px] opacity-80 mt-0.5 font-medium tabular-nums">
                      {getTimeRangeText(item.entry)}
                    </div>
                  </div>
                  
                  {#if item.height > 50}
                    <div class="mt-0.5 flex items-center justify-between text-[9px] opacity-80 font-medium border-t border-current/10 pt-0.5 truncate">
                      <span class="truncate">Flight Booking</span>
                    </div>
                  {/if}
                </a>
              {:else if item.entry.kind === 'reservation' && item.entry.reservation}
                <a
                  href={links.reservations}
                  style="top: {item.top}px; height: {item.height}px; left: {item.left}%; width: {item.width}%;"
                  class={cn(
                    'absolute p-1.5 rounded-lg border text-xs text-left shadow-sm transition-all hover:shadow hover:scale-[1.01] hover:z-25 overflow-hidden flex flex-col justify-between z-10',
                    getEntryStyles(item.entry)
                  )}
                >
                  <div class="min-w-0">
                    <div class="font-semibold truncate flex items-center gap-1">
                      <Icon class="size-3.5 shrink-0" />
                      <span class="truncate">{getTitle(item.entry)}</span>
                    </div>
                    <div class="text-[9px] opacity-80 mt-0.5 font-medium tabular-nums">
                      {getTimeRangeText(item.entry)}
                    </div>
                  </div>

                  {#if item.height > 50}
                    <div class="mt-0.5 flex items-center justify-between text-[9px] opacity-80 font-medium border-t border-current/10 pt-0.5 truncate">
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
