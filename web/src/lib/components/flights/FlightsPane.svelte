<script lang="ts">
    import { onMount } from 'svelte';
    import { attachments, flights, trips } from '$lib/db';
    import type { Flight, Trip } from '$lib/db';
    import { Plane, Plus } from 'lucide-svelte';
    import { Button, EmptyState, ErrorState, Skeleton, toast } from '$lib/components/ui';
    import { formatWeekdayDate } from '$lib/format';
    import { getTripShellContext } from '$lib/trip-context';
    import { startLive } from '$lib/live';
    import { t } from '$lib/i18n.svelte';
    import FlightCard from './FlightCard.svelte';
    import FlightSheet from './FlightSheet.svelte';
    import { firstDepart, smartLabels } from './labels';

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
    let flightList = $state<Flight[]>([]);
    let attCounts = $state<Map<string, number>>(new Map());

    let sheetOpen = $state(false);
    let sheetMode = $state<'create' | 'edit'>('create');
    let sheetFlight = $state<Flight | null>(null);

    async function loadAll(tid: string) {
        if (!tid) return;
        try {
            const [t, list, atts] = await Promise.all([
                trips.get(tid),
                flights.byTrip(tid),
                attachments.byTrip(tid)
            ]);
            trip = t;
            flightList = list;
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

    const labels = $derived(smartLabels(flightList));
    const homeCurrency = $derived(trip?.homeCurrency ?? 'EUR');

    function reload() {
        loadAll(tripId);
    }

    function retry() {
        loadError = false;
        loaded = false;
        loadAll(tripId);
    }

    function openAdd() {
        sheetMode = 'create';
        sheetFlight = null;
        sheetOpen = true;
    }

    function openEdit(flight: Flight) {
        sheetMode = 'edit';
        sheetFlight = flight;
        sheetOpen = true;
    }

    async function removeFlight(flight: Flight) {
        try {
            await flights.softDelete(flight._id);
            toast.success(t('flight_removed'), {
                action: {
                    label: t('undo'),
                    onClick: async () => {
                        try {
                            await flights.restore(flight._id);
                            reload();
                        } catch {
                            toast.error(t('could_not_undo'));
                        }
                    }
                }
            });
            reload();
        } catch {
            toast.error(t('flight_removed'));
        }
    }
</script>

{#if !loaded}
    <div class="space-y-4">
        <Skeleton class="h-8 w-32 rounded-md" />
        <Skeleton class="h-40 w-full rounded-lg" />
        <Skeleton class="h-40 w-full rounded-lg" />
        <Skeleton class="h-40 w-full rounded-lg" />
    </div>
{:else if loadError}
    <ErrorState title={t('could_not_load_flights')} onretry={retry} />
{:else if flightList.length === 0}
    <EmptyState
        icon={Plane}
        title={t('no_flights_yet')}
        description={t('no_flights_desc')}
    >
        <Button onclick={openAdd}>
            <Plus class="size-4" /> {t('add_flight_booking')}
        </Button>
    </EmptyState>
{:else}
    <div class="space-y-5">
        {#each flightList as flight, i (flight._id)}
            {@const date = formatWeekdayDate(firstDepart(flight))}
            <section aria-label={labels[i] || `Flight`}>
                <h2 class="mb-1.5 flex items-baseline gap-2 px-1">
                    <span class="text-xs font-semibold uppercase tracking-wide text-primary-700">
                        {labels[i] || `Flight`}
                    </span>
                    {#if date}<span class="text-xs text-ink-muted">{date}</span>{/if}
                </h2>
                <FlightCard
                    {flight}
                    {homeCurrency}
                    attachmentCount={attCounts.get(flight._id) ?? 0}
                    onedit={() => openEdit(flight)}
                    ondelete={() => removeFlight(flight)}
                />
            </section>
        {/each}
    </div>
{/if}

<!-- Floating add button -->
{#if loaded && flightList.length > 0}
    <button
        type="button"
        onclick={openAdd}
        aria-label={t('add_flight_booking')}
        class="fixed bottom-[calc(4.5rem+env(safe-area-inset-bottom,0px))] right-4 z-40 inline-flex h-14 items-center gap-2 rounded-full bg-primary-600 px-5 text-base font-medium text-white shadow-card transition-colors hover:bg-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-600 lg:bottom-8 [&_svg]:size-5"
    >
        <Plus />
        <span class="hidden sm:inline">{t('add_flight_booking')}</span>
    </button>
{/if}

<FlightSheet
    bind:open={sheetOpen}
    mode={sheetMode}
    {tripId}
    flight={sheetFlight}
    {homeCurrency}
    onsaved={reload}
/>
