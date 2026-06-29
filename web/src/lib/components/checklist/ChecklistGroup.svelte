<script lang="ts">
    import { checklist } from '$lib/db';
    import type { ChecklistItem } from '$lib/db';
    import { CheckCheck, ChevronDown, Plus } from 'lucide-svelte';
    import { Button, Input, ProgressBar, toast } from '$lib/components/ui';
    import { cn } from '$lib/utils';
    import ChecklistItemRow from './ChecklistItemRow.svelte';

    interface Props {
        group: checklist.ChecklistGroupView;
        /** Bare trip ULID. */
        tripId: string;
        /** Whether completed items are currently hidden (affects the "all done" note). */
        hideCompleted?: boolean;
        onedit: (item: ChecklistItem) => void;
        onmovegroup: (item: ChecklistItem) => void;
        onchanged: () => void;
    }

    let { group, tripId, hideCompleted = false, onedit, onmovegroup, onchanged }: Props = $props();

    let open = $state(true);
    let qText = $state('');
    let qSaving = $state(false);

    const fraction = $derived(group.total ? group.done / group.total : 0);
    const allDone = $derived(group.total > 0 && group.done === group.total);

    async function toggle(item: ChecklistItem) {
        try {
            await checklist.toggle(item._id);
            onchanged();
        } catch {
            toast.error('Could not update the item.');
        }
    }

    async function remove(item: ChecklistItem) {
        try {
            await checklist.softDelete(item._id);
            onchanged();
        } catch {
            toast.error('Could not remove the item.');
        }
    }

    async function checkAll() {
        try {
            await checklist.checkAllInGroup(tripId, group.group);
            onchanged();
        } catch {
            toast.error('Could not check all items.');
        }
    }

    async function quickAdd() {
        const text = qText.trim();
        if (!text) return;
        qSaving = true;
        try {
            await checklist.create(tripId, { text, group: group.group });
            qText = '';
            onchanged();
        } catch {
            toast.error('Could not add the item.');
        } finally {
            qSaving = false;
        }
    }

    // --- Reorder within the same importance cluster -------------------------
    function siblingIds(item: ChecklistItem): string[] {
        return group.items.filter((i) => !!i.important === !!item.important).map((i) => i._id);
    }

    function canMove(item: ChecklistItem, dir: 'up' | 'down'): boolean {
        const sib = siblingIds(item);
        const i = sib.indexOf(item._id);
        if (i < 0) return false;
        return dir === 'up' ? i > 0 : i < sib.length - 1;
    }

    async function move(item: ChecklistItem, dir: 'up' | 'down') {
        const sib = siblingIds(item);
        const i = sib.indexOf(item._id);
        const j = dir === 'up' ? i - 1 : i + 1;
        if (j < 0 || j >= sib.length) return;
        const all = group.items.map((it) => it._id);
        const ai = all.indexOf(sib[i]);
        const aj = all.indexOf(sib[j]);
        if (ai < 0 || aj < 0) return;
        [all[ai], all[aj]] = [all[aj], all[ai]];
        try {
            await checklist.reorderWithinGroup(all);
            onchanged();
        } catch {
            toast.error('Could not reorder. Try again.');
        }
    }

    const panelId = $derived(`group-panel-${group.group.replace(/\s+/g, '-')}`);
</script>

<section class="overflow-hidden rounded-lg border border-border bg-surface">
    <div class="flex items-center gap-2 px-2 pr-3">
        <button
            type="button"
            onclick={() => (open = !open)}
            aria-expanded={open}
            aria-controls={panelId}
            class="flex min-h-touch flex-1 items-center gap-2.5 rounded-md px-1.5 py-2 text-left"
        >
            <ChevronDown class={cn('size-4 shrink-0 text-ink-muted transition-transform', !open && '-rotate-90')} />
            <span class="font-serif text-base font-semibold text-ink">{group.group}</span>
            <span class="text-sm tabular-nums text-ink-muted">{group.done}/{group.total}</span>
            <span class="ml-auto flex w-16 sm:w-24">
                <ProgressBar
                    value={fraction}
                    tone={allDone ? 'success' : 'primary'}
                    size="sm"
                    label={`${group.group} progress`}
                />
            </span>
        </button>
        {#if group.done < group.total}
            <button
                type="button"
                onclick={checkAll}
                aria-label={`Check all in ${group.group}`}
                title="Check all"
                class="grid size-9 shrink-0 place-items-center rounded-md text-ink-muted transition-colors hover:bg-surface-sunken"
            >
                <CheckCheck />
            </button>
        {/if}
    </div>

    {#if open}
        <div id={panelId} class="px-3 pb-3">
            {#if group.items.length > 0}
                <ul class="border-t border-border">
                    {#each group.items as item (item._id)}
                        <ChecklistItemRow
                            {item}
                            {tripId}
                            canMoveUp={canMove(item, 'up')}
                            canMoveDown={canMove(item, 'down')}
                            ontoggle={toggle}
                            {onedit}
                            onmoveup={(i) => move(i, 'up')}
                            onmovedown={(i) => move(i, 'down')}
                            {onmovegroup}
                            ondelete={remove}
                        />
                    {/each}
                </ul>
            {:else if hideCompleted && allDone}
                <p class="border-t border-border py-3 text-sm text-success">All checked off in this group.</p>
            {/if}

            <form
                class="mt-2.5 flex items-center gap-2"
                onsubmit={(e) => {
                    e.preventDefault();
                    quickAdd();
                }}
            >
                <label for={`add-${panelId}`} class="sr-only">Add an item to {group.group}</label>
                <Input
                    id={`add-${panelId}`}
                    class="h-10 flex-1"
                    value={qText}
                    placeholder="Add an item..."
                    oninput={(e) => (qText = e.currentTarget.value)}
                />
                <Button type="submit" variant="secondary" size="sm" disabled={qSaving || !qText.trim()}>
                    <Plus class="size-4" />
                    Add
                </Button>
            </form>
        </div>
    {/if}
</section>