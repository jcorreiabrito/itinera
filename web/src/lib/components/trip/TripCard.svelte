<script lang="ts">
    import { bareTripUlid, checklist, expenses, todayIso, trips } from '$lib/db';
    import {
        Archive,
        ArchiveRestore,
        Copy,
        ListChecks,
        MoreVertical,
        Pencil,
        SquareArrowOutUpRight,
        Trash2,
        Wallet
    } from 'lucide-svelte';
    import { Card, MenuItem, Popover, ProgressBar, Skeleton } from '$lib/components/ui';
    import { flagEmoji, formatDateRange, formatMoney, formatNights } from '$lib/format';
    import StatusBadge from './StatusBadge.svelte';
    import TripCover from './TripCover.svelte';

    interface Props {
        trip: trips.TripWithDerived;
        /** Bumping this re-queries the card's live metrics. */
        reloadKey?: number;
        onedit?: () => void;
        onduplicate?: () => void;
        onarchive?: () => void;
        onunarchive?: () => void;
        ondelete?: () => void;
    }

    let { trip, reloadKey = 0, onedit, onduplicate, onarchive, onunarchive, ondelete }: Props = $props();

    const today = todayIso();

    let progress = $state<{ done: number; total: number; fraction: number } | null>(null);
    let budget = $state<expenses.BudgetSummary | null>(null);
    let menuOpen = $state(false);

    const href = $derived(`/trip/${bareTripUlid(trip._id)}/overview`);
    const title = $derived(trip.title?.trim() || 'Untitled trip');
    const destinations = $derived(trip.destinations ?? []);
    const firstDestination = $derived(destinations[0]);
    const extraDestinations = $derived(Math.max(0, destinations.length - 1));
    const currency = $derived(budget?.homeCurrency ?? trip.homeCurrency ?? 'EUR');

    const budgetTone = $derived(
        budget?.usedFraction == null
            ? 'primary'
            : budget.usedFraction > 1
              ? 'danger'
              : budget.usedFraction > 0.85
                ? 'warning'
                : 'success'
    );

    const ariaLabel = $derived(
        [
            title,
            firstDestination?.name,
            formatDateRange(trip.startDate, trip.endDate),
            trip.derived.status,
            progress && progress.total > 0
                ? `${Math.round(progress.fraction * 100)}% packed`
                : undefined
        ]
            .filter(Boolean)
            .join(', ')
    );

    $effect(() => {
        const id = trip._id;
        void reloadKey;
        let active = true;

        (async () => {
            try {
                const [p, b] = await Promise.all([checklist.progress(id), expenses.summary(id, today)]);
                if (!active) return;
                progress = p;
                budget = b;
            } catch {
                /* leave skeletons; a later reload will retry */
            }
        })();

        return () => {
            active = false;
        };
    });
</script>

<Card class="group relative flex flex-col glass-panel transition-shadow hover:shadow-card">
    <div class="relative aspect-[3/2] w-full overflow-hidden rounded-t-lg">
        <TripCover
            attId={trip.coverImageAttId}
            blob="thumb"
            {title}
            class="absolute inset-0 size-full"
        />
        <div
            class="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/15 to-transparent"
            aria-hidden="true"
        ></div>

        <div class="absolute left-3 top-3">
            <StatusBadge status={trip.derived.status} />
        </div>

        <div class="absolute inset-x-3 bottom-2.5 text-white">
            <h3 class="truncate font-serif text-lg font-semibold drop-shadow-sm">{title}</h3>
            {#if firstDestination}
                <p class="truncate text-sm text-white/85">
                    {#if flagEmoji(firstDestination.country)}<span aria-hidden="true">{flagEmoji(firstDestination.country)}</span>{/if}
                    {firstDestination.name}
                    {#if extraDestinations > 0}
                        <span class="text-white/70">+{extraDestinations}</span>
                    {/if}
                </p>
            {/if}
        </div>
    </div>

    <div class="flex flex-1 flex-col gap-3 p-3">
        <div class="flex items-center justify-between gap-2">
            <span class="text-sm text-ink-muted">
                {formatDateRange(trip.startDate, trip.endDate)}
                <span class="text-ink-muted/60">·</span>
                {formatNights(trip.derived.nights)}
            </span>
            <span class="shrink-0 text-xs font-medium text-accent-terracotta">{trip.derived.countdown}</span>
        </div>

        <div class="space-y-2">
            <div class="flex items-center gap-2 text-xs text-ink-muted">
                <ListChecks class="size-3.5 shrink-0" />
                {#if progress == null}
                    <Skeleton class="h-2.5 flex-1" />
                {:else if progress.total > 0}
                    <ProgressBar
                        class="flex-1"
                        size="sm"
                        tone="success"
                        value={progress.fraction}
                        label="Checklist progress"
                    />
                    <span class="shrink-0 font-medium tabular-nums text-ink">
                        {progress.done}/{progress.total}
                    </span>
                {:else}
                    <span class="flex-1">Checklist not started</span>
                {/if}
            </div>

            <div class="flex items-center gap-2 text-xs text-ink-muted">
                <Wallet class="size-3.5 shrink-0" />
                {#if budget == null}
                    <Skeleton class="h-2.5 flex-1" />
                {:else if budget.budgetTotal != null}
                    <ProgressBar
                        class="flex-1"
                        size="sm"
                        tone={budgetTone}
                        value={budget.usedFraction ?? 0}
                        label="Budget used"
                    />
                    <span class="shrink-0 font-medium tabular-nums text-ink">
                        {formatMoney(budget.spent, currency, { compact: true })} /
                        {formatMoney(budget.budgetTotal, currency, { compact: true })}
                    </span>
                {:else}
                    <span class="flex-1">
                        {formatMoney(budget.spent, currency, { compact: true })} spent
                    </span>
                {/if}
            </div>
        </div>
    </div>

    <!-- Stretched link: makes the whole card one focusable target (sits below the menu). -->
    <a href={href} class="absolute inset-1 z-10 rounded-lg" aria-label={`Open trip: ${ariaLabel}`}>
        <span class="sr-only">Open {title}</span>
    </a>

    <div class="absolute right-2 top-2 z-20">
        <Popover bind:open={menuOpen} align="end" label="Actions for {title}">
            {#snippet trigger({ toggle, open })}
                <button
                    type="button"
                    onclick={toggle}
                    aria-label="Actions for {title}"
                    aria-haspopup="true"
                    aria-expanded={open}
                    class="grid size-8 place-items-center rounded-full bg-surface/80 text-ink shadow-soft backdrop-blur transition-colors hover:bg-surface focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                >
                    <MoreVertical class="size-4" />
                </button>
            {/snippet}
            <MenuItem icon={SquareArrowOutUpRight} {href}>Open</MenuItem>
            <MenuItem icon={Pencil} onclick={() => { menuOpen = false; onedit?.(); }}>Edit</MenuItem>
            <MenuItem icon={Copy} onclick={() => { menuOpen = false; onduplicate?.(); }}>Duplicate</MenuItem>
            {#if trip.archived}
                <MenuItem icon={ArchiveRestore} onclick={() => { menuOpen = false; onunarchive?.(); }}>
                    Unarchive
                </MenuItem>
            {:else}
                <MenuItem icon={Archive} onclick={() => { menuOpen = false; onarchive?.(); }}>
                    Archive
                </MenuItem>
            {/if}
            <MenuItem icon={Trash2} tone="danger" onclick={() => { menuOpen = false; ondelete?.(); }}>
                Delete
            </MenuItem>
        </Popover>
    </div>
</Card>