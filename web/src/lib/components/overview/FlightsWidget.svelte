<script lang="ts">
    import { flights as flightsRepo } from '$lib/db';
    import type { Flight } from '$lib/db';
    import { Plane } from 'lucide-svelte';
    import { formatDate } from '$lib/format';
    import { cn } from '$lib/utils';
    import WidgetCard from './WidgetCard.svelte';

    interface Props {
        flights: Flight[];
        nextIndex: number;
        href: string;
    }

    let { flights, nextIndex, href }: Props = $props();

    const shown = $derived(flights.slice(0, 5));
</script>

<WidgetCard title="Flights" icon={Plane} {href} linkLabel="Flights">
    {#if flights.length === 0}
        <p class="text-sm text-ink-muted">
            None yet – <a {href} class="font-medium text-primary-700 hover:underline">add a flight</a>.
        </p>
    {:else}
        <ul class="space-y-1">
            {#each shown as flight, i (flight._id)}
                <li
                    class={cn(
                        'flex items-center justify-between gap-2 rounded-md px-2 py-1.5',
                        i === nextIndex && 'bg-primary-100/60'
                    )}
                >
                    <span class="flex items-center gap-2 text-sm font-medium text-ink">
                        <Plane class="size-3.5 shrink-0 text-primary-700" />
                        {flightsRepo.route(flight) || 'Flight'}
                    </span>
                    <span class="shrink-0 text-xs text-ink-muted">
                        {formatDate(flight.segments?.[0]?.departLocal ?? null)}{#if i === nextIndex} · Next{/if}
                    </span>
                </li>
            {/each}
        </ul>
        {#if flights.length > shown.length}
            <p class="mt-2 text-xs text-ink-muted">{flights.length - shown.length} more</p>
        {/if}
    {/if}
</WidgetCard>
