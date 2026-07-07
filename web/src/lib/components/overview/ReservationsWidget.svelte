<script lang="ts">
    import type { Reservation } from '$lib/db';
    import type { ReservationSummary } from '$lib/overview';
    import { BedDouble } from 'lucide-svelte';
    import { formatDate, relativeTime } from '$lib/format';
    import WidgetCard from './WidgetCard.svelte';

    interface Props {
        summary: ReservationSummary;
        reservations: Reservation[];
        href: string;
    }

    let { summary, reservations, href }: Props = $props();

    const KIND_LABEL: Record<string, [string, string]> = {
        lodging: ['hotel', 'hotels'],
        car: ['car', 'cars'],
        restaurant: ['restaurant', 'restaurants'],
        activity: ['activity', 'activities'],
        transport: ['transfer', 'transfers'],
        other: ['booking', 'bookings']
    };

    const countsLabel = $derived(
        summary.counts
            .map((c) => {
                const labels = KIND_LABEL[c.kind] ?? KIND_LABEL.other;
                return `${c.count} ${labels[c.count === 1 ? 0 : 1]}`;
            })
            .join(', ')
    );

    const shown = $derived(reservations.slice(0, 5));
</script>

<WidgetCard title="Reservations" icon={BedDouble} {href} linkLabel="Reservations">
    {#if summary.total === 0}
        <p class="text-sm text-ink-muted">
            None yet – <a {href} class="font-medium text-primary-700 hover:underline">add a booking</a>.
        </p>
    {:else}
        <p class="text-sm font-medium text-ink">{countsLabel}</p>
        {#if summary.nextCheckIn}
            <p class="mt-1 text-xs text-ink-muted">
                Next check-in: {summary.nextCheckIn.reservation.name ?? 'Reservation'}, 
                {formatDate(summary.nextCheckIn.whenIso)} ({relativeTime(summary.nextCheckIn.whenIso)})
            </p>
        {/if}
        <ul class="mt-3 space-y-1.5">
            {#each shown as res (res._id)}
                <li class="flex items-center justify-between gap-2 text-sm">
                    <span class="truncate text-ink">{res.name ?? 'Reservation'}</span>
                    <span class="shrink-0 text-xs text-ink-muted">
                        {res.start ? formatDate(res.start) : ''}
                    </span>
                </li>
            {/each}
        </ul>
    {/if}
</WidgetCard>