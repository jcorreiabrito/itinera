<script lang="ts">
    import { onMount } from 'svelte';
    import { attachments, reservations, trips } from '$lib/db';
    import type { Reservation, ReservationKind, Trip } from '$lib/db';
    import { BedDouble, Plus } from 'lucide-svelte';
    import { Button, EmptyState, ErrorState, Skeleton, toast } from '$lib/components/ui';
    import { formatWeekdayDate } from '$lib/format';
    import { getTripShellContext } from '$lib/trip-context';
    import { startLive } from '$lib/live';
    import ReservationRow from './ReservationRow.svelte';
    import ReservationSheet from './ReservationSheet.svelte';
    import { buildTimeline, KIND_META, KIND_ORDER } from './kinds';

    interface Props {
        /** Bare trip ULID. */
        tripId: string;
    }

    let { tripId }: Props = $props();

    const shell = getTripShellContext();
    const reloadSignal = shell.reloadSignal;

    let loaded = $state(false);
    let loadError = $state(false);
    let everLoaded = false;
    let trip = $state<Trip | null>(null);
    let resList = $state<Reservation[]>([]);
    let attCounts = $state<Map<string, number>>(new Map());
    let filter = $state<ReservationKind | null>(null);

    let sheetOpen = $state(false);
    let sheetMode = $state<'create' | 'edit'>('create');
    let sheetRes = $state<Reservation | null>(null);

    async function loadAll(tid: string) {
        if (!tid) return;
        try {
            const [t, list, atts] = await Promise.all([
                trips.get(tid),
                reservations.byTrip(tid),
                attachments.byTrip(tid)
            ]);
            trip = t;
            resList = list;
            const counts = new Map<string, number>();
            for (const a of atts) {
                const owner = a.ownerId ?? '';
                counts.set(owner, (counts.get(owner) ?? 0) + 1);
            }
            attCounts = counts;
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
        const tid = tripId;
        void reloadSignal;
        loadAll(tid);
    });

    onMount(() => startLive(() => loadAll(tripId)));

    const homeCurrency = $derived(trip?.homeCurrency ?? 'EUR');
    const timeline = $derived(buildTimeline(resList, filter));
    const kindCounts = $derived(() => {
        const m = new Map<ReservationKind, number>();
        for (const r of resList) if (r.kind) m.set(r.kind, (m.get(r.kind) ?? 0) + 1);
        return m;
    });

    function reload() {
        loadAll(tripId);
    }

    function retry() {
        loadError = false;
        loaded = false;
        loadAll(tripId);
    }

    function toggleFilter(kind: ReservationKind) {
        filter = filter === kind ? null : kind;
    }

    function openAdd() {
        sheetMode = 'create';
        sheetRes = null;
        sheetOpen = true;
    }

    function openEdit(res: Reservation) {
        sheetMode = 'edit';
        sheetRes = res;
        sheetOpen = true;
    }

    async function removeReservation(res: Reservation) {
        try {
            await reservations.softDelete(res._id);
            toast.success('Reservation removed.', {
                action: {
                    label: 'Undo',
                    onClick: async () => {
                        try {
                            await reservations.restore(res._id);
                            reload();
                        } catch {
                            toast.error('Could not undo. Try restoring from Trash.');
                        }
                    }
                }
            });
            reload();
        } catch {
            toast.error('Could not remove the reservation. Try again.');
        }
    }
</script>

{#if !loaded}
    <div class="space-y-4">
        <Skeleton class="h-8 w-44 rounded-md" />
        <Skeleton class="h-24 w-full rounded-lg" />
        <Skeleton class="h-24 w-full rounded-lg" />
        <Skeleton class="h-24 w-full rounded-lg" />
    </div>
{:else if loadError}
    <ErrorState title="Couldn't load reservations" onretry={retry} />
{:else if resList.length === 0}
    <EmptyState
        icon={BedDouble}
        title="No reservations yet"
        description="Hotels, cars, restaurants, activities and transport – one date-sorted timeline, with vouchers attached and viewable offline."
    >
        <Button onclick={openAdd}>
            <Plus class="size-4" /> Add reservation
        </Button>
    </EmptyState>
{:else}
    <!-- Type filter chips: toggle buttons that narrow the chronological model. -->
    <div class="mb-4 flex flex-wrap gap-2" role="group" aria-label="Filter reservations by type">
        <button
            type="button"
            onclick={() => (filter = null)}
            aria-pressed={filter == null}
            class="inline-flex min-h-touch items-center rounded-full border px-3 py-1.5 text-sm font-medium transition-colors ${filter == null ? 'border-primary-600 bg-primary-600 text-white' : 'border-border bg-surface text-ink-muted hover:text-ink'}"
        >
            All
        </button>
        {#each KIND_ORDER as kind (kind)}
            {@const count = kindCounts.get(kind) ?? 0}
            {@const isOn = kind === filter}
            <button
                type="button"
                onclick={() => toggleFilter(kind)}
                aria-pressed={isOn}
                disabled={count === 0}
                class={`inline-flex min-h-touch items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium transition-colors disabled:opacity-40 [&_svg]:size-4 ${isOn ? 'border-primary-600 bg-primary-600 text-white' : 'border-border bg-surface text-ink-muted hover:text-ink'}`}
            >
                <Icon />
                {KIND_META[kind].label}
                {#if count > 0}<span class="tabular-nums opacity-80">{count}</span>{/if}
            </button>
        {/each}
    </div>

    {#if timeline.length === 0}
        <p class="rounded-lg border border-dashed border-border bg-surface-sunken px-4 py-8 text-center text-sm text-ink-muted">
            No {filter ? KIND_META[filter].label.toLowerCase() : ''} reservations
            <button type="button" onclick={() => (filter = null)} class="font-medium text-primary-700 hover:underline">
                Show all
            </button>
        </p>
    {:else}
        <div class="space-y-6">
            {#each timeline as group (group.date ?? 'undated')}
                <section aria-label={group.date ? `Reservations for ${group.date}` : 'Unscheduled reservations'}>
                    <h2 class="mb-2 px-1 text-sm font-semibold text-ink">
                        {group.date ? formatWeekdayDate(group.date) : 'Unscheduled'}
                    </h2>
                    <ul class="space-y-2">
                        {#each group.entries as entry (entry.reservation._id + entry.rowKind)}
                            <ReservationRow
                                reservation={entry.reservation}
                                rowKind={entry.rowKind}
                                {homeCurrency}
                                attachmentCount={attCounts.get(entry.reservation._id) ?? 0}
                                onedit={() => openEdit(entry.reservation)}
                                ondelete={() => removeReservation(entry.reservation)}
                            />
                        {/each}
                    </ul>
                </section>
            {/each}
        </div>
    {/if}
{/if}

<!-- Floating add button -->
{#if loaded && resList.length > 0}
    <button
        type="button"
        onclick={openAdd}
        aria-label="Add reservation"
        class="fixed bottom-20 right-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-primary-600 px-5 text-base font-medium text-white shadow-card transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 focus-visible:ring-offset-2 focus-visible:ring-offset-bg [&_svg]:size-5"
    >
        <Plus />
        <span class="hidden sm:inline">Add reservation</span>
    </button>
{/if}

<ReservationSheet
    bind:open={sheetOpen}
    mode={sheetMode}
    {tripId}
    reservation={sheetRes}
    {homeCurrency}
    onsaved={reload}
/>