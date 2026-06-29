<script lang="ts">
    import type { ChecklistItem } from '$lib/db';
    import { dayDelta, todayIso } from '$lib/db/datetime';
    import {
        ArrowDown,
        ArrowRightLeft,
        ArrowUp,
        CalendarClock,
        CalendarDays,
        Info,
        MoreVertical,
        Pencil,
        Star,
        Trash2
    } from 'lucide-svelte';
    import { DateTime } from 'luxon';
    import { Badge, MenuItem, Popover } from '$lib/components/ui';
    import { formatDate } from '$lib/format';
    import { cn } from '$lib/utils';

    interface Props {
        item: ChecklistItem;
        /** Bare trip ULID (for the day-link chip). */
        tripId: string;
        /** Large tap targets for the "To buy" shopping view. */
        large?: boolean;
        canMoveUp?: boolean;
        canMoveDown?: boolean;
        ontoggle: (item: ChecklistItem) => void;
        onedit: (item: ChecklistItem) => void;
        onmoveup?: (item: ChecklistItem) => void;
        onmovedown?: (item: ChecklistItem) => void;
        onmovegroup?: (item: ChecklistItem) => void;
        ondelete: (item: ChecklistItem) => void;
    }

    let {
        item,
        tripId,
        large = false,
        canMoveUp = false,
        canMoveDown = false,
        ontoggle,
        onedit,
        onmoveup,
        onmovedown,
        onmovegroup,
        ondelete
    }: Props = $props();

    let menuOpen = $state(false);
    let noteOpen = $state(false);

    const cbId = $derived(`chk-${item._id}`);

    const dueInfo = $derived.by(() => {
        if (!item.dueDate) return null;
        const delta = dayDelta(todayIso(), item.dueDate);
        const overdue = !item.done && delta < 0;
        const near = !item.done && delta >= 0 && delta <= 3;
        return { label: formatDate(item.dueDate), amber: overdue || near, overdue };
    });

    function dayChipLabel(date: string): string {
        const dt = DateTime.fromISO(date);
        return dt.isValid ? dt.toFormat('ccc d LLL') : date;
    }

    const ariaLabel = $derived.by(() => {
        const parts: string[] = [item.text ?? 'Item'];
        if (item.quantity && item.quantity > 1) parts.push(`quantity ${item.quantity}`);
        if (item.important) parts.push('important');
        if (item.dueDate) parts.push(`due ${formatDate(item.dueDate)}${dueInfo?.overdue ? ', overdue' : ''}`);
        parts.push(item.done ? 'done' : 'not done');
        return parts.join(', ');
    });

    function action(fn?: (item: ChecklistItem) => void) {
        menuOpen = false;
        fn?.(item);
    }
</script>

<li class="border-b border-border/60 last:border-b-0">
    <div class="flex items-start gap-2.5 py-1.5">
        <input
            id={cbId}
            type="checkbox"
            checked={item.done}
            onchange={() => ontoggle(item)}
            aria-label={ariaLabel}
            class={cn(
                'mt-0.5 shrink-0 rounded border-border text-primary-600 focus:ring-2 focus:ring-primary-600/30',
                large ? 'size-6' : 'size-5'
            )}
        />
        <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-center gap-x-2 gap-y-1">
                <label
                    for={cbId}
                    class={cn(
                        'cursor-pointer font-medium',
                        large ? 'text-base' : 'text-sm',
                        item.done ? 'text-ink-muted line-through' : 'text-ink'
                    )}
                >
                    {item.text ?? 'Untitled'}
                </label>
                {#if item.important}
                    <Star class="size-4 shrink-0 fill-accent-amber text-accent-amber" aria-label="Important" />
                {/if}
                {#if item.quantity && item.quantity > 1}
                    <Badge variant="neutral" class="tabular-nums">{item.quantity}</Badge>
                {/if}
                {#if dueInfo}
                    <Badge variant={dueInfo.amber ? 'warning' : 'neutral'}>
                        <CalendarClock class="size-3" />
                        {dueInfo.overdue ? 'Overdue' : 'Due'} {dueInfo.label}
                    </Badge>
                {/if}
                {#if item.date}
                    <a href={`/trip/${tripId}/itinerary?date=${item.date}`} class="inline-flex">
                        <Badge variant="primary"><CalendarDays class="size-3" /> {dayChipLabel(item.date)}</Badge>
                    </a>
                {/if}
                {#if item.note}
                    <button
                        type="button"
                        onclick={() => (noteOpen = !noteOpen)}
                        aria-expanded={noteOpen}
                        aria-label={noteOpen ? 'Hide note' : 'Show note'}
                        class="inline-flex items-center gap-1 rounded-full border border-border bg-surface-sunken px-2 py-0.5 text-xs"
                    >
                        <Info />
                        Note
                    </button>
                {/if}
            </div>
            {#if noteOpen && item.note}
                <p class="mt-1 whitespace-pre-wrap text-sm text-ink-muted">{item.note}</p>
            {/if}
        </div>

        <Popover bind:open={menuOpen} label="Item actions">
            {#snippet trigger({ toggle, open })}
                <button
                    type="button"
                    onclick={toggle}
                    aria-label="Item actions"
                    aria-haspopup="true"
                    aria-expanded={open}
                    class="grid size-8 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken"
                >
                    <MoreVertical />
                </button>
            {/snippet}
            <MenuItem icon={Pencil} onclick={() => action(onedit)}>Edit</MenuItem>
            <MenuItem icon={ArrowUp} disabled={!canMoveUp} onclick={() => action(onmoveup)}>Move up</MenuItem>
            <MenuItem icon={ArrowDown} disabled={!canMoveDown} onclick={() => action(onmovedown)}>
                Move down
            </MenuItem>
            <MenuItem icon={ArrowRightLeft} onclick={() => action(onmovegroup)}>Move to group...</MenuItem>
            <MenuItem icon={Trash2} tone="danger" onclick={() => action(ondelete)}>Delete</MenuItem>
        </Popover>
    </div>
</li>