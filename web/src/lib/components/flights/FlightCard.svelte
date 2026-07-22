<script lang="ts">
    import { flights } from '$lib/db';
    import type { Flight } from '$lib/db';
    import {
        ArrowRight,
        ExternalLink,
        MoreVertical,
        Paperclip,
        Pencil,
        Plane,
        Trash2,
        TriangleAlert
    } from 'lucide-svelte';
    import { Badge, MenuItem, Popover } from '$lib/components/ui';
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

    let {
        flight,
        homeCurrency = 'EUR',
        attachmentCount = 0,
        onedit,
        ondelete
    }: Props = $props();

    let menuOpen = $state(false);

    const computed = $derived(flights.computeFlight(flight));
    const segs = $derived(computed.segments);
    const ariaSummary = $derived(flightAriaSummary(computed));
    const headDate = $derived(formatWeekdayDate(firstDepart(flight)));
    const bookingNotes = $derived((flight as Flight & { notes?: string }).notes ?? '');
    const totalDuration = $derived(
        segs.map((s) => s.durationText).filter(Boolean).join(' + ')
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
                    {computed.route || 'Flight'}
                </span>
                {#if computed.stops > 0}
                    <Badge variant="neutral">{computed.stops} stop{computed.stops > 1 ? 's' : ''}</Badge>
                {:else}
                    <Badge variant="neutral">Direct</Badge>
                {/if}
            </p>
            <p class="mt-0.5 text-xs text-ink-muted">
                {#if headDate}{headDate}{/if}{#if totalDuration}{headDate ? ' · ' : ''}{totalDuration}{/if}
            </p>
        </div>

        <Popover bind:open={menuOpen} label="Flight actions">
            {#snippet trigger({ toggle, open })}
                <button
                    type="button"
                    onclick={toggle}
                    aria-label="Flight actions"
                    aria-haspopup="true"
                    aria-expanded={open}
                    class="grid size-8 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken hover:text-ink [&_svg]:size-4"
                >
                    <MoreVertical />
                </button>
            {/snippet}
            <MenuItem icon={Pencil} onclick={() => act(onedit)}>Edit</MenuItem>
            <MenuItem icon={Trash2} tone="danger" onclick={() => act(ondelete)}>Delete</MenuItem>
        </Popover>
    </header>

    <!-- Each leg is a labelled list item; layovers are separate text items. -->
    <ul class="mt-4 flex flex-col gap-2" aria-label="Flight legs">
        {#each segs as seg, i (i)}
            <li
                aria-label={legAriaLabel(seg)}
                class="rounded-md border border-border bg-surface-sunken/40 p-2.5"
            >
                <div class="flex items-baseline justify-between gap-2">
                    <span class="text-sm font-medium text-ink">{airlineLabel(seg) || 'Flight'}</span>
                    {#if seg.durationText}
                        <span class="text-xs tabular-nums text-ink-muted">{seg.durationText}</span>
                    {/if}
                </div>

                <div class="mt-1.5 flex items-center gap-2 text-sm">
                    <span class="font-semibold tabular-nums text-ink">{endpointCode(seg.from)}</span>
                    <span class="tabular-nums text-ink-muted">{formatTime(seg.departLocal)}</span>
                    <span class="h-px flex-1 border-t border-dashed border-border" aria-hidden="true"></span>
                    <ArrowRight class="size-3.5 shrink-0 text-ink-muted" aria-hidden="true" />
                    <span class="font-semibold tabular-nums text-ink">{endpointCode(seg.to)}</span>
                    <span class="tabular-nums text-ink-muted">{formatTime(seg.arriveLocal)}</span>
                    {#if seg.arrivalDayOffset > 0}
                        <span
                            class="rounded-full bg-accent-terracotta/15 px-1.5 py-0.5 text-[0.65rem] font-semibold text-accent-terracotta"
                            title={`Arrives ${seg.arrivalDayOffset} day after departure`}
                        >
                            +{seg.arrivalDayOffset}
                        </span>
                    {/if}
                </div>

                {#if seg.seat || seg.terminal || seg.gate || seg.baggage}
                    <p class="mt-1.5 flex flex-wrap gap-3 gap-y-0.5 text-xs text-ink-muted">
                        {#if seg.seat}<span>Seat: <b class="font-semibold text-ink">{seg.seat}</b></span>{/if}
                        {#if seg.terminal}<span>Terminal: <b class="font-semibold text-ink">{seg.terminal}</b></span>{/if}
                        {#if seg.gate}<span>Gate: <b class="font-semibold text-ink">{seg.gate}</b></span>{/if}
                        {#if seg.baggage}<span>Baggage: <b class="font-semibold text-ink">{seg.baggage}</b></span>{/if}
                    </p>
                {/if}

                {#if i < segs.length - 1}
                    {@const lay = computed.layovers[i]}
                    {@const tight = lay ? (lay.minutes != null && lay.minutes < 60) : false}
                    <div
                        aria-label={`Layover at ${endpointCode(seg.to)}: ${lay?.text}`}
                        class="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 border-t border-border/50 pt-2 text-xs {tight ? 'text-warning font-medium' : 'text-ink-muted'}"
                    >
                        {#if tight}<TriangleAlert class="size-3.5" aria-hidden="true" />{/if}
                        <span>
                            Layover {endpointCode(seg.to)}{lay?.text ? ` · ${lay.text}` : ''}{tight ? ` · tight` : ''}
                        </span>
                        {#if lay?.changeAirport}<span>🔄 change airport</span>{/if}
                    </div>
                {/if}
            </li>
        {/each}
    </ul>

    {#if flight.bookingRef || flight.cost != null || attachmentCount > 0 || flight.checkInUrl || bookingNotes}
        <footer class="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 border-t border-border pt-3 text-xs text-ink-muted">
            {#if flight.bookingRef}
                <span>PNR <b class="font-semibold text-ink">{flight.bookingRef}</b></span>
            {/if}
            {#if flight.cost != null}
                <Badge variant="neutral">{formatMoney(flight.cost, flight.currency ?? homeCurrency)}</Badge>
            {/if}
            {#if attachmentCount > 0}
                <span class="inline-flex items-center gap-1">
                    <Paperclip class="size-3.5" aria-hidden="true" />
                    {attachmentCount} file{attachmentCount > 1 ? 's' : ''}
                </span>
            {/if}
            {#if flight.checkInUrl}
                <a
                    href={flight.checkInUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    class="inline-flex items-center gap-1 font-medium text-primary-700 hover:underline [&_svg]:size-3.5"
                >
                    <ExternalLink /> Check in
                </a>
            {/if}
            {#if bookingNotes}
                <span class="w-full text-ink-muted">{bookingNotes}</span>
            {/if}
        </footer>
    {/if}
</article>
