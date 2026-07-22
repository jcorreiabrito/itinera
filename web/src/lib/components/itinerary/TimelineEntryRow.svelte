<script lang="ts">
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
    import { categoryMeta } from './categories';
    import { cn } from '$lib/utils';

    interface Props {
        entry: itinerary.TimelineEntry;
        /** Section links for read-only bookings. */
        links: { flights: string; reservations: string };
        /** Live bookings, to detect an item's linked-but-deleted booking. */
        flightsById?: Map<string, Flight>;
        reservationsById?: Map<string, Reservation>;
        homeCurrency?: string;
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
    const gutterLabel = $derived(entry.item?.allDay ? 'All day' : timeLabel);

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
                ? { removed: false, label: 'Flight', href: links.flights }
                : { removed: true, label: 'Flight', href: links.flights };
        }
        if (item.linkedReservationId) {
            const r = reservationsById?.get(item.linkedReservationId);
            return r
                ? { removed: false, label: r.name ?? 'Reservation', href: links.reservations }
                : { removed: true, label: 'Reservation', href: links.reservations };
        }
        return null;
    });

    function act(fn?: (item: ItineraryItem) => void) {
        menuOpen = false;
        if (entry.item) fn?.(entry.item);
    }
</script>

{#if entry.kind === 'item' && entry.item}
    {@const item = entry.item}
    {@const meta = categoryMeta(item.category)}
    {@const Icon = meta.icon}
    <li class="relative flex items-start gap-3">
        <span
            class="w-12 shrink-0 pt-2 text-right text-[0.7rem] font-medium leading-tight tabular-nums text-ink-muted"
            aria-hidden="{!!gutterLabel}"
        >
            {gutterLabel}
        </span>
        <span
            class="relative z-10 mt-1 grid size-8 shrink-0 place-items-center rounded-full border border-border bg-surface text-primary-700 [&_svg]:size-4"
            aria-hidden="true"
        >
            <Icon />
        </span>
        <div class="min-w-0 flex-1 rounded-lg border border-border bg-surface p-3 shadow-soft">
            <div class="flex items-start gap-2">
                <div class="min-w-0 flex-1">
                    <p class="font-medium text-ink">
                        {#if gutterLabel}<span class="sr-only">{gutterLabel} – </span>{/if}{item.title ?? 'Untitled'}
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
                            <span aria-hidden="true">·</span><span class="tabular-nums">until {formatTime(item.endTime)}</span>
                        {/if}
                        {#if item.location?.name}
                            <span aria-hidden="true">·</span>
                            <span class="inline-flex items-center gap-1">
                                <MapPin class="size-3" />
                                <span class="max-w-[10rem] truncate">{item.location.name}</span>
                            </span>
                        {/if}
                    </p>
                </div>
                {#if item.estCost != null || linkStatus || item.notes}
                    <div class="mt-1.5 flex flex-wrap items-center gap-1.5">
                        {#if item.estCost != null}
                            <Badge variant="neutral">{formatMoney(item.estCost, item.currency ?? homeCurrency)}</Badge>
                        {/if}
                        {#if linkStatus}
                            {#if linkStatus.removed}
                                <Badge variant="neutral" class="opacity-60">
                                    <Link2Off class="size-3" /> booking removed
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
                                onclick={() => (noteOpen = !noteOpen)}
                                aria-expanded={noteOpen}
                                aria-label={noteOpen ? 'Hide note' : 'Show note'}
                                class="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sunken px-2.5 py-0.5 text-xs font-medium text-ink-muted transition-colors hover:text-ink"
                            >
                                {noteOpen ? 'Hide note' : 'Note'}
                            </button>
                        {/if}
                    </div>
                {/if}
            </div>
            {#if noteOpen && item.notes}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div class="mt-2 space-y-1.5 border-t border-border pt-2 text-sm text-ink-muted">
                    {@html renderMarkdown(item.notes)}
                </div>
            {/if}
        </div>

        <Popover bind:open={menuOpen} label="Activity actions">
            {#snippet trigger({ toggle, open })}
                <button
                    type="button"
                    onclick={toggle}
                    aria-label="Activity actions"
                    aria-haspopup="true"
                    aria-expanded={open}
                    class="grid size-8 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink [&_svg]:size-4"
                >
                    <MoreVertical />
                </button>
            {/snippet}
            <MenuItem icon={Pencil} onclick={() => act(onedit)}>Edit</MenuItem>
            <MenuItem icon={ArrowUp} disabled={!canMoveUp} onclick={() => act(onmoveup)}>
                Move up
            </MenuItem>
            <MenuItem icon={ArrowDown} disabled={!canMoveDown} onclick={() => act(onmovedown)}>
                Move down
            </MenuItem>
            <MenuItem icon={CalendarDays} onclick={() => act(onmovetoday)}>Move to day...</MenuItem>
            {#if item.estCost != null}
                <MenuItem icon={Wallet} onclick={() => act(onaddexpense)}>Add as expense</MenuItem>
            {/if}
            <MenuItem icon={Trash2} tone="danger" onclick={() => act(ondelete)}>Delete</MenuItem>
        </Popover>
    </li>
{:else if entry.kind === 'flight' && entry.flight}
    {@const seg = entry.flight.segment}
    {@const arrivalDayOffset = entry.flight.computed?.arrivalDayOffset ?? 0}
    {@const from = seg?.from?.code ?? seg?.from?.city ?? '–'}
    {@const to = seg?.to?.code ?? seg?.to?.city ?? '–'}
    <li class="relative flex items-start gap-3">
        <span class="w-12 shrink-0 pt-2 text-right text-xs font-medium tabular-nums text-ink-muted">
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
            class="group min-w-0 flex-1 rounded-lg border border-border bg-surface-sunken p-3 transition-colors hover:bg-surface"
        >
            <div class="flex items-center gap-2">
                <div class="min-w-0 flex-1">
                    <p class="font-medium text-ink">
                        {#if timeLabel}<span class="sr-only">{timeLabel} – </span>{/if}
                        Flight {seg?.flightNumber ?? ''} <span class="tabular-nums">{from} → {to}</span>
                        {#if arrivalDayOffset > 0}
                            <span
                                class="ml-1 rounded-full bg-accent-terracotta/15 px-1.5 py-0.5 align-middle text-[0.65rem] font-semibold text-accent-terracotta"
                                title={`Arrives ${arrivalDayOffset} day${arrivalDayOffset > 1 ? 's' : ''} after departure`}
                            >
                                +{arrivalDayOffset}
                            </span>
                        {/if}
                    </p>
                    <p class="mt-0.5 text-xs text-ink-muted">{seg?.airline ?? ''} · <span>Tap to view in Flights</span></p>
                </div>
                <Badge variant="info">Booking</Badge>
                <ChevronRight class="size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
            </div>
        </a>
    </li>
{:else if entry.kind === 'reservation' && entry.reservation}
    {@const placement = entry.reservation}
    {@const res = placement.reservation}
    {@const ResIcon = resIcons[res?.kind ?? 'other'] ?? MapPin}
    {@const staying = placement.placement === 'staying'}
    {@const verb = {
        checkIn: 'Checking in',
        checkOut: 'Checking out',
        staying: 'Staying at',
        point: 'Reservation'
    }[placement.placement ?? 'staying']}
    <li class="relative flex items-start gap-3">
        <span class="w-12 shrink-0 pt-2 text-right text-xs font-medium tabular-nums text-ink-muted">
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
                'group min-w-0 flex-1 rounded-lg border border-border p-3 transition-colors',
                staying
                    ? 'bg-transparent hover:bg-surface-sunken'
                    : 'bg-surface-sunken hover:bg-surface'
            )}
        >
            <div class="flex items-center gap-2">
                <div class="min-w-0 flex-1">
                    <p class="font-medium text-ink">
                        {#if timeLabel}<span class="sr-only">{timeLabel} – </span>{/if}
                        {#if verb}<span class={staying ? 'text-sm text-ink-muted' : 'font-medium text-ink'}>{verb}</span> {/if}{res?.name ?? 'Reservation'}
                    </p>
                    {#if !staying}<Badge variant="primary">Booking</Badge>{/if}
                    <ChevronRight class="size-4 shrink-0 text-ink-muted transition-transform group-hover:translate-x-0.5" />
                </div>
            </div>
        </a>
    </li>
{/if}