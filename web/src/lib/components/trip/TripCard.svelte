<script lang="ts">
    import { onMount } from 'svelte';
    import { bareTripUlid, checklist, expenses, todayIso, trips } from '$lib/db';
    import {
        Archive,
        ArchiveRestore,
        Copy,
        ListChecks,
        MoreVertical,
        Map,
        Pencil,
        SquareArrowOutUpRight,
        Trash2,
        CheckCircle2,
        Wallet
    } from 'lucide-svelte';
    import { t } from '$lib/i18n.svelte';
    import { Card, MenuItem, Popover, ProgressBar, Skeleton } from '$lib/components/ui';
    import { flagEmoji, formatDateRange, formatMoney, formatNights } from '$lib/format';
    import { formatDestinationRoute } from '$lib/destinations';
    import StatusBadge from './StatusBadge.svelte';
    import TripCover from './TripCover.svelte';

    interface Props {
        trip: trips.TripWithDerived;
        /** Bumping this re-queries the card's live metrics. */
        reloadKey?: number;
        /** Animation delay for staggered entrance (ms). */
        animationDelay?: number;
        onedit?: () => void;
        onduplicate?: () => void;
        onarchive?: () => void;
        onunarchive?: () => void;
        ondelete?: () => void;
        onstagechange?: (stage: 'planning' | 'confirmed') => void;
    }

    let { trip, reloadKey = 0, animationDelay = 0, onedit, onduplicate, onarchive, onunarchive, ondelete, onstagechange }: Props = $props();

    const today = todayIso();

    let progress = $state<{ done: number; total: number; fraction: number } | null>(null);
    let budget = $state<expenses.BudgetSummary | null>(null);
    let menuOpen = $state(false);
    let cardEl = $state<HTMLDivElement | null>(null);
    let visible = $state(false);

    const href = $derived(`/trip/${bareTripUlid(trip._id)}/overview`);
    const title = $derived(trip.title?.trim() || 'Untitled trip');
    const destinations = $derived(trip.destinations ?? []);
    const firstDestination = $derived(destinations[0]);
    const extraDestinations = $derived(Math.max(0, destinations.length - 1));
    const currency = $derived(budget?.homeCurrency ?? trip.homeCurrency ?? 'EUR');
    const isNearCountdown = $derived(
        trip.derived?.countdown && /^\d+ days?$/.test(trip.derived.countdown) && parseInt(trip.derived.countdown) <= 7
    );

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

    // Trigger progress bar animations when card enters viewport
    onMount(() => {
        if (!cardEl) return;
        const observer = new IntersectionObserver(
            ([entry]) => { if (entry.isIntersecting) { visible = true; observer.disconnect(); } },
            { threshold: 0.2 }
        );
        observer.observe(cardEl);
        return () => observer.disconnect();
    });
</script>

<div bind:this={cardEl}>
<Card
    class="group relative flex flex-col glass-panel hover-lift animate-slide-up {trip.stage === 'planning' ? 'border-dashed border-amber-400/50 dark:border-amber-500/30 ring-1 ring-inset ring-amber-400/20' : ''}"
    style="animation-delay: {animationDelay}ms"
>
    <div class="relative aspect-[3/2] w-full overflow-hidden rounded-t-lg">
        <div class="absolute inset-0 transition-transform duration-500 ease-out group-hover:scale-105">
            <TripCover
                attId={trip.coverImageAttId}
                blob="thumb"
                {title}
                class="absolute inset-0 size-full"
            />
        </div>
        <div
            class="absolute inset-0 bg-gradient-to-t from-ink/75 via-ink/15 to-transparent"
            aria-hidden="true"
        ></div>

        <div class="absolute left-3 top-3">
            <StatusBadge status={trip.derived.status} />
        </div>

        <div class="absolute inset-x-3 bottom-2.5 text-white">
            <h3 class="truncate font-serif text-lg font-semibold drop-shadow-sm text-white">{title}</h3>
            {#if destinations.length > 0}
                <p class="truncate text-sm text-white/85">
                    {formatDestinationRoute(destinations)}
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
            <span class={`shrink-0 text-xs font-medium text-accent-terracotta ${isNearCountdown ? 'animate-pulse-ring rounded px-1' : ''}`}>
                {trip.derived.countdown}
            </span>
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
                        value={visible ? progress.fraction : 0}
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
                        value={visible ? (budget.usedFraction ?? 0) : 0}
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
                    class="grid size-8 place-items-center rounded-full bg-surface/80 text-ink shadow-soft backdrop-blur transition-[colors,transform] duration-200 hover:bg-surface hover:rotate-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600"
                >
                    <MoreVertical class="size-4" />
                </button>
            {/snippet}
            <MenuItem icon={SquareArrowOutUpRight} {href}>{t('open')}</MenuItem>
            <MenuItem icon={Pencil} onclick={() => { menuOpen = false; onedit?.(); }}>{t('edit')}</MenuItem>
            <MenuItem icon={Copy} onclick={() => { menuOpen = false; onduplicate?.(); }}>{t('duplicate')}</MenuItem>
            {#if trip.stage === 'planning'}
                <MenuItem icon={CheckCircle2} onclick={() => { menuOpen = false; onstagechange?.('confirmed'); }}>
                    {t('mark_as_confirmed')}
                </MenuItem>
            {:else}
                <MenuItem icon={Map} onclick={() => { menuOpen = false; onstagechange?.('planning'); }}>
                    {t('mark_as_planning')}
                </MenuItem>
            {/if}
            {#if trip.archived}
                <MenuItem icon={ArchiveRestore} onclick={() => { menuOpen = false; onunarchive?.(); }}>
                    {t('unarchive')}
                </MenuItem>
            {:else}
                <MenuItem icon={Archive} onclick={() => { menuOpen = false; onarchive?.(); }}>
                    {t('archive')}
                </MenuItem>
            {/if}
            <MenuItem icon={Trash2} tone="danger" onclick={() => { menuOpen = false; ondelete?.(); }}>
                {t('delete')}
            </MenuItem>
        </Popover>
    </div>
</Card>
</div>
