<script lang="ts">
    import type { NextUpEntry, NextUpKind } from '$lib/overview';
    import type { IconComponent } from '$lib/types';
    import { BedDouble, CalendarClock, CalendarDays, MapPin, Plane } from 'lucide-svelte';
    import { formatTime, formatWeekdayDate, relativeTime } from '$lib/format';
    import WidgetCard from './WidgetCard.svelte';

    interface Props {
        nextUp: NextUpEntry | null;
        href: string;
    }

    let { nextUp, href }: Props = $props();

    const Icons: Record<NextUpKind, IconComponent> = {
        item: CalendarDays,
        flight: Plane,
        reservation: BedDouble
    };
</script>

<WidgetCard title="Next up" icon={CalendarClock} {href} linkLabel="Itinerary">
    {#if nextUp}
        {@const Icon = Icons[nextUp.kind]}
        <div class="flex items-start gap-3">
            <div
                class="grid size-9 shrink-0 place-items-center rounded-full bg-primary-100 text-primary-700 [&_svg]:size-4"
                aria-hidden="true"
            >
                <Icon />
            </div>
            <div class="min-w-0">
                <p class="truncate font-medium text-ink">{nextUp.title}</p>
                <p class="text-sm text-ink-muted">
                    {relativeTime(nextUp.whenIso)} · {formatWeekdayDate(nextUp.date)}{#if formatTime(nextUp.whenIso)}
                        {formatTime(nextUp.whenIso)}
                    {/if}
                </p>
                {#if nextUp.location}
                    <p class="mt-0.5 flex items-center gap-1 text-sm text-ink-muted">
                        <MapPin class="size-3.5 shrink-0" />
                        <span class="truncate">{nextUp.location}</span>
                    </p>
                {/if}
            </div>
        </div>
    {:else}
        <p class="text-sm text-ink-muted">Nothing scheduled yet.</p>
    {/if}
</WidgetCard>