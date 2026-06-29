<script lang="ts">
    import { itinerary } from '$lib/db';
    import type { IconComponent } from '$lib/types';
    import { BedDouble, CalendarDays, MapPin, Plane, Sun } from 'lucide-svelte';
    import { describeTimelineEntry, entryTimeLabel, type NextUpKind } from '$lib/overview';
    import WidgetCard from './WidgetCard.svelte';

    interface Props {
        day: itinerary.DayTimeline | null;
        href: string;
    }

    let { day, href }: Props = $props();

    const Icons: Record<NextUpKind, IconComponent> = {
        item: CalendarDays,
        flight: Plane,
        reservation: BedDouble
    };

    const isEmpty = $derived(day || (day.allDay.length === 0 && day.timed.length === 0));
</script>

<WidgetCard title="Today's plan" icon={Sun} {href} linkLabel="Itinerary">
    {#if !day || isEmpty}
        <p class="text-sm text-ink-muted">Nothing planned for today.</p>
    {:else}
        <ul class="space-y-2.5">
            {#each day.allDay as item (item._id)}
                <li class="flex items-center gap-3">
                    <span class="w-12 shrink-0 text-xs font-medium uppercase text-ink-muted">All day</span>
                    <CalendarDays class="size-4 shrink-0 text-primary-700" />
                    <span class="truncate text-sm text-ink">{item.title ?? 'Untitled'}</span>
                </li>
            {/each}
            {#each day.timed as entry, i (entry)}
                {@const info = describeTimelineEntry(entry)}
                {@const Icon = Icons[info.kind]}
                <li class="flex items-center gap-3">
                    <span class="w-12 shrink-0 text-xs font-medium tabular-nums text-ink-muted">
                        {entryTimeLabel(entry.minutes) || '—'}
                    </span>
                    <Icon class="size-4 shrink-0 text-primary-700" />
                    <span class="min-w-0 flex-1 truncate text-sm text-ink">{info.title}</span>
                    {#if info.location}
                        <span class="hidden items-center gap-1 text-xs text-ink-muted sm:flex">
                            <MapPin class="size-3" />
                            <span class="max-w-[8rem] truncate">{info.location}</span>
                        </span>
                    {/if}
                </li>
            {/each}
        </ul>
    {/if}
</WidgetCard>